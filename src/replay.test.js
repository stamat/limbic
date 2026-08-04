// Covers: end-to-end replay — the idempotence guarantee every downstream
// benchmark rests on, and the ledger's refusal to become a transcript store.
// Deliberately not covered: performance on multi-MB histories; replay is a
// batch tool and slow is acceptable, wrong is not.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { replay } from './replay.js'

async function fixture () {
  const root = await mkdtemp(join(tmpdir(), 'limbic-replay-'))
  const projects = join(root, 'projects')
  await mkdir(join(projects, 'proj-a'), { recursive: true })
  const entry = (text) => JSON.stringify({
    type: 'user',
    isSidechain: false,
    origin: { kind: 'human' },
    message: { role: 'user', content: [{ type: 'text', text }] },
    timestamp: '2026-08-04T00:00:00Z',
    sessionId: 'sess-1'
  })
  await writeFile(join(projects, 'proj-a', 'sess-1.jsonl'), [
    entry('build the widget'),
    entry('no, I meant the blue one'),
    entry('x'.repeat(2000)),
    entry('thanks, perfect')
  ].join('\n'))
  return { projects, ledger: join(root, 'ledger.jsonl') }
}

test('replaying the same history twice yields the same ledger', async () => {
  const { projects, ledger } = await fixture()
  await replay({ projectsDir: projects, ledgerPath: ledger })
  const first = await readFile(ledger, 'utf8')
  await replay({ projectsDir: projects, ledgerPath: ledger })
  const second = await readFile(ledger, 'utf8')
  assert.equal(first, second, 'replay is a rebuild, not an append')
})

test('stored prompt text is bounded, the ledger is not a transcript store', async () => {
  const { projects, ledger } = await fixture()
  await replay({ projectsDir: projects, ledgerPath: ledger })
  const records = (await readFile(ledger, 'utf8')).trim().split('\n').map(JSON.parse)
  for (const r of records) {
    assert.ok(r.text.length <= 300, `a ${r.text.length}-char prompt leaked past the cap`)
  }
})

test('parsing a missing file raises ENOENT for replay to count as vanished', async () => {
  const { parseSession } = await import('./transcript.js')
  await assert.rejects(parseSession('/nonexistent/limbic/file.jsonl'), { code: 'ENOENT' })
})

test('a correction after delivery scores surprise, praise closes at zero', async () => {
  const { projects, ledger } = await fixture()
  await replay({ projectsDir: projects, ledgerPath: ledger })
  const records = (await readFile(ledger, 'utf8')).trim().split('\n').map(JSON.parse)
  assert.equal(records[1].label, 'correction')
  assert.ok(records[1].surprise > 0)
  assert.equal(records[3].label, 'accept')
  assert.equal(records[3].surprise, 0)
})

async function behavioralFixture () {
  const root = await mkdtemp(join(tmpdir(), 'limbic-replay-'))
  const projects = join(root, 'projects')
  await mkdir(join(projects, 'proj-b'), { recursive: true })
  const at = (n) => `2026-08-04T00:0${n}:00Z`
  const human = (text, n) => JSON.stringify({
    type: 'user',
    isSidechain: false,
    origin: { kind: 'human' },
    message: { role: 'user', content: [{ type: 'text', text }] },
    timestamp: at(n),
    sessionId: 'sess-b'
  })
  const interrupt = (n) => JSON.stringify({
    type: 'user',
    isSidechain: false,
    message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] },
    timestamp: at(n),
    sessionId: 'sess-b'
  })
  const denial = (n) => JSON.stringify({
    type: 'user',
    isSidechain: false,
    message: { role: 'user', content: [{ type: 'tool_result', is_error: true, content: "The user doesn't want to proceed with this tool use." }] },
    timestamp: at(n),
    sessionId: 'sess-b'
  })
  await writeFile(join(projects, 'proj-b', 'sess-b.jsonl'), [
    human('build the widget', 0),
    interrupt(1),
    denial(2),
    human('no, I meant the blue one', 3)
  ].join('\n'))
  return { projects, ledger: join(root, 'ledger.jsonl') }
}

test('interruptions and denials land as zero-surprise events and pass the chain untouched', async () => {
  const { projects, ledger } = await behavioralFixture()
  const summary = await replay({ projectsDir: projects, ledgerPath: ledger })
  assert.equal(summary.interrupts, 1)
  assert.equal(summary.denials, 1)
  const records = (await readFile(ledger, 'utf8')).trim().split('\n').map(JSON.parse)
  const byLabel = Object.fromEntries(records.map(r => [r.label, r]))
  assert.equal(byLabel.interrupt.surprise, 0)
  assert.equal(byLabel.interrupt.text, '', 'a marker carries no user words into the ledger')
  assert.equal(byLabel.denial.surprise, 0)
  assert.equal(byLabel.correction.chain, 1, 'behavioral events neither extend nor reset the chain')
})

async function oracleFixture () {
  const root = await mkdtemp(join(tmpdir(), 'limbic-replay-'))
  const projects = join(root, 'projects')
  await mkdir(join(projects, 'proj-c'), { recursive: true })
  const assistant = JSON.stringify({
    type: 'assistant',
    isSidechain: false,
    message: { role: 'assistant', content: [{ type: 'text', text: 'Delivered the toggle component.' }] },
    timestamp: '2026-08-04T00:00:00Z',
    sessionId: 'sess-c'
  })
  const prompt = JSON.stringify({
    type: 'user',
    isSidechain: false,
    origin: { kind: 'human' },
    message: { role: 'user', content: [{ type: 'text', text: 'the toggle shifts the layout when opening' }] },
    timestamp: '2026-08-04T00:01:00Z',
    sessionId: 'sess-c'
  })
  await writeFile(join(projects, 'proj-c', 'sess-c.jsonl'), [assistant, prompt].join('\n'))
  return { projects, root, ledger: join(root, 'ledger.jsonl') }
}

test('a refuted oracle upgrade stays neutral, the cue recording why', async () => {
  const { Oracle } = await import('./oracle.js')
  const { projects, root, ledger } = await oracleFixture()
  let call = 0
  const oracle = new Oracle({
    cachePath: join(root, 'cache.jsonl'),
    execFn: async () => (++call === 1 ? '["correction"]' : '["no"]')
  })
  const summary = await replay({ projectsDir: projects, ledgerPath: ledger, oracle })
  assert.equal(summary.oracleRefuted, 1)
  assert.equal(summary.oracleUpgrades, 0)
  const record = (await readFile(ledger, 'utf8')).trim().split('\n').map(JSON.parse)[0]
  assert.equal(record.label, 'neutral')
  assert.equal(record.cue, 'oracle-refuted')
})

test('a validated oracle upgrade sticks', async () => {
  const { Oracle } = await import('./oracle.js')
  const { projects, root, ledger } = await oracleFixture()
  let call = 0
  const oracle = new Oracle({
    cachePath: join(root, 'cache.jsonl'),
    execFn: async () => (++call === 1 ? '["correction"]' : '["yes"]')
  })
  const summary = await replay({ projectsDir: projects, ledgerPath: ledger, oracle })
  assert.equal(summary.oracleUpgrades, 1)
  assert.equal(summary.oracleRefuted, 0)
  const record = (await readFile(ledger, 'utf8')).trim().split('\n').map(JSON.parse)[0]
  assert.equal(record.label, 'correction')
  assert.equal(record.cue, 'oracle')
})
