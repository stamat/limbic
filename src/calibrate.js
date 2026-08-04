import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { classify } from './classify.js'
import { markRephrases } from './detect.js'
import { listSessionFiles, parseSession } from './transcript.js'

// The calibration harness i2 runs on: a hand-labeled corpus rebuilt as a
// plain JSONL file (the v0 audit was worked through by hand but never
// persisted — found during i1), and scoring that follows the judge-reliability
// protocol instead of flattering itself: Cohen's κ as the headline, never raw
// percent agreement (published deflation: "85% agreement" ≈ κ 0.48); repeat
// runs on a fresh cache each time, because cached verdicts fake perfect
// consistency; item order shuffled between runs, because position bias
// survives high test-retest. Sources annotated in SOURCES.md.

export function defaultCorpusPath () {
  return join(homedir(), '.limbic', 'corpus', 'labels.jsonl')
}

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)

// Sampling quotas per cascade label: precision needs the positives sampled,
// recall needs the neutrals — a corpus of confirmed corrections alone can
// only ever flatter precision.
const QUOTA = { correction: 15, fix_request: 15, challenge: 15, rephrase: 10, accept: 10, neutral: 60 }

export async function readCorpus (corpusPath = defaultCorpusPath()) {
  const out = []
  let raw
  try {
    raw = await readFile(corpusPath, 'utf8')
  } catch {
    return out
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {}
  }
  return out
}

// Stratified sample into the corpus file: append-only, id-keyed, newest first
// within each stratum. Sampling reads transcripts, not the ledger — the ledger
// deliberately never stored the previous assistant turn (it is not a
// transcript store), and the oracle layer cannot be scored without it. Each
// sampled item freezes every classifier input: text, previous prompt,
// previous-assistant context. `human` starts null — the user fills it in by
// editing the file; that hand is the ground truth everything is scored against.
export async function sampleCorpus ({ projectsDir, corpusPath = defaultCorpusPath(), quota = QUOTA }) {
  const existing = new Set((await readCorpus(corpusPath)).map(c => c.id))
  const candidates = []
  for (const f of await listSessionFiles(projectsDir)) {
    let session
    try {
      session = await parseSession(f.path)
    } catch {
      continue
    }
    const labeled = session.prompts.map(p => ({ ...p, ...classify(p.text) }))
    markRephrases(labeled)
    labeled.forEach((p, i) => {
      candidates.push({
        p,
        project: f.project,
        prevPrompt: i > 0 ? labeled[i - 1].text : null
      })
    })
  }
  candidates.sort((a, b) => String(b.p.ts ?? '').localeCompare(String(a.p.ts ?? '')))

  const added = []
  const taken = {}
  for (const { p, project, prevPrompt } of candidates) {
    const label = p.label
    if (!(label in quota)) continue
    taken[label] ??= 0
    if (taken[label] >= quota[label]) continue
    const id = hash(`${p.text}\n${p.ts ?? ''}`)
    if (existing.has(id)) continue
    taken[label]++
    existing.add(id)
    added.push({
      id,
      ts: p.ts ?? null,
      project,
      cascade: label,
      text: p.text.slice(0, 300),
      prevPrompt: prevPrompt ? prevPrompt.slice(0, 300) : null,
      context: p.context ? p.context.slice(0, 250) : null,
      human: null
    })
  }
  if (added.length) {
    await mkdir(dirname(corpusPath), { recursive: true })
    await appendFile(corpusPath, added.map(c => JSON.stringify(c)).join('\n') + '\n')
  }
  return { added: added.length, total: existing.size }
}

// The full cascade over labeled corpus items, batched the way replay batches:
// deterministic first, then oracle classify on neutral-with-context items,
// then validation on the positives. Returns final labels aligned to items.
export async function cascadeLabels (items, oracle = null) {
  const labels = items.map(deterministicLabel)
  if (!oracle) return labels
  const backlog = []
  items.forEach((item, i) => {
    if (labels[i] === 'neutral' && item.context) backlog.push({ i, context: item.context, text: item.text })
  })
  const verdicts = await oracle.classify(backlog)
  const upgraded = []
  backlog.forEach((b, n) => {
    if (verdicts[n] && verdicts[n] !== 'neutral') upgraded.push({ i: b.i, label: verdicts[n], context: b.context, text: b.text })
  })
  const checks = await oracle.validate(upgraded.map(u => ({ context: u.context, text: u.text })))
  upgraded.forEach((u, n) => {
    if (checks[n] !== false) labels[u.i] = u.label
  })
  return labels
}

export function kappa (a, b) {
  if (a.length !== b.length || !a.length) return 0
  const labels = [...new Set([...a, ...b])]
  const n = a.length
  let agree = 0
  for (let i = 0; i < n; i++) if (a[i] === b[i]) agree++
  const po = agree / n
  let pe = 0
  for (const l of labels) {
    const pa = a.filter(x => x === l).length / n
    const pb = b.filter(x => x === l).length / n
    pe += pa * pb
  }
  if (pe === 1) return 1
  return (po - pe) / (1 - pe)
}

// The deterministic half of the cascade, replayed on a frozen corpus item
// exactly as replay composes it: regex first, rephrase against the previous
// prompt only when regex stayed neutral.
export function deterministicLabel (item) {
  const cur = { text: item.text, ...classify(item.text) }
  if (cur.label !== 'neutral' || !item.prevPrompt) return cur.label
  const prev = { text: item.prevPrompt, ...classify(item.prevPrompt) }
  return markRephrases([prev, cur])[1].label
}

// Score labeled corpus items against a labeling function. Returns κ, raw
// agreement (reported beside κ, never instead of it), per-label precision
// and recall, and the confusion pairs that were wrong.
export async function score (items, labelFn) {
  const human = []
  const got = []
  const wrong = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const g = await labelFn(item, i)
    human.push(item.human)
    got.push(g)
    if (g !== item.human) wrong.push({ id: item.id, human: item.human, got: g, text: item.text.slice(0, 80) })
  }
  const labels = [...new Set(human)]
  const perLabel = {}
  for (const l of labels) {
    const tp = human.filter((h, i) => h === l && got[i] === l).length
    const fp = got.filter((g, i) => g === l && human[i] !== l).length
    const fn = human.filter((h, i) => h === l && got[i] !== l).length
    perLabel[l] = {
      precision: tp + fp ? tp / (tp + fp) : null,
      recall: tp + fn ? tp / (tp + fn) : null,
      n: tp + fn
    }
  }
  const agree = human.filter((h, i) => h === got[i]).length / human.length
  return { n: items.length, kappa: kappa(human, got), agreement: agree, perLabel, wrong }
}

// Repeat-consistency for the oracle layer: each run gets a FRESH cache path
// and a differently shuffled item order — a cached verdict or a fixed order
// would report perfect consistency while measuring nothing. Returns κ between
// every run pair. Shuffling uses a seeded LCG: reproducible, no Math.random.
export function shuffled (items, seed) {
  const out = [...items]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 48271) % 2147483647
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function freshCachePath (run) {
  return join(tmpdir(), `limbic-calibrate-${process.pid}-${run}`, 'cache.jsonl')
}
