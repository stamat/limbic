import { tokens, jaccard, AUTO } from './cluster.js'
import { similar } from './semantic.js'
import { LESSON, BEHAVIORAL } from './surprise.js'

// Did a rule work? For each accepted rule: how often a lesson like its
// evidence came up before the day it was accepted and after, per 1000
// prompts. Like is `similar()`: lexical alone without an oracle, so a rule
// only sees the mistake in words close to the ones that taught it; with one,
// a paraphrase counts too. A falling rate is evidence, never proof: the user may only have
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
// check:    fewer than MIN_BEFORE lessons before acceptance looked like its
//           evidence, so a rate after cannot be read against it — one lesson
//           before and two after graduated a rule on noise in the first
//           semantic run.

export const MIN_BEFORE = 5
// keep:     too little history after acceptance to judge.
// A rule that sessions were given and that still missed MISS_LIMIT times is
// revised at once, whatever the history: ExpeL drops an insight its votes
// turn against, ACE counts a bullet harmful each time it fails.
export const MISS_LIMIT = 3

// The holdout decides only on a significant difference: with and without the
// rule is the one comparison the model, the doctrine and the work cannot
// bend, so when it speaks it outranks every other signal — and when it does
// not, it says nothing. A plain rate comparison read 0 misses of 20 against 0
// of 20 as "revise": a rule's mistake comes up in about 1% of sessions, so
// small samples are almost always zero against zero.
export const SIGNIFICANCE = 0.05

// Fisher's exact test, one-sided: the chance of `a` or fewer misses among the
// first group's `a + b` sessions if the rule made no difference, with all the
// table's totals fixed. Exact, so it holds at the zero-heavy counts a 1%
// mistake gives, where a normal approximation does not.
export function fisherLess (a, b, c, d) {
  const n = a + b + c + d
  const logf = [0]
  for (let i = 1; i <= n; i++) logf[i] = logf[i - 1] + Math.log(i)
  const row1 = a + b
  const row2 = c + d
  const col1 = a + c
  const p = x => Math.exp(logf[row1] + logf[row2] + logf[col1] + logf[n - col1] -
    logf[n] - logf[x] - logf[row1 - x] - logf[col1 - x] - logf[row2 - col1 + x])
  let sum = 0
  for (let x = Math.max(0, col1 - row2); x <= a; x++) sum += p(x)
  return Math.min(1, sum)
}

export function holdoutP (e) {
  return fisherLess(e.missed, e.given - e.missed, e.heldMissed, e.held - e.heldMissed)
}

export function action (e) {
  if (e.given && e.held && holdoutP(e) < SIGNIFICANCE) return 'graduate'
  if (e.missed >= MISS_LIMIT) return 'revise'
  if (e.after.prompts < SETTLE) return 'keep'
  if (e.before.hits < MIN_BEFORE) return 'check'
  return e.after.per1000 < e.before.per1000 ? 'graduate' : 'revise'
}

export function evidenceTexts (body) {
  return (body.split('## Evidence')[1] ?? '')
    .split('\n')
    .filter(l => l.startsWith('- '))
    .map(l => l.slice(2).replace(/^\([^)]*\)\s*/, ''))
}

// Which sessions got which rule — or were held out of it — and from when:
// inject and remind write an `injected` record each time they deliver.
function deliveries (records, field) {
  const out = new Map()
  for (const r of records) {
    if (r.label !== 'injected' || !Array.isArray(r[field])) continue
    for (const file of r[field]) {
      if (!out.has(file)) out.set(file, new Map())
      const sessions = out.get(file)
      if (!sessions.has(r.sessionId) || r.ts < sessions.get(r.sessionId)) sessions.set(r.sessionId, r.ts)
    }
  }
  return out
}

export async function efficacy (records, rules, { oracle = null, embedder = null } = {}) {
  const prompts = records.filter(r => r.ts && !BEHAVIORAL.has(r.label))
  const lessons = prompts.filter(r => (LESSON.has(r.label) || r.label === 'directive') && r.text)
  const given = deliveries(records, 'given')
  const heldOut = deliveries(records, 'held')
  // Every lesson against every evidence line of every rule, judged in one
  // batch: like[k] is the set of lessons that match rule k.
  const evidence = rules.map(rule => evidenceTexts(rule.body))
  const pairs = []
  evidence.forEach((lines, k) => lessons.forEach((r, i) => lines.forEach(e => pairs.push({ k, i, a: r.text, b: e }))))
  const verdicts = await similar(pairs, { oracle, embedder })
  const like = rules.map(() => new Set())
  pairs.forEach((p, n) => { if (verdicts[n]) like[p.k].add(p.i) })
  return rules.map((rule, k) => {
    // ISO timestamps compare as strings, and a bare date sorts before every
    // timestamp of that day: the day of acceptance counts as after.
    const since = rule.meta.accepted ?? rule.meta.date
    const matches = lessons.filter((_, i) => like[k].has(i))
    const window = after => {
      const n = prompts.filter(r => (r.ts >= since) === after).length
      const hits = matches.filter(r => (r.ts >= since) === after).length
      return { prompts: n, hits, per1000: n ? (1000 * hits) / n : 0 }
    }
    const before = window(false)
    const after = window(true)
    // A miss is a session that had the rule in context and made the mistake
    // anyway — the evidence a date split cannot give, and the lesson to read.
    const missesIn = sessions => {
      const out = []
      for (const [sessionId, from] of sessions) {
        const hit = matches.find(r => r.sessionId === sessionId && r.ts >= from)
        if (hit) out.push(hit.text)
      }
      return out
    }
    const sessions = given.get(rule.file) ?? new Map()
    const held = heldOut.get(rule.file) ?? new Map()
    const misses = missesIn(sessions)
    const verdict = after.prompts < MIN_AFTER
      ? 'too early'
      : after.per1000 < before.per1000 ? 'fewer' : 'not fewer'
    const e = { file: rule.file, since, before, after, verdict, given: sessions.size, missed: misses.length, misses, held: held.size, heldMissed: missesIn(held).length }
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

// All rules as one experiment: each (session, rule) is a unit, given or held.
// At about 1% of sessions per rule's mistake, no single rule reaches an answer
// in months; the pooled question — do limbic's rules, together, cut their
// mistakes? — gets there first.
export function pooled (results) {
  const sum = k => results.reduce((n, e) => n + e[k], 0)
  const e = { given: sum('given'), missed: sum('missed'), held: sum('held'), heldMissed: sum('heldMissed') }
  return { ...e, p: e.given && e.held ? holdoutP(e) : 1 }
}
