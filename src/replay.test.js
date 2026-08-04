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

test('a correction after delivery scores surprise, praise closes at zero', async () => {
  const { projects, ledger } = await fixture()
  await replay({ projectsDir: projects, ledgerPath: ledger })
  const records = (await readFile(ledger, 'utf8')).trim().split('\n').map(JSON.parse)
  assert.equal(records[1].label, 'correction')
  assert.ok(records[1].surprise > 0)
  assert.equal(records[3].label, 'accept')
  assert.equal(records[3].surprise, 0)
})
