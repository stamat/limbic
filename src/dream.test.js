// Covers: clustering boundaries, dream idempotence, and the suppression
// guarantee — a rejected rule staying rejected is what makes the propose gate
// a gate and not a nag.
// Deliberately not covered: LLM phrasing (degrades to template by design;
// renting a model in CI would test the network, not the code).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cluster } from './cluster.js'
import { dream } from './dream.js'
import { listRules, setStatus } from './rules.js'

const ev = (text, label = 'correction', project = 'proj-a', ts = '2026-08-04T00:00:00Z') =>
  ({ text, label, project, ts })

const overflowEvents = [
  ev('the navbar overflow is broken again on mobile'),
  ev('navbar overflow still wrong, menu clips on mobile'),
  ev('mobile navbar menu overflow clips the last item')
]

test('three prompts about the same overflow bug land in one cluster', () => {
  const cs = cluster(overflowEvents)
  assert.equal(cs.length, 1)
  assert.equal(cs[0].size, 3)
  assert.ok(cs[0].shared.has('navbar'), 'the cluster can say why it exists')
})

test('a singleton complaint never becomes a rule', () => {
  const cs = cluster([ev('the footer is ugly'), ...overflowEvents])
  assert.equal(cs.length, 1, 'only the recurring mistake clusters')
})

test('unrelated corrections do not glue into one cluster', () => {
  const cs = cluster([
    ...overflowEvents,
    ev('no, commit messages stay lowercase'),
    ev('i meant lowercase commit subjects'),
    ev('commit subject must be lowercase, fix it')
  ])
  assert.equal(cs.length, 2)
})

test('dreaming twice proposes each cluster once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'limbic-rules-'))
  const first = await dream({ records: overflowEvents, dir })
  assert.equal(first.proposed, 1)
  const second = await dream({ records: overflowEvents, dir })
  assert.equal(second.proposed, 0)
  assert.equal(second.skippedKnown, 1)
  assert.equal((await readdir(dir)).length, 1, 'one cluster, one file, forever')
})

test('a rejected cluster never re-proposes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'limbic-rules-'))
  await dream({ records: overflowEvents, dir })
  const [rule] = await listRules(dir)
  await setStatus(rule.file, 'rejected', dir)
  const again = await dream({ records: overflowEvents, dir })
  assert.equal(again.proposed, 0, 'rejection is remembered, not renegotiated')
  const [after] = await listRules(dir)
  assert.equal(after.meta.status, 'rejected')
})

test('a proposed rule file carries its evidence and an editable statement', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'limbic-rules-'))
  await dream({ records: overflowEvents, dir })
  const [file] = await readdir(dir)
  const raw = await readFile(join(dir, file), 'utf8')
  assert.match(raw, /status: proposed/)
  assert.match(raw, /## Evidence \(3 events\)/)
  assert.match(raw, /navbar overflow/i, 'the evidence quotes the real prompts')
})
