// Covers: the embedding substrate's degrade and cache guarantees, and the
// nominate-only contract — an embedding pair reaches a cluster solely through
// an oracle yes.
// Deliberately not covered: real ollama output (network in CI tests the
// network); the fetch function is injected everywhere here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Embedder, cosine } from './embed.js'
import { semanticClusters } from './semantic.js'
import { Oracle } from './oracle.js'

const cachePath = async () => join(await mkdtemp(join(tmpdir(), 'limbic-embed-')), 'embeddings.jsonl')

test('cosine is 1 for parallel vectors, 0 for orthogonal and for missing ones', () => {
  assert.ok(Math.abs(cosine([1, 2], [2, 4]) - 1) < 1e-9)
  assert.equal(cosine([1, 0], [0, 1]), 0)
  assert.equal(cosine(null, [1, 2]), 0)
  assert.equal(cosine([1, 2], [1, 2, 3]), 0)
})

test('a dead ollama costs one failed call, not one per text', async () => {
  let calls = 0
  const e = new Embedder({
    cachePath: await cachePath(),
    fetchFn: async () => { calls++; throw new Error('connection refused') }
  })
  const out = await e.embed(['a', 'b', 'c'])
  assert.deepEqual(out, [null, null, null])
  assert.equal(calls, 1, 'the first failure marks ollama absent for the run')
  assert.equal(e.available, false)
})

test('the same text is never embedded twice', async () => {
  let calls = 0
  const path = await cachePath()
  const fake = async () => { calls++; return [0.1, 0.2, 0.3] }
  const a = new Embedder({ cachePath: path, fetchFn: fake })
  await a.embed(['navbar overflow clips'])
  const b = new Embedder({ cachePath: path, fetchFn: fake })
  const out = await b.embed(['navbar overflow clips'])
  assert.equal(calls, 1, 'the second embedder read the first one\'s cache')
  assert.deepEqual(out, [[0.1, 0.2, 0.3]])
  assert.equal(b.cacheHits, 1)
})

test('an embedding nomination merges zero-token-overlap corrections only through an oracle yes', async () => {
  // Three events: two share no tokens but embed as near-parallel vectors; the
  // third is orthogonal. The oracle confirms the nominated pair.
  const vectors = {
    'menu previews suffer identical problems': [1, 0.01, 0],
    'navbar clips its dropdown overflow': [0.99, 0.02, 0],
    'commit message casing preference': [0, 0, 1]
  }
  const embedder = new Embedder({
    cachePath: await cachePath(),
    fetchFn: async (text) => vectors[text]
  })
  const oracle = new Oracle({
    cachePath: await cachePath(),
    execFn: async () => '["yes"]'
  })
  const events = Object.keys(vectors).map((text, i) => ({ text, project: 'p', label: 'fix_request', ts: `t${i}` }))
  const { clusters, asked, confirmed } = await semanticClusters(events, oracle, { minSize: 2, embedder })
  assert.equal(asked, 1, 'only the embedding-nominated pair was worth an oracle question')
  assert.equal(confirmed, 1)
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].size, 2, 'the zero-overlap pair clustered; the orthogonal event did not')
})

test('a two-event cluster stands only on a double-confirmed pair', async () => {
  // Oracle says yes to everything nominated; only the pair whose vectors also
  // clear the embedding floor may stand as a cluster of two.
  const vectors = {
    'the navbar dropdown clips its overflow badly': [1, 0, 0],
    'menu previews suffer identical clipping problems': [0.98, 0.05, 0],
    'the navbar dropdown overflow keeps clipping still': [0, 1, 0]
  }
  const embedder = new Embedder({ cachePath: await cachePath(), fetchFn: async (t) => vectors[t] })
  const oracle = new Oracle({ cachePath: await cachePath(), execFn: async () => '["yes"]' })
  const texts = Object.keys(vectors)
  // Pair A: texts[0]+[1] — zero lexical overlap, parallel vectors → double-confirmed.
  // Pair B: texts[0]+[2] — high lexical overlap, orthogonal vectors → oracle-only.
  const events = (ts) => ts.map((text, i) => ({ text, project: 'p', label: 'fix_request', ts: `t${i}` }))
  const double = await semanticClusters(events([texts[0], texts[1]]), oracle, { minSize: 2, embedder })
  assert.equal(double.clusters.length, 1, 'embedding and oracle agree — the pair stands')
  const single = await semanticClusters(events([texts[0], texts[2]]), oracle, { minSize: 2, embedder })
  assert.equal(single.clusters.length, 0, 'oracle alone cannot carry a cluster of two')
})

test('without an embedder the ask list is exactly the lexical one', async () => {
  const events = [
    { text: 'menu previews suffer identical problems', project: 'p', label: 'fix_request', ts: 't0' },
    { text: 'navbar clips its dropdown overflow', project: 'p', label: 'fix_request', ts: 't1' }
  ]
  const oracle = new Oracle({ cachePath: await cachePath(), execFn: async () => '["yes"]' })
  const { asked } = await semanticClusters(events, oracle, { minSize: 2 })
  assert.equal(asked, 0, 'zero token overlap and no vectors means no nomination')
})
