// Covers: the trust boundary — what from a hostile session file may become a
// ledger event. Everything here defends one guarantee: the classifier only
// ever scores text the user actually typed.
// Deliberately not covered: Claude Code's full entry taxonomy; anything not
// matching the human-prompt shape is rejected by default, so new entry types
// are safe without new code.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isHumanPrompt, parseSession } from './transcript.js'

const human = (text) => ({
  type: 'user',
  isSidechain: false,
  origin: { kind: 'human' },
  message: { role: 'user', content: [{ type: 'text', text }] },
  timestamp: '2026-08-04T00:00:00Z',
  sessionId: 's1'
})

test('a sidechain prompt never becomes a human event', () => {
  assert.equal(isHumanPrompt({ ...human('do the thing'), isSidechain: true }), false)
})

test('a tool_result user entry is not a prompt', () => {
  const entry = { ...human(''), message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }
  assert.equal(isHumanPrompt(entry), false)
})

test('an entry without a human origin is not a prompt', () => {
  assert.equal(isHumanPrompt({ ...human('hi'), origin: { kind: 'agent' } }), false)
})

test('a malformed line is counted, not fatal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'limbic-'))
  const file = join(dir, 's.jsonl')
  await writeFile(file, [
    JSON.stringify(human('first')),
    '{truncated mid-write',
    JSON.stringify(human('second'))
  ].join('\n'))
  const session = await parseSession(file)
  assert.equal(session.badLines, 1)
  assert.equal(session.prompts.length, 2, 'good lines around a bad one survive')
})

test('selected code saying doesnt-work cannot label the prompt a fix_request', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'limbic-'))
  const file = join(dir, 's.jsonl')
  const text = '<ide_selection>The user selected: // this doesn\'t work on safari</ide_selection>add a changelog entry'
  await writeFile(file, JSON.stringify(human(text)) + '\n')
  const session = await parseSession(file)
  assert.equal(session.prompts.length, 1)
  assert.equal(session.prompts[0].text, 'add a changelog entry', 'only the typed words survive the boundary')
})

test('a prompt that is only an ide wrapper vanishes entirely', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'limbic-'))
  const file = join(dir, 's.jsonl')
  await writeFile(file, JSON.stringify(human('<ide_opened_file>The user opened foo.js</ide_opened_file>')) + '\n')
  const session = await parseSession(file)
  assert.equal(session.prompts.length, 0)
})

test('a slash command wrapper is plumbing, not a prompt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'limbic-'))
  const file = join(dir, 's.jsonl')
  await writeFile(file, JSON.stringify(human('<command-name>/model</command-name>')) + '\n')
  const session = await parseSession(file)
  assert.equal(session.prompts.length, 0)
})
