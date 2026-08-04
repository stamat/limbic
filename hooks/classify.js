#!/usr/bin/env node
// UserPromptSubmit hook: classify the incoming prompt (regex only — the
// oracle never runs in a hook's hot path; semantic upgrades happen offline in
// replay/dream) and append the event to the live ledger. Exit 0 always, fast:
// a memory tool that delays or blocks a prompt is worse than no memory tool.
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { classify } from '../src/classify.js'
import { momentary, CORRECTIVE } from '../src/surprise.js'

if (process.env.LIMBIC_ORACLE) process.exit(0)

try {
  const input = JSON.parse(await readFile(0, 'utf8'))
  const text = (input.prompt ?? '').trim()
  if (text) {
    const { label, cue } = classify(text)
    const dir = join(homedir(), '.limbic')
    const statePath = join(dir, 'live-state.json')
    let state = {}
    try { state = JSON.parse(await readFile(statePath, 'utf8')) } catch {}
    const sid = input.session_id ?? 'unknown'
    const corrective = CORRECTIVE.has(label)
    const chain = corrective ? (state.sessionId === sid ? (state.chain ?? 0) + 1 : 1) : 0
    await mkdir(dirname(statePath), { recursive: true })
    await writeFile(statePath, JSON.stringify({ sessionId: sid, chain }))

    // Score the standing prediction, if the opt-in predict hook left one:
    // crude token overlap is enough for a hit/miss ledger — calibration of
    // this signal is itself the experiment (ROADMAP v0.4 gate).
    let prediction = null
    try {
      const p = JSON.parse(await readFile(join(dir, 'prediction.json'), 'utf8'))
      if (p.sessionId === sid && Array.isArray(p.predictions)) {
        const words = new Set(text.toLowerCase().split(/\s+/))
        const overlap = (s) => {
          const w = String(s).toLowerCase().split(/\s+/)
          return w.filter(x => words.has(x)).length / Math.max(w.length, 1)
        }
        const best = Math.max(...p.predictions.map(overlap))
        prediction = { hit: best >= 0.5, score: Number(best.toFixed(2)) }
      }
    } catch {}
    await appendFile(join(dir, 'live-ledger.jsonl'), JSON.stringify({
      ts: new Date().toISOString(),
      project: input.cwd ?? null,
      sessionId: sid,
      label,
      cue,
      chain,
      surprise: corrective ? momentary(chain) : 0,
      prediction,
      text: text.slice(0, 300)
    }) + '\n')
  }
} catch {}
process.exit(0)
