// Covers: the rephrase layer's precision guards — when a re-ask counts, and
// every condition that must kill the reading.
// Deliberately not covered: window sizes beyond the immediate neighbour (not
// built — stated in detect.js) and threshold tuning (i2's calibration job).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markRephrases } from './detect.js'

const p = (text, label = 'neutral', cue = null) => ({ text, label, cue })

test('a re-asked request with no accept between reads as rephrase', () => {
  const out = markRephrases([
    p('make the sidebar sticky on scroll for desktop'),
    p('make the sidebar sticky on desktop please')
  ])
  assert.equal(out[1].label, 'rephrase')
  assert.match(out[1].cue, /^rephrase:0\./, 'the cue carries the similarity that fired')
})

test('praise between the two asks kills the rephrase reading', () => {
  const out = markRephrases([
    p('make the sidebar sticky on scroll for desktop'),
    p('perfect, thank you', 'accept'),
    p('make the sidebar sticky on desktop please')
  ])
  assert.equal(out[2].label, 'neutral', 'a re-ask after praise is a new round, not a complaint')
})

test('short prompts never rephrase-match', () => {
  const out = markRephrases([p('fix the navbar'), p('fix that navbar')])
  assert.equal(out[1].label, 'neutral', 'tiny token sets make Jaccard a coin flip')
})

test('a prompt another layer already labeled keeps its label and cue', () => {
  const out = markRephrases([
    p('the dropdown menu is broken on mobile safari'),
    p('the dropdown menu is broken on mobile still', 'fix_request', 'existing-cue')
  ])
  assert.equal(out[1].label, 'fix_request')
  assert.equal(out[1].cue, 'existing-cue')
})

test('unrelated consecutive prompts stay neutral', () => {
  const out = markRephrases([
    p('make the sidebar sticky on scroll for desktop'),
    p('now write the changelog entry for this release')
  ])
  assert.equal(out[1].label, 'neutral')
})
