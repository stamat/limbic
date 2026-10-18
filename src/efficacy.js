import { tokens, jaccard, AUTO } from './cluster.js'
import { LESSON, BEHAVIORAL } from './surprise.js'

// Did a rule work? For each accepted rule: how often a lesson like its
// evidence came up before the day it was accepted and after, per 1000
// prompts. Like is lexical — AUTO, the overlap that pairs two events with no
// oracle — so a rule only sees the mistake in words close to the ones that
// taught it. A falling rate is evidence, never proof: the user may only have
// stopped working where the mistake lives.

// Fewer prompts than this after acceptance and the after-rate is noise: one
// recurrence in 50 prompts reads as 20 per 1000.
export const MIN_AFTER = 200

// History a rule must run before efficacy names its fate: about three weeks
// of prompts at the 2026 pace (3606 in ten weeks). Below it the rule keeps
// running and is watched.
export const SETTLE = 1000

// A rule's life after accept — the step that keeps the injected list short.
// graduate: it worked; its home is the doctrine, not every session start.
// revise:   the mistake came back as often; reword it or reject it.
// check:    no lesson before acceptance looked like its evidence, so its
//           effect cannot be read; the evidence was not corrective or is
//           worded unlike any later lesson.
// keep:     too little history after acceptance to judge.
export function action (e) {
  if (e.after.prompts < SETTLE) return 'keep'
  if (e.before.hits === 0) return 'check'
  return e.after.per1000 < e.before.per1000 ? 'graduate' : 'revise'
}

export function evidenceTexts (body) {
  return (body.split('## Evidence')[1] ?? '')
    .split('\n')
    .filter(l => l.startsWith('- '))
    .map(l => l.slice(2).replace(/^\([^)]*\)\s*/, ''))
}

export function efficacy (records, rules) {
  const prompts = records.filter(r => r.ts && !BEHAVIORAL.has(r.label))
  const lessons = prompts
    .filter(r => LESSON.has(r.label) || r.label === 'directive')
    .map(r => ({ r, toks: tokens(r.text ?? '') }))
  return rules.map(rule => {
    // ISO timestamps compare as strings, and a bare date sorts before every
    // timestamp of that day: the day of acceptance counts as after.
    const since = rule.meta.accepted ?? rule.meta.date
    const evidence = evidenceTexts(rule.body).map(tokens)
    const window = after => {
      const n = prompts.filter(r => (r.ts >= since) === after).length
      const hits = lessons.filter(({ r, toks }) =>
        (r.ts >= since) === after && evidence.some(e => jaccard(toks, e) >= AUTO)).length
      return { prompts: n, hits, per1000: n ? (1000 * hits) / n : 0 }
    }
    const before = window(false)
    const after = window(true)
    const verdict = after.prompts < MIN_AFTER
      ? 'too early'
      : after.per1000 < before.per1000 ? 'fewer' : 'not fewer'
    const e = { file: rule.file, since, before, after, verdict }
    return { ...e, action: action(e) }
  })
}

// Graduation is the user's paste, not limbic's write: limbic never edits the
// doctrine. It only refuses to stop injecting a rule no doctrine line states,
// or the rule would leave every session without landing anywhere. Lexical, at
// the threshold that pairs two events — reword the rule file's statement if
// your doctrine line says the same thing in other words.
export function doctrineHolds (statement, lines) {
  const s = tokens(statement)
  return lines.some(l => jaccard(s, tokens(l)) >= AUTO)
}
