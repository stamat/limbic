// Covers: the thesis benchmark's split and scoring — that a rule deduced from
// early history matches a like correction later, and that absence of pattern
// scores zero instead of flattering the tool.
// Deliberately not covered: statistical significance; at ledger scale the
// number is a signal to read, not a paper to publish, and the README says so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retrodict } from './retrodict.js'

const ev = (text, ts, label = 'correction') => ({ text, ts, label, project: 'p' })

test('a rule from the first half prevents its twin in the second', async () => {
  const records = [
    ev('navbar overflow clips the menu on mobile', '2026-01-01T00:00:00Z'),
    ev('navbar overflow still broken on mobile', '2026-01-02T00:00:00Z'),
    ev('mobile navbar menu overflow clips again', '2026-01-03T00:00:00Z'),
    ev('unrelated: lowercase the commit subject', '2026-01-04T00:00:00Z'),
    ev('the navbar overflow clips the menu on mobile once more', '2026-02-01T00:00:00Z'),
    ev('another thing entirely: sitemap has backslashes', '2026-02-02T00:00:00Z')
  ]
  const r = await retrodict(records)
  assert.equal(r.rules, 1)
  assert.equal(r.preventable, 1, 'the repeated overflow correction was preventable')
  assert.ok(r.rate > 0)
})

test('patternless history scores zero, the benchmark cannot flatter', async () => {
  const records = [
    ev('first unique complaint about fonts', '2026-01-01T00:00:00Z'),
    ev('second unique complaint about spacing', '2026-01-02T00:00:00Z'),
    ev('third unique complaint about naming', '2026-02-01T00:00:00Z'),
    ev('fourth unique complaint about builds', '2026-02-02T00:00:00Z')
  ]
  const r = await retrodict(records)
  assert.equal(r.rules, 0)
  assert.equal(r.preventable, 0)
})
