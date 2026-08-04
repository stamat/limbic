// Covers: the escalation curve and chain state machine — the guarantees the
// Titans-shaped scoring makes to everything downstream.
// Deliberately not covered: baseline normalization across sessions (lives in
// stats.js and is aggregate arithmetic, exercised by stats rendering).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { momentary, scoreSession } from './surprise.js'

test('a second correction on the same chain outscores the first', () => {
  assert.ok(momentary(2) > momentary(1), 'the first fix not taking is worse news than the first miss')
})

test('the curve saturates instead of adding', () => {
  assert.ok(momentary(10) < 1, 'surprise is bounded at 1')
  assert.ok(momentary(10) - momentary(9) < momentary(2) - momentary(1))
})

test('an accept resets the chain, a neutral prompt does not', () => {
  const scored = scoreSession([
    { label: 'correction' },
    { label: 'neutral' },
    { label: 'correction' },
    { label: 'accept' },
    { label: 'correction' }
  ])
  assert.equal(scored[2].chain, 2, 'moving on without praise is not evidence the fix landed')
  assert.equal(scored[4].chain, 1, 'praise closes the episode')
})

test('a session with no corrections carries zero surprise throughout', () => {
  const scored = scoreSession([{ label: 'neutral' }, { label: 'accept' }])
  for (const e of scored) assert.equal(e.surprise, 0)
})
