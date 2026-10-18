// Covers: remind repeats the named CLAUDE.md section once per session,
// records the delivery, and stays silent for a heading the doctrine lacks.
// Deliberately not covered: the hook `if` that decides when it fires —
// Claude Code evaluates that, not limbic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const hook = join(dirname(fileURLToPath(import.meta.url)), 'remind.js')

async function home () {
  const h = await mkdtemp(join(tmpdir(), 'limbic-remind-'))
  await mkdir(join(h, '.claude'), { recursive: true })
  await writeFile(join(h, '.claude', 'CLAUDE.md'), '# Commits\n\nOne line, lowercase.\n\n# Tests\n\nNames are sentences.\n')
  return h
}

function run (h, heading, sessionId = 'S') {
  const env = { ...process.env, HOME: h }
  delete env.LIMBIC_ORACLE
  return execFileSync('node', [hook, heading], { input: JSON.stringify({ session_id: sessionId, cwd: '/x' }), env }).toString()
}

test('the section is repeated once per session, and the delivery is ledgered', async () => {
  const h = await home()
  const first = JSON.parse(run(h, 'Commits'))
  assert.match(first.hookSpecificOutput.additionalContext, /One line, lowercase\./)
  assert.doesNotMatch(first.hookSpecificOutput.additionalContext, /Names are sentences/, 'the next section leaked in')
  assert.equal(run(h, 'Commits'), '', 'a second commit in the session got the reminder again')
  assert.notEqual(run(h, 'Commits', 'T'), '', 'another session lost its reminder')
  const records = (await readFile(join(h, '.limbic', 'live-ledger.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  assert.deepEqual(records.map(r => r.given[0]), ['CLAUDE.md#Commits', 'CLAUDE.md#Commits'])
})

test('a heading the doctrine lacks prints nothing and records nothing', async () => {
  const h = await home()
  assert.equal(run(h, 'Deploys'), '')
  await assert.rejects(readFile(join(h, '.limbic', 'live-ledger.jsonl')), 'a reminder that said nothing was counted as given')
})
