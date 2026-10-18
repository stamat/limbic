// Covers: clustering boundaries, dream idempotence, and the suppression
// guarantee — a rejected rule staying rejected is what makes the propose gate
// a gate and not a nag.
// Deliberately not covered: LLM phrasing (degrades to template by design;
// renting a model in CI would test the network, not the code).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
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

test('a directive is proposed alone, in its own words, and never activated', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'limbic-rules-'))
  const summary = await dream({ records: [ev('remember: commit subjects stay lowercase', 'directive')], dir })
  assert.equal(summary.proposed, 1, 'one prompt is enough when the user states the rule')
  const [rule] = await listRules(dir)
  assert.equal(rule.meta.status, 'proposed', 'the propose gate holds for a pasted "remember"')
  assert.match(rule.body, /commit subjects stay lowercase/, 'without --llm the directive is its own statement')
})

test('missed steps cluster into a rule as corrections do', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'limbic-rules-'))
  const missed = [
    ev('did we update the docs for the navbar?', 'missed_step'),
    ev('should we update the navbar docs?', 'missed_step'),
    ev('do we need to update the docs for navbar overflow?', 'missed_step')
  ]
  const summary = await dream({ records: missed, dir, threshold: 0.2 })
  assert.equal(summary.proposed, 1, 'three asks for the same skipped step are a lesson')
})

test('a rule from one project is scoped to it, a rule from two is not', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'limbic-rules-'))
  await dream({ records: overflowEvents, dir })
  const [scoped] = await listRules(dir)
  assert.equal(scoped.meta.project, 'proj-a', 'a lesson from one repo stays in that repo')
  const dir2 = await mkdtemp(join(tmpdir(), 'limbic-rules-'))
  await dream({ records: [...overflowEvents.slice(0, 2), ev('mobile navbar menu overflow clips the last item', 'correction', 'proj-b')], dir: dir2 })
  const [global] = await listRules(dir2)
  assert.equal(global.meta.project, undefined, 'a mistake made in two repos is about the agent')
})

test('accepting a rule dates it, so efficacy can split history there', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'limbic-rules-'))
  await dream({ records: overflowEvents, dir })
  const [rule] = await listRules(dir)
  const accepted = await setStatus(rule.file, 'accepted', dir, '2026-10-18')
  assert.equal(accepted.meta.accepted, '2026-10-18')
  const rejected = await setStatus(rule.file, 'rejected', dir)
  assert.equal(rejected.meta.accepted, undefined, 'a rejected rule carries no acceptance date')
})

test('the claude that phrases a rule runs with limbic switched off', async () => {
  // A fake claude on PATH answers with the guard it was given: unset, the
  // real one's hooks ledger the phrasing prompt as if the user typed it.
  const bin = await mkdtemp(join(tmpdir(), 'limbic-bin-'))
  await writeFile(join(bin, 'claude'), '#!/bin/sh\necho "guard=$LIMBIC_ORACLE"\n', { mode: 0o755 })
  const dir = await mkdtemp(join(tmpdir(), 'limbic-rules-'))
  const path = process.env.PATH
  process.env.PATH = `${bin}:${path}`
  try {
    await dream({ records: overflowEvents, dir, useLlm: true })
  } finally {
    process.env.PATH = path
  }
  const [rule] = await listRules(dir)
  assert.match(rule.body, /guard=1/, 'the phrasing claude ran with the user\'s hooks live')
})

test('a rule the doctrine already states is filed as covered, never proposed', async () => {
  const bin = await mkdtemp(join(tmpdir(), 'limbic-bin-'))
  await writeFile(join(bin, 'claude'), '#!/bin/sh\necho COVERED\n', { mode: 0o755 })
  const dir = await mkdtemp(join(tmpdir(), 'limbic-rules-'))
  const path = process.env.PATH
  process.env.PATH = `${bin}:${path}`
  let first, second
  try {
    first = await dream({ records: overflowEvents, dir, useLlm: true, doctrine: '- Check overflow on mobile.' })
    second = await dream({ records: overflowEvents, dir, useLlm: true, doctrine: '- Check overflow on mobile.' })
  } finally {
    process.env.PATH = path
  }
  assert.equal(first.covered, 1)
  assert.equal(first.proposed, 0)
  const [rule] = await listRules(dir)
  assert.equal(rule.meta.status, 'covered')
  assert.equal(second.skippedKnown, 1, 'a covered cluster came back as new on the next run')
})
