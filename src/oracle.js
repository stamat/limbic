import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

// Every LLM touch in limbic goes through this file — one boundary to audit,
// one place where "degrade honestly" is enforced. The oracle answers two
// question shapes and nothing else; on any failure (no binary, timeout,
// unparseable output, cap reached) it returns null and the caller keeps its
// deterministic answer. It never throws across the boundary.
//
// Calls ride `claude -p --model haiku` under subscription auth and cost plan
// usage: batched (BATCH items per call), capped per run, and cached forever —
// the same question is never paid for twice. LIMBIC_ORACLE guards recursion:
// a spawned claude that somehow re-enters limbic sees the flag and refuses.

const BATCH = 20
const TIMEOUT = 120000
// Cache keys carry the instruction version: a cached verdict answers one
// exact question, and improving the prompt silently reusing old answers is
// cache poisoning — the first audit nearly shipped it.
const CLASSIFY_V = 2
const PAIRS_V = 1

export function defaultCachePath () {
  return join(homedir(), '.limbic', 'cache', 'oracle.jsonl')
}

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 24)

export class Oracle {
  constructor ({ maxCalls = 60, cachePath = defaultCachePath(), execFn = null } = {}) {
    this.maxCalls = maxCalls
    this.cachePath = cachePath
    this.exec = execFn ?? (async (prompt) => {
      const { stdout } = await promisify(execFile)(
        'claude', ['-p', '--model', 'haiku', prompt],
        { timeout: TIMEOUT, env: { ...process.env, LIMBIC_ORACLE: '1' } }
      )
      return stdout
    })
    this.calls = 0
    this.cacheHits = 0
    this.cache = null
  }

  async loadCache () {
    this.cache = new Map()
    try {
      const raw = await readFile(this.cachePath, 'utf8')
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        try {
          const { key, verdict } = JSON.parse(line)
          this.cache.set(key, verdict)
        } catch {}
      }
    } catch {}
  }

  async remember (key, verdict) {
    this.cache.set(key, verdict)
    await mkdir(dirname(this.cachePath), { recursive: true })
    await appendFile(this.cachePath, JSON.stringify({ key, verdict }) + '\n')
  }

  // items: [{ context, text }] → labels or null per item.
  // The instruction pins precision over recall on purpose — the oracle exists
  // because regex recall was too low, but a poisoned label still costs more
  // than a missed one.
  async classify (items) {
    if (process.env.LIMBIC_ORACLE) return items.map(() => null)
    if (this.cache === null) await this.loadCache()
    const out = new Array(items.length).fill(null)
    const pending = []
    items.forEach((item, i) => {
      const key = `c${CLASSIFY_V}:` + hash(`${item.context ?? ''}\n${item.text}`)
      if (this.cache.has(key)) {
        out[i] = this.cache.get(key)
        this.cacheHits++
      } else {
        pending.push({ i, key, item })
      }
    })

    for (let b = 0; b < pending.length; b += BATCH) {
      if (this.calls >= this.maxCalls) break
      const batch = pending.slice(b, b + BATCH)
      const prompt = [
        'You label user messages sent to an AI coding agent. For each item, PREV is what the agent last said or did; USER is the user\'s reply.',
        'Labels: correction (user says prior work or understanding was wrong), fix_request (user reports delivered work broken or not working), challenge (user questions or complains about a decision or quality of delivered work), neutral (anything else: new tasks, questions, information).',
        'A question exploring options, weighing a design, or asking advice is neutral even when it concerns existing work — challenge requires the user pushing back, not thinking aloud.',
        'Precision over recall: when unsure, neutral.',
        `Reply with ONLY a JSON array of ${batch.length} strings, the labels in order.`,
        '',
        ...batch.map(({ item }, n) => `#${n} PREV: ${(item.context ?? '(none)').slice(0, 250)}\n#${n} USER: ${item.text.slice(0, 250)}\n`)
      ].join('\n')
      const labels = await this.ask(prompt, batch.length, ['correction', 'fix_request', 'challenge', 'neutral'])
      if (!labels) continue
      for (let n = 0; n < batch.length; n++) {
        out[batch[n].i] = labels[n]
        await this.remember(batch[n].key, labels[n])
      }
    }
    return out
  }

  // pairs: [{ a, b }] (event texts) → true/false/null per pair.
  async samePairs (pairs) {
    if (process.env.LIMBIC_ORACLE) return pairs.map(() => null)
    if (this.cache === null) await this.loadCache()
    const out = new Array(pairs.length).fill(null)
    const pending = []
    pairs.forEach((p, i) => {
      const key = `p${PAIRS_V}:` + hash([p.a, p.b].sort().join('\n'))
      if (this.cache.has(key)) {
        out[i] = this.cache.get(key)
        this.cacheHits++
      } else {
        pending.push({ i, key, p })
      }
    })

    for (let b = 0; b < pending.length; b += BATCH) {
      if (this.calls >= this.maxCalls) break
      const batch = pending.slice(b, b + BATCH)
      const prompt = [
        'Each item has two user corrections of an AI coding agent. Answer whether they complain about the SAME underlying mistake (yes) or different mistakes (no).',
        'Same mistake means a single rule could prevent both. When unsure, no.',
        `Reply with ONLY a JSON array of ${batch.length} strings, "yes" or "no", in order.`,
        '',
        ...batch.map(({ p }, n) => `#${n} A: ${p.a.slice(0, 200)}\n#${n} B: ${p.b.slice(0, 200)}\n`)
      ].join('\n')
      const answers = await this.ask(prompt, batch.length, ['yes', 'no'])
      if (!answers) continue
      for (let n = 0; n < batch.length; n++) {
        const v = answers[n] === 'yes'
        out[batch[n].i] = v
        await this.remember(batch[n].key, v)
      }
    }
    return out
  }

  // Model output is hostile input: fenced, prefixed, truncated, or lying about
  // length. Anything not exactly an array of allowed values at the expected
  // length is a null batch, never a partial guess.
  async ask (prompt, expected, allowed) {
    this.calls++
    let stdout
    try {
      stdout = await this.exec(prompt)
    } catch {
      return null
    }
    const m = stdout.match(/\[[\s\S]*?\]/)
    if (!m) return null
    let arr
    try {
      arr = JSON.parse(m[0])
    } catch {
      return null
    }
    if (!Array.isArray(arr) || arr.length !== expected) return null
    const cleaned = arr.map(v => String(v).toLowerCase().trim())
    return cleaned.every(v => allowed.includes(v)) ? cleaned : null
  }
}
