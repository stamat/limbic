// Covers: the clean-acceptance rate — which accepts count as clean, and that
// sessions never leak a correction into each other — and the repeat rate's
// fixed window.
// Deliberately not covered: the rest of the aggregate, which is arithmetic
// the stats rendering exercises on every run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanAccepts, repeats } from './stats.js'

const r = (sessionId, ts, label) => ({ sessionId, ts, label, text: '' })

test('an accept is clean only with no correction since the accept before it', () => {
  const [m] = cleanAccepts([
    r('A', '2026-09-01T00:00:00Z', 'neutral'),
    r('A', '2026-09-01T00:01:00Z', 'accept'),
    r('A', '2026-09-01T00:02:00Z', 'correction'),
    r('A', '2026-09-01T00:03:00Z', 'accept'),
    r('A', '2026-09-01T00:04:00Z', 'accept')
  ])
  assert.deepEqual(m, { month: '2026-09', clean: 2, accepts: 3 }, 'a correction counted against the wrong delivery')
})

test('a correction in one session does not taint an accept in another', () => {
  const [m] = cleanAccepts([
    r('A', '2026-09-01T00:00:00Z', 'correction'),
    r('B', '2026-09-01T00:01:00Z', 'accept')
  ])
  assert.equal(m.clean, 1, 'parallel sessions shared one correction')
})

test('a lesson repeats only one from the window before it, never an older one', async () => {
  const lesson = (ts) => ({ ts, label: 'correction', text: 'navbar overflow clips the menu on mobile' })
  const rows = await repeats([lesson('2026-06-01T00:00:00Z'), lesson('2026-09-01T00:00:00Z'), lesson('2026-09-20T00:00:00Z')])
  assert.deepEqual(rows.map(r => [r.month, r.repeats, r.lessons]), [['2026-06', 0, 1], ['2026-09', 1, 2]],
    'a lesson from three months back counted as a repeat — the rate would grow with history alone')
})

test('with an oracle, a paraphrase within the window is a repeat', async () => {
  const oracle = { samePairs: async (pairs) => pairs.map(() => true) }
  const rows = await repeats([
    { ts: '2026-09-01T00:00:00Z', label: 'correction', text: 'navbar overflow clips the menu on mobile' },
    { ts: '2026-09-05T00:00:00Z', label: 'fix_request', text: 'the menu paints past the edge on phones' }
  ], { oracle })
  assert.equal(rows[0].repeats, 1, 'a confirmed paraphrase was not counted as a repeat')
})

test('without embeddings, a pair that shares no word never reaches the oracle', async () => {
  let asked = 0
  const oracle = { samePairs: async (pairs) => { asked += pairs.length; return pairs.map(() => true) } }
  await repeats([
    { ts: '2026-09-01T00:00:00Z', label: 'correction', text: 'navbar overflow clips the menu on mobile' },
    { ts: '2026-09-05T00:00:00Z', label: 'fix_request', text: 'the dropdown paints past the edge on phones' }
  ], { oracle })
  assert.equal(asked, 0, 'every pair went to the oracle — the plan budget is O(n²) without the floor')
})
