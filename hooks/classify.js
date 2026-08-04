#!/usr/bin/env node
// UserPromptSubmit hook: classify the incoming prompt (regex only — the
// oracle never runs in a hook's hot path; semantic upgrades happen offline in
// replay/dream) and append the event to the live ledger. Exit 0 always, fast:
// a memory tool that delays or blocks a prompt is worse than no memory tool.
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
// Stdin is fd 0, and the promises readFile refuses fds — the sync one reads
// them. Every hook read stdin the promises way once, threw, and exited 0
// silently: three hooks dead on arrival, caught by the first hook test.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { classify } from '../src/classify.js'
import { momentary, CORRECTIVE } from '../src/surprise.js'

if (process.env.LIMBIC_ORACLE) process.exit(0)

try {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const text = (input.prompt ?? '').trim()
  if (text) {
    const { label, cue } = classify(text)
    const dir = join(homedir(), '.limbic')
    const statePath = join(dir, 'live-state.json')
    let state = {}
    try { state = JSON.parse(await readFile(statePath, 'utf8')) } catch {}
    // Chains are per-session: parallel Claude Code panes are normal, and a
    // single shared counter reset on every interleaved prompt. Bounded at 50
    // sessions, oldest dropped — insertion order is the eviction order.
    if (typeof state.sessions !== 'object' || state.sessions === null) state = { sessions: {} }
    const sid = input.session_id ?? 'unknown'
    const corrective = CORRECTIVE.has(label)
    const chain = corrective ? (state.sessions[sid] ?? 0) + 1 : 0
    delete state.sessions[sid]
    state.sessions[sid] = chain
    const keys = Object.keys(state.sessions)
    for (const k of keys.slice(0, Math.max(0, keys.length - 50))) delete state.sessions[k]
    await mkdir(dirname(statePath), { recursive: true })
    await writeFile(statePath, JSON.stringify(state))

    // Score the standing prediction, if the opt-in predict hook left one:
    // crude token overlap is enough for a hit/miss ledger — calibration of
    // this signal is itself the experiment (ROADMAP v0.4 gate). A scored
    // prediction is consumed: an interrupted turn must not leave a stale
    // prediction rescoring against every later prompt and biasing hit-rate.
    let prediction = null
    try {
      const predictionPath = join(dir, 'prediction.json')
      const p = JSON.parse(await readFile(predictionPath, 'utf8'))
      if (p.sessionId === sid && Array.isArray(p.predictions) && p.predictions.length) {
        const words = new Set(text.toLowerCase().split(/\s+/))
        const overlap = (s) => {
          const w = String(s).toLowerCase().split(/\s+/)
          return w.filter(x => words.has(x)).length / Math.max(w.length, 1)
        }
        const best = Math.max(...p.predictions.map(overlap))
        prediction = { hit: best >= 0.5, score: Number(best.toFixed(2)) }
        await rm(predictionPath, { force: true })
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
