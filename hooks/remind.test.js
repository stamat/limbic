// Covers: remind repeats the named CLAUDE.md section once per session,
// holds it out of half the sessions, fires on a commit that runs and not on
// text that mentions one, records each delivery, and stays silent for a
// heading the doctrine lacks.
// Deliberately not covered: the hook `if` that decides when it is called —
// Claude Code evaluates that, not limbic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const hook = join(dirname(fileURLToPath(import.meta.url)), 'remind.js')
const held = (sid, heading = 'Commits') => createHash('sha256').update(`${sid}:CLAUDE.md#${heading}`).digest()[0] % 2 === 0
const ids = (want, n) => Array.from({ length: 200 }, (_, i) => `s${i}`).filter(s => held(s) === want).slice(0, n)
const [given1, given2] = ids(false, 2)
const [held1] = ids(true, 1)

async function home () {
  const h = await mkdtemp(join(tmpdir(), 'limbic-remind-'))
  await mkdir(join(h, '.claude'), { recursive: true })
  await writeFile(join(h, '.claude', 'CLAUDE.md'), '# Commits\n\nOne line, lowercase.\n\n# Tests\n\nNames are sentences.\n')
  return h
}

function run (h, args, sessionId, command = 'git commit -m "x"') {
  const env = { ...process.env, HOME: h }
  delete env.LIMBIC_ORACLE
  return execFileSync('node', [hook, ...args], {
    input: JSON.stringify({ session_id: sessionId, cwd: '/x', tool_input: { command } }), env
  }).toString()
}

const ledger = async h => (await readFile(join(h, '.limbic', 'live-ledger.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)

test('the section is repeated once per session, and the delivery is ledgered', async () => {
  const h = await home()
  const first = JSON.parse(run(h, ['Commits'], given1))
  assert.match(first.hookSpecificOutput.additionalContext, /One line, lowercase\./)
  assert.doesNotMatch(first.hookSpecificOutput.additionalContext, /Names are sentences/, 'the next section leaked in')
  assert.equal(run(h, ['Commits'], given1), '', 'a second commit in the session got the reminder again')
  assert.notEqual(run(h, ['Commits'], given2), '', 'another session lost its reminder')
  assert.deepEqual((await ledger(h)).map(r => r.given[0]), ['CLAUDE.md#Commits', 'CLAUDE.md#Commits'])
})

test('a held-out session gets no reminder, and the holdout is recorded once', async () => {
  const h = await home()
  assert.equal(run(h, ['Commits'], held1), '', 'a held-out session was reminded')
  assert.equal(run(h, ['Commits'], held1), '')
  const records = await ledger(h)
  assert.equal(records.length, 1, 'the holdout was recorded on every commit, not once')
  assert.deepEqual(records[0].held, ['CLAUDE.md#Commits'])
})

test('with --commit, text that only mentions a commit does not fire it', async () => {
  const h = await home()
  const mention = "python3 - <<'EOF'\nprint('run git commit later')\nEOF"
  assert.equal(run(h, ['Commits', '--commit'], given1, mention), '', 'a heredoc mentioning git commit fired the reminder')
  assert.notEqual(run(h, ['Commits', '--commit'], given1, 'git add -A && git commit -q -m "fix it"'), '',
    'the real commit lost its reminder to the false one')
})

test('a heading the doctrine lacks prints nothing and records nothing', async () => {
  const h = await home()
  assert.equal(run(h, ['Deploys'], given1), '')
  await assert.rejects(readFile(join(h, '.limbic', 'live-ledger.jsonl')), 'a reminder that said nothing was counted as given')
})
