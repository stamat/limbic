// Covers: the before/after split at the acceptance date, the per-1000 rate,
// the refusal to judge on too little history after acceptance, each fate in
// the rule life cycle, and the doctrine check that guards graduation.
// Deliberately not covered: semantic matching — efficacy is lexical by
// design, the same AUTO threshold that pairs two events without an oracle.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { efficacy, action, doctrineHolds, MIN_AFTER, SETTLE } from './efficacy.js'

const rule = {
  file: 'r.md',
  meta: { accepted: '2026-10-01', date: '2026-09-01' },
  body: '## Proposed rule\n\nX\n\n## Evidence (1 events)\n\n- (p) navbar overflow clips the menu on mobile'
}
const at = (ts, text = 'unrelated work', label = 'neutral') => ({ ts, text, label })
const filler = (ts, n) => Array.from({ length: n }, () => at(ts))

test('a lesson like the evidence counts on its side of the acceptance date', () => {
  const records = [
    ...filler('2026-09-10T00:00:00Z', 99),
    at('2026-09-10T00:00:00Z', 'navbar overflow clips the menu on mobile again', 'fix_request'),
    ...filler('2026-10-10T00:00:00Z', MIN_AFTER)
  ]
  const [e] = efficacy(records, [rule])
  assert.equal(e.before.hits, 1)
  assert.equal(e.before.per1000, 10, 'one in a hundred prompts is ten per thousand')
  assert.equal(e.after.hits, 0)
  assert.equal(e.verdict, 'fewer')
})

test('the day of acceptance counts as after', () => {
  const records = [at('2026-10-01T08:00:00Z', 'navbar overflow clips the menu on mobile', 'correction')]
  const [e] = efficacy(records, [rule])
  assert.equal(e.after.hits, 1, 'a correction on acceptance day was billed to the time before the rule')
})

test('too little history after acceptance is too early, never a verdict', () => {
  const records = [...filler('2026-09-10T00:00:00Z', 100), ...filler('2026-10-10T00:00:00Z', MIN_AFTER - 1)]
  assert.equal(efficacy(records, [rule])[0].verdict, 'too early')
})

const window = (prompts, hits) => ({ prompts, hits, per1000: prompts ? (1000 * hits) / prompts : 0 })

test('a rule graduates only when it ran long enough and the mistake came back less', () => {
  const before = window(2000, 10)
  assert.equal(action({ before, after: window(SETTLE - 1, 0) }), 'keep', 'judged on too little history')
  assert.equal(action({ before, after: window(SETTLE, 1) }), 'graduate')
  assert.equal(action({ before, after: window(SETTLE, 5) }), 'revise', 'the same rate after is a rule that did not work')
})

test('a rule whose evidence matched no lesson before cannot graduate, it is checked', () => {
  assert.equal(action({ before: window(2000, 0), after: window(SETTLE, 0) }), 'check',
    'zero before and zero after reads as a success it never earned')
})

test('graduation needs a doctrine line that states the rule', () => {
  const statement = 'Change only what the request names. Do not change a value next to it.'
  assert.ok(doctrineHolds(statement, ['Change only what the request names; leave the values next to it alone.']))
  assert.ok(!doctrineHolds(statement, ['Every comparison is a table.']),
    'a rule left every session without landing in the doctrine')
})

test('a session that had the rule and made the mistake anyway is a miss, and three send it to revise', () => {
  const given = (sessionId, ts) => ({ ts, sessionId, label: 'injected', text: '', given: ['r.md'] })
  const lesson = (sessionId, ts) => ({ ts, sessionId, label: 'fix_request', text: 'navbar overflow clips the menu on mobile again' })
  const records = [
    given('A', '2026-10-02T00:00:00Z'), lesson('A', '2026-10-02T00:05:00Z'),
    given('B', '2026-10-03T00:00:00Z'), lesson('B', '2026-10-03T00:05:00Z'),
    given('C', '2026-10-04T00:00:00Z'),
    lesson('D', '2026-10-04T00:05:00Z')
  ]
  const [e] = efficacy(records, [rule])
  assert.equal(e.given, 3)
  assert.equal(e.missed, 2, 'a session never given the rule was billed as its miss')
  assert.equal(e.action, 'keep')
  const [third] = efficacy([...records, given('E', '2026-10-05T00:00:00Z'), lesson('E', '2026-10-05T00:01:00Z')], [rule])
  assert.equal(third.action, 'revise', 'three misses in sessions that had the rule did not count against it')
})
