// Covers: the semantic merge — that oracle-confirmed pairs unite what tokens
// cannot, and that an unavailable oracle degrades to lexical behavior instead
// of failing.
// Deliberately not covered: oracle internals (oracle.test.js owns those).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { semanticClusters } from './semantic.js'

const ev = (text) => ({ text, label: 'correction', project: 'p', ts: '2026-01-01T00:00:00Z' })

// Shares "menu"/"navbar" weakly with the others — above the floor, below the
// auto threshold: exactly the pair shape only the oracle can resolve.
const events = [
  ev('navbar overflow clips the menu items on mobile'),
  ev('navbar overflow still broken, menu clips on mobile'),
  ev('the menu previews suffer from the same issues navbar did')
]

test('an oracle yes merges what tokens cannot', async () => {
  const oracle = { samePairs: async (pairs) => pairs.map(() => true) }
  const { clusters } = await semanticClusters(events, oracle, { minSize: 3 })
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].size, 3, 'the semantic repeat joined its cluster')
})

test('an oracle that answers nothing leaves lexical clusters intact', async () => {
  const oracle = { samePairs: async (pairs) => pairs.map(() => null) }
  const { clusters } = await semanticClusters(events, oracle, { minSize: 2 })
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].size, 2, 'only the token-similar pair remains together')
})

test('imperative glue is a category, not a cluster', async () => {
  const cmds = [ev('fix it'), ev('fix all'), ev('fix all of them, still broken')]
  const oracle = { samePairs: async (pairs) => pairs.map(() => true) }
  const { clusters } = await semanticClusters(cmds, oracle, { minSize: 3 })
  assert.equal(clusters.length, 0, '"fix" shared three ways is a verb, not a lesson')
})

test('one drifted yes cannot snowball unrelated corrections into a blob', async () => {
  // A~B and B~C confirmed, A~C denied: transitive closure would glue all
  // three — the 16-member blob from the first real run in miniature.
  const abc = [
    ev('navbar overflow menu clips mobile items'),
    ev('menu clips on mobile, overflow issue somewhere'),
    ev('mobile scroll feels broken on the menu page')
  ]
  const oracle = {
    samePairs: async (pairs) => pairs.map(p =>
      (p.a.includes('navbar') && p.b.includes('scroll')) || (p.a.includes('scroll') && p.b.includes('navbar'))
        ? false
        : true)
  }
  const { clusters } = await semanticClusters(abc, oracle, { minSize: 3 })
  assert.equal(clusters.length, 0, 'a chain of single links is not a cluster')
})
