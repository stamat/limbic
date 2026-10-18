// Covers: one spelling per project across the two ledgers, and the history
// read that keeps sessions Claude Code has already deleted.
// Deliberately not covered: Claude Code's slug for characters other than `/`
// and `.` — only those two were seen on disk, the rest is assumed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectSlug, readHistory } from './ledger.js'

const line = r => JSON.stringify(r) + '\n'

test('a cwd and its history directory name are one project', () => {
  assert.equal(projectSlug('/Users/stamat/Sites/localhost/setaj.rs'), '-Users-stamat-Sites-localhost-setaj-rs',
    'the live hook and replay named the same project two ways')
  assert.equal(projectSlug('-Users-stamat-Sites-localhost-setaj-rs'), '-Users-stamat-Sites-localhost-setaj-rs',
    'a slug passes through unchanged')
})

test('history keeps live sessions replay lost, and replay wins a session both hold', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'limbic-ledger-'))
  const replayed = join(dir, 'ledger.jsonl')
  const live = join(dir, 'live.jsonl')
  await writeFile(replayed, line({ ts: '2026-10-02T00:00:00Z', sessionId: 'B', label: 'correction', project: '-p', text: 'replay saw the turn' }))
  await writeFile(live,
    line({ ts: '2026-08-01T00:00:00Z', sessionId: 'A', label: 'neutral', project: '/p', text: 'transcript since deleted' }) +
    line({ ts: '2026-10-02T00:00:01Z', sessionId: 'B', label: 'neutral', project: '/p', text: 'regex only' }))
  const records = await readHistory(replayed, live)
  assert.deepEqual(records.map(r => r.text), ['transcript since deleted', 'replay saw the turn'],
    'a deleted session vanished, or a session was counted twice')
  assert.ok(records.every(r => r.project === '-p'), 'both ledgers read as one project')
})
