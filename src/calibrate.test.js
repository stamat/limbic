// Covers: κ arithmetic, stratified idempotent sampling with frozen classifier
// inputs, and the cascade composing on corpus items exactly as replay does.
// Deliberately not covered: the interactive labeling itself (the human hand
// is the instrument being calibrated against, not code) and real oracle
// output (exec is injected).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { kappa, sampleCorpus, readCorpus, cascadeLabels, shuffled } from './calibrate.js'
import { Oracle } from './oracle.js'

test('kappa is 1 on identical labels and 0 at chance-level agreement', () => {
  assert.equal(kappa(['a', 'b', 'a'], ['a', 'b', 'a']), 1)
  assert.equal(kappa(['a', 'a', 'b', 'b'], ['a', 'b', 'a', 'b']), 0,
    'half agreement over two balanced labels is exactly chance')
})

async function transcriptFixture () {
  const root = await mkdtemp(join(tmpdir(), 'limbic-cal-'))
  const projects = join(root, 'projects')
  await mkdir(join(projects, 'proj-a'), { recursive: true })
  const entry = (text, n, type = 'user') => JSON.stringify(type === 'user'
    ? {
        type: 'user',
        isSidechain: false,
        origin: { kind: 'human' },
        message: { role: 'user', content: [{ type: 'text', text }] },
        timestamp: `2026-08-04T00:0${n}:00Z`,
        sessionId: 's1'
      }
    : {
        type: 'assistant',
        isSidechain: false,
        message: { role: 'assistant', content: [{ type: 'text', text }] },
        timestamp: `2026-08-04T00:0${n}:00Z`,
        sessionId: 's1'
      })
  await writeFile(join(projects, 'proj-a', 's1.jsonl'), [
    entry('build the widget with the blue frame', 0),
    entry('Delivered the widget.', 1, 'assistant'),
    entry('no, I meant the other frame', 2),
    entry('thanks, perfect', 3)
  ].join('\n'))
  return { projects, corpusPath: join(root, 'labels.jsonl') }
}

test('sampling is stratified, idempotent, and freezes every classifier input', async () => {
  const { projects, corpusPath } = await transcriptFixture()
  const first = await sampleCorpus({ projectsDir: projects, corpusPath })
  assert.ok(first.added >= 3, 'neutral, correction and accept strata all sampled')
  const again = await sampleCorpus({ projectsDir: projects, corpusPath })
  assert.equal(again.added, 0, 'the same prompts never enter the corpus twice')
  const corpus = await readCorpus(corpusPath)
  const correction = corpus.find(c => c.cascade === 'correction')
  assert.equal(correction.context, 'Delivered the widget.', 'the previous assistant turn is frozen for the oracle layer')
  assert.equal(correction.prevPrompt, 'build the widget with the blue frame')
  assert.equal(correction.human, null, 'the human label starts empty — the user is the instrument')
})

test('a refuted oracle upgrade stays neutral in the calibration cascade too', async () => {
  const item = { id: 'x', text: 'the toggle shifts the layout when opening', context: 'Delivered the toggle.', prevPrompt: null, human: 'fix_request' }
  const path = async () => join(await mkdtemp(join(tmpdir(), 'limbic-cal-')), 'c.jsonl')
  let call = 0
  const refuting = new Oracle({ cachePath: await path(), execFn: async () => (++call === 1 ? '["fix_request"]' : '["no"]') })
  assert.deepEqual(await cascadeLabels([item], refuting), ['neutral'])
  call = 0
  const confirming = new Oracle({ cachePath: await path(), execFn: async () => (++call === 1 ? '["fix_request"]' : '["yes"]') })
  assert.deepEqual(await cascadeLabels([item], confirming), ['fix_request'])
})

test('shuffling is seeded and reproducible, never Math.random', () => {
  const a = shuffled([1, 2, 3, 4, 5], 7)
  const b = shuffled([1, 2, 3, 4, 5], 7)
  const c = shuffled([1, 2, 3, 4, 5], 8)
  assert.deepEqual(a, b, 'same seed, same order')
  assert.notDeepEqual(a, c, 'different seed, different order')
})
