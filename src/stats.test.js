// Covers: the clean-acceptance rate — which accepts count as clean, and that
// sessions never leak a correction into each other.
// Deliberately not covered: the rest of the aggregate, which is arithmetic
// the stats rendering exercises on every run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanAccepts } from './stats.js'

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
