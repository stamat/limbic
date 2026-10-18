// Covers: the before/after split at the acceptance date, the per-1000 rate,
// and the refusal to judge on too little history after acceptance.
// Deliberately not covered: semantic matching — efficacy is lexical by
// design, the same AUTO threshold that pairs two events without an oracle.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { efficacy, MIN_AFTER } from './efficacy.js'

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
