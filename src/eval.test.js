// Covers: how a case is found in history, that the rule reaches only the
// "with" answers, the verdict tally and its test, and the call cap.
// Deliberately not covered: the models' answers — a test that rents a model
// tests the network; the runner and judge are fakes here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cases, evaluate } from './eval.js'

const rule = {
  file: 'r.md',
  body: '## Proposed rule\n\nChange only what the request names.\n\n## Evidence (1 events)\n\n- (p) no revert the gradient to 32px'
}
const r = (sessionId, ts, text, label = 'neutral') => ({ sessionId, ts, text, label, project: '-p' })

test('a case is the prompt right before the corrected one, in the same session', () => {
  const records = [
    r('A', '2026-10-01T00:00:00Z', 'make the card shadow softer'),
    r('A', '2026-10-01T00:01:00Z', 'no revert the gradient to 32px', 'correction'),
    r('B', '2026-10-02T00:00:00Z', 'no revert the gradient to 32px', 'correction')
  ]
  assert.deepEqual(cases(rule, records).map(c => c.task), ['make the card shadow softer'],
    'a correction with no prompt before it in its session became a case')
})

test('the rule reaches only the answers it is tested on, and the tally reads the judge', async () => {
  const seen = []
  const run = async prompt => { seen.push(prompt.includes('Change only what the request names')); return prompt.includes('Follow this rule') ? 'only the shadow' : 'shadow and gradient' }
  const judge = async prompt => prompt.includes('shadow and gradient') ? 'Yes.' : 'no'
  const result = await evaluate(rule, [{ task: 't', mistake: 'm', project: '-p' }], { runs: 3, run, judge })
  assert.deepEqual(seen, [true, false, true, false, true, false], 'the rule leaked into the answers without it')
  assert.deepEqual(result.tally, { with: { yes: 0, no: 3, na: 0, error: 0 }, without: { yes: 3, no: 0, na: 0, error: 0 } })
  assert.ok(result.p < 0.06, 'three clean answers against three violations should read as an effect')
})

test('the call cap holds', async () => {
  const result = await evaluate(rule, [{ task: 't', mistake: 'm' }, { task: 't2', mistake: 'm2' }], { runs: 5, maxCalls: 6, run: async () => 'a', judge: async () => 'no' })
  assert.equal(result.calls, 6, 'more calls than the cap')
})

test('a failed call is an error, never na or a pass, and three in a row stop the run', async () => {
  const run = async () => { throw new Error('usage limit reached') }
  const result = await evaluate(rule, [{ task: 't', mistake: 'm' }, { task: 't2', mistake: 'm2' }], { runs: 5, maxCalls: 60, run, judge: async () => 'no' })
  const t = result.tally
  assert.equal(t.with.na + t.without.na + t.with.no + t.without.no, 0, 'a failed call was read as an answer')
  assert.equal(t.with.error + t.without.error, 3, 'the run kept spending calls on failures')
  assert.ok(result.aborted)
  assert.match(result.firstError, /usage limit/, 'the cause of the failure was lost')
})
