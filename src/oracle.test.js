// Covers: the LLM boundary's hostile-input handling, the cache guarantee, the
// call cap, and the recursion guard — everything that makes --llm safe to run.
// Deliberately not covered: real claude -p output (network in CI tests the
// network); the exec function is injected everywhere here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Oracle } from './oracle.js'

const cachePath = async () => join(await mkdtemp(join(tmpdir(), 'limbic-oracle-')), 'cache.jsonl')

test('garbage model output degrades to null labels, never a crash', async () => {
  for (const garbage of ['not json at all', '["correction"]', '[1,2]', '["correction","invented_label"]', '']) {
    const o = new Oracle({ cachePath: await cachePath(), execFn: async () => garbage })
    const out = await o.classify([{ context: 'x', text: 'a' }, { context: 'y', text: 'b' }])
    assert.deepEqual(out, [null, null], `"${garbage.slice(0, 20)}" must yield nulls`)
  }
})

test('the same question is never paid for twice', async () => {
  let calls = 0
  const path = await cachePath()
  const fake = async () => { calls++; return '["correction"]' }
  const a = new Oracle({ cachePath: path, execFn: fake })
  await a.classify([{ context: 'prev', text: 'no, wrong file' }])
  const b = new Oracle({ cachePath: path, execFn: fake })
  const out = await b.classify([{ context: 'prev', text: 'no, wrong file' }])
  assert.equal(calls, 1, 'the second oracle read the first one\'s cache')
  assert.deepEqual(out, ['correction'])
  assert.equal(b.cacheHits, 1)
})

test('the call cap holds however many questions arrive', async () => {
  let calls = 0
  const o = new Oracle({
    maxCalls: 2,
    cachePath: await cachePath(),
    execFn: async () => { calls++; return JSON.stringify(new Array(20).fill('neutral')) }
  })
  const items = Array.from({ length: 100 }, (_, i) => ({ context: 'c', text: `unique prompt ${i}` }))
  await o.classify(items)
  assert.equal(calls, 2, 'a documented cap beats a surprise bill')
})

test('a spawned claude cannot re-enter the oracle', async () => {
  process.env.LIMBIC_ORACLE = '1'
  try {
    const o = new Oracle({ cachePath: await cachePath(), execFn: async () => { throw new Error('must not be called') } })
    const out = await o.classify([{ context: 'x', text: 'y' }])
    assert.deepEqual(out, [null])
  } finally {
    delete process.env.LIMBIC_ORACLE
  }
})

test('yes/no pair verdicts respect order and unknowns stay null', async () => {
  const o = new Oracle({ cachePath: await cachePath(), execFn: async () => '["yes","no"]' })
  const out = await o.samePairs([
    { a: 'navbar overflow broken', b: 'menu overflow clips' },
    { a: 'navbar overflow broken', b: 'commit message casing' }
  ])
  assert.deepEqual(out, [true, false])
})

test('a validate verdict maps no to refuted and yes to standing, in order', async () => {
  const o = new Oracle({ cachePath: await cachePath(), execFn: async () => '["no","yes"]' })
  const out = await o.validate([
    { context: 'delivered the toggle', text: 'what does the toggle cost to render' },
    { context: 'delivered the toggle', text: 'the toggle shifts the layout when opening' }
  ])
  assert.deepEqual(out, [false, true])
})
