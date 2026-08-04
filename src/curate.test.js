// Covers: the curator's coverage judgment and its degrade direction — when in
// doubt, propose; never silently drop a rule, never write the doctrine file.
// Deliberately not covered: the printing (bin glue) and the human's final
// paste — the gate is a rule landing in CLAUDE.md by the user's hand, which
// no test can assert.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { curate, doctrineLines } from './curate.js'
import { Embedder } from './embed.js'
import { Oracle } from './oracle.js'

const DOCTRINE = `# Standards

- **Read the README and docs end to end before calling work done** — as a stranger.
- Native and stdlib first. Root cause over symptom.

## Tests

Test names are sentences describing the guarantee, not the function.
`

test('doctrine lines are the instructions, never the headings or decoration', () => {
  const lines = doctrineLines(DOCTRINE)
  assert.ok(lines.some(l => l.startsWith('Read the README')), 'bold and bullet stripped')
  assert.ok(!lines.some(l => l.includes('#')), 'headings organize, they do not instruct')
})

const cachePath = async () => join(await mkdtemp(join(tmpdir(), 'limbic-curate-')), 'c.jsonl')

test('a rule the doctrine already covers is reported covered, not proposed again', async () => {
  const vectors = {
    'Read docs end to end before done. Verify nothing contradicts.': [1, 0.02, 0],
    'Read the README and docs end to end before calling work done — as a stranger.': [0.99, 0.01, 0],
    'Native and stdlib first. Root cause over symptom.': [0, 1, 0],
    'Test names are sentences describing the guarantee, not the function.': [0, 0, 1]
  }
  const embedder = new Embedder({ cachePath: await cachePath(), fetchFn: async (t) => vectors[t] ?? [0.5, 0.5, 0.5] })
  const oracle = new Oracle({ cachePath: await cachePath(), execFn: async () => '["yes"]' })
  const rules = [{ file: 'r.md', size: 3, statement: 'Read docs end to end before done. Verify nothing contradicts.' }]
  const { additions, covered } = await curate({ rules, doctrine: DOCTRINE, oracle, embedder })
  assert.equal(covered.length, 1, 'the hand-kept line covers the deduced rule')
  assert.equal(additions.length, 0)
})

test('with no embedder every rule is proposed — doubt proposes, never drops', async () => {
  const rules = [{ file: 'r.md', size: 2, statement: 'Keep shadows within the sidebar bounds using overflow hidden.' }]
  const { additions, covered } = await curate({ rules, doctrine: DOCTRINE })
  assert.equal(additions.length, 1)
  assert.equal(covered.length, 0)
})
