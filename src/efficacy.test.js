// Covers: the before/after split at the acceptance date, the per-1000 rate,
// the refusal to judge on too little history after acceptance, each fate in
// the rule life cycle, and the doctrine check that guards graduation.
// Deliberately not covered: semantic matching — efficacy is lexical by
// design, the same AUTO threshold that pairs two events without an oracle.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { efficacy, action, doctrineHolds, fisherLess, pooled, MIN_AFTER, MIN_BEFORE, SETTLE } from './efficacy.js'

const rule = {
  file: 'r.md',
  meta: { accepted: '2026-10-01', date: '2026-09-01' },
  body: '## Proposed rule\n\nX\n\n## Evidence (1 events)\n\n- (p) navbar overflow clips the menu on mobile'
}
const at = (ts, text = 'unrelated work', label = 'neutral') => ({ ts, text, label })
const filler = (ts, n) => Array.from({ length: n }, () => at(ts))

test('a lesson like the evidence counts on its side of the acceptance date', async () => {
  const records = [
    ...filler('2026-09-10T00:00:00Z', 99),
    at('2026-09-10T00:00:00Z', 'navbar overflow clips the menu on mobile again', 'fix_request'),
    ...filler('2026-10-10T00:00:00Z', MIN_AFTER)
  ]
  const [e] = await efficacy(records, [rule])
  assert.equal(e.before.hits, 1)
  assert.equal(e.before.per1000, 10, 'one in a hundred prompts is ten per thousand')
  assert.equal(e.after.hits, 0)
  assert.equal(e.verdict, 'fewer')
})

test('the day of acceptance counts as after', async () => {
  const records = [at('2026-10-01T08:00:00Z', 'navbar overflow clips the menu on mobile', 'correction')]
  const [e] = await efficacy(records, [rule])
  assert.equal(e.after.hits, 1, 'a correction on acceptance day was billed to the time before the rule')
})

test('too little history after acceptance is too early, never a verdict', async () => {
  const records = [...filler('2026-09-10T00:00:00Z', 100), ...filler('2026-10-10T00:00:00Z', MIN_AFTER - 1)]
  assert.equal((await efficacy(records, [rule]))[0].verdict, 'too early')
})

const window = (prompts, hits) => ({ prompts, hits, per1000: prompts ? (1000 * hits) / prompts : 0 })

test('a rule graduates only when it ran long enough and the mistake came back less', async () => {
  const before = window(2000, 10)
  assert.equal(action({ before, after: window(SETTLE - 1, 0) }), 'keep', 'judged on too little history')
  assert.equal(action({ before, after: window(SETTLE, 1) }), 'graduate')
  assert.equal(action({ before, after: window(SETTLE, 5) }), 'revise', 'the same rate after is a rule that did not work')
})

test('a rule whose evidence matched no lesson before cannot graduate, it is checked', async () => {
  assert.equal(action({ before: window(2000, 0), after: window(SETTLE, 0) }), 'check',
    'zero before and zero after reads as a success it never earned')
})

test('graduation needs a doctrine line that states the rule', async () => {
  const statement = 'Change only what the request names. Do not change a value next to it.'
  assert.ok(doctrineHolds(statement, ['Change only what the request names; leave the values next to it alone.']))
  assert.ok(!doctrineHolds(statement, ['Every comparison is a table.']),
    'a rule left every session without landing in the doctrine')
})

test('a session that had the rule and made the mistake anyway is a miss, and three send it to revise', async () => {
  const given = (sessionId, ts) => ({ ts, sessionId, label: 'injected', text: '', given: ['r.md'] })
  const lesson = (sessionId, ts) => ({ ts, sessionId, label: 'fix_request', text: 'navbar overflow clips the menu on mobile again' })
  const records = [
    given('A', '2026-10-02T00:00:00Z'), lesson('A', '2026-10-02T00:05:00Z'),
    given('B', '2026-10-03T00:00:00Z'), lesson('B', '2026-10-03T00:05:00Z'),
    given('C', '2026-10-04T00:00:00Z'),
    lesson('D', '2026-10-04T00:05:00Z')
  ]
  const [e] = await efficacy(records, [rule])
  assert.equal(e.given, 3)
  assert.equal(e.missed, 2, 'a session never given the rule was billed as its miss')
  assert.equal(e.action, 'keep')
  const [third] = await efficacy([...records, given('E', '2026-10-05T00:00:00Z'), lesson('E', '2026-10-05T00:01:00Z')], [rule])
  assert.equal(third.action, 'revise', 'three misses in sessions that had the rule did not count against it')
})

test('fisher matches the textbook value, and zero against zero is no evidence at all', () => {
  // Lady tasting tea: 3 of 4 right against 1 of 4, one-sided p = 17/70.
  assert.ok(Math.abs(fisherLess(1, 3, 3, 1) - 17 / 70) < 1e-9, 'the exact test is wrong')
  assert.ok(fisherLess(0, 20, 0, 20) > 1 - 1e-9, 'zero misses each side read as a difference')
})

test('the holdout decides only on a significant difference, else it says nothing', () => {
  const before = window(2000, 10)
  const after = window(SETTLE, 9)
  assert.equal(action({ before, after, given: 400, missed: 2, held: 100, heldMissed: 8 }), 'graduate',
    '2 misses in 400 with the rule against 8 in 100 without it is a rule that works')
  assert.equal(action({ before, after, given: 20, missed: 0, held: 20, heldMissed: 0 }), action({ before, after, missed: 0 }),
    'zero against zero decided the rule')
})

test('pooling every rule answers the question no single rule can', () => {
  const rule = (missed, heldMissed) => ({ given: 100, missed, held: 25, heldMissed })
  const one = rule(0, 1)
  assert.ok(pooled([one]).p > 0.05, 'one rule alone is not significant')
  assert.ok(pooled(Array.from({ length: 8 }, () => one)).p < 0.05, 'eight rules pooled should be')
})

test('a held-out session counts its misses on the held side, never on the given side', async () => {
  const records = [
    { ts: '2026-10-02T00:00:00Z', sessionId: 'H', label: 'injected', text: '', given: [], held: ['r.md'] },
    { ts: '2026-10-02T00:05:00Z', sessionId: 'H', label: 'fix_request', text: 'navbar overflow clips the menu on mobile again' }
  ]
  const [e] = await efficacy(records, [rule])
  assert.deepEqual([e.given, e.missed, e.held, e.heldMissed], [0, 0, 1, 1])
})

test('with an oracle, a paraphrase of the evidence counts as the same mistake', async () => {
  const oracle = { samePairs: async (pairs) => pairs.map(() => true) }
  const records = [
    ...filler('2026-09-10T00:00:00Z', 99),
    at('2026-09-10T00:00:00Z', 'the dropdown paints past the edge of the overflow menu on phones', 'fix_request')
  ]
  const [lexical] = await efficacy(records, [rule])
  assert.equal(lexical.before.hits, 0, 'shared words alone should miss this paraphrase')
  const [semantic] = await efficacy(records, [rule], { oracle })
  assert.equal(semantic.before.hits, 1, 'the oracle confirmed the pair, and the miss was still not counted')
})

test('a handful of lessons before acceptance is too few to judge by date', () => {
  assert.equal(action({ before: window(1187, MIN_BEFORE - 1), after: window(SETTLE, 0) }), 'check',
    'one lesson before and two after graduated a rule on noise')
})
