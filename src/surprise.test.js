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

// Spec revised after the first audit (2026-08-04): neutral previously left the
// chain standing, and a day-long debugging session produced a meaningless
// chain of 15 across unrelated fixes. Escalation now requires an unbroken run.
test('only an unbroken run of corrections escalates the chain', () => {
  const scored = scoreSession([
    { label: 'correction' },
    { label: 'correction' },
    { label: 'neutral' },
    { label: 'correction' },
    { label: 'accept' },
    { label: 'correction' }
  ])
  assert.equal(scored[1].chain, 2, 'back-to-back corrections escalate')
  assert.equal(scored[3].chain, 1, 'a neutral prompt broke the run — new topic, new chain')
  assert.equal(scored[5].chain, 1, 'praise closes the episode')
})

test('a session with no corrections carries zero surprise throughout', () => {
  const scored = scoreSession([{ label: 'neutral' }, { label: 'accept' }])
  for (const e of scored) assert.equal(e.surprise, 0)
})

test('a rephrase escalates the chain like any correction', () => {
  const scored = scoreSession([{ label: 'correction' }, { label: 'rephrase' }])
  assert.equal(scored[1].chain, 2, 'a wordless re-ask is still the fix not taking')
})
