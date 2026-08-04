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
