// Covers: label boundaries of the regex classifier — the precision-first
// guarantees that keep poisoned rules out of future context.
// Deliberately not covered: recall (missed corrections cost a delay, not a
// poisoning) and non-English prompts (out of scope in v0, stated in README).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify } from './classify.js'

test('praise alone never labels a correction', () => {
  for (const text of ['thanks, great work', 'perfect', 'lgtm', 'works now, well done']) {
    assert.equal(classify(text).label, 'accept', `"${text}" must read as accept`)
  }
})

test('"no," at the start of a prompt is a correction', () => {
  assert.equal(classify('no, I meant the other file').label, 'correction')
})

test('a fresh task containing the word fix is not a fix_request', () => {
  const { label } = classify('fix the safari stutter')
  assert.equal(label, 'neutral', 'a new ask is work, not dissatisfaction')
})

test('"still broken" after delivery is a fix_request', () => {
  assert.equal(classify('the dropdown is still broken on mobile').label, 'fix_request')
})

test('"what happened to X" at the prompt start survives the diagnostic guard', () => {
  assert.equal(classify('what happened with the navbar fix?').label, 'fix_request',
    'the guard must not eat the cue this phrase exists to fire')
})

test('"you missed" reads as a correction wherever it sits', () => {
  assert.equal(classify('I think you missed the second case').label, 'correction')
})

test('an empty or noise prompt is neutral, never a crash', () => {
  assert.equal(classify('').label, 'neutral')
  assert.equal(classify('???').label, 'neutral')
})

test('a prompt merely mentioning the word wrong is not a correction', () => {
  assert.equal(classify('add a test for the wrong-password path').label, 'neutral')
})

// The next four guarantees come from the v0 replay audit: each cue class below
// was found in real history, judged by hand, and added with its real example.

test('a why-did-we question is a challenge, not a bug and not noise', () => {
  assert.equal(classify('why did we remove the house-style?').label, 'challenge')
  assert.equal(classify('but why is the index in html and not in .md?').label, 'challenge')
})

test('a diagnostic question wearing corrective words stays neutral', () => {
  const { label } = classify('does ~/localhost/poops have the same issue and why not?')
  assert.equal(label, 'neutral', 'curiosity about scope is not a report against delivered work')
})

test('"i mean" opening a prompt is a correction even without the t', () => {
  assert.equal(classify('i mean link them in index.md').label, 'correction')
})

test('a typo in doesnt still reads as a fix_request', () => {
  assert.equal(classify('but the picker input dosn\'t work').label, 'fix_request')
})

test('restoring to a previous setting is a correction, not a fresh task', () => {
  assert.equal(classify('restore the switch to the previous setting of 14px icons').label, 'correction')
})

test('output that is hard to read is a challenge to delivered work', () => {
  assert.equal(classify('but there is a lot of output which is hard to read').label, 'challenge')
})
