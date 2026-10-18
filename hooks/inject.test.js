// Covers: which accepted rules reach a session — scope by project, and the
// safe side when the session does not say where it is.
// Deliberately not covered: rule wording (dream.test.js owns rule files).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const hook = join(dirname(fileURLToPath(import.meta.url)), 'inject.js')

async function homeWithRules () {
  const home = await mkdtemp(join(tmpdir(), 'limbic-inject-'))
  const dir = join(home, '.limbic', 'rules')
  await mkdir(dir, { recursive: true })
  const rule = (name, status, project) => writeFile(join(dir, `${name}.md`),
    `---\nstatus: ${status}\nsize: 3\n${project ? `project: ${project}\n` : ''}signature: ${name}\n---\n\n## Proposed rule\n\nrule ${name}\n\n## Evidence (3 events)\n`)
  await rule('everywhere', 'accepted')
  await rule('sidebar', 'accepted', '-Users-me-book')
  await rule('pending', 'proposed')
  return home
}

function run (home, payload) {
  const env = { ...process.env, HOME: home }
  delete env.LIMBIC_ORACLE
  return execFileSync('node', [hook], { input: payload, env }).toString()
}

test('a scoped rule reaches its own project and no other', async () => {
  const home = await homeWithRules()
  const inBook = run(home, JSON.stringify({ cwd: '/Users/me/book' }))
  assert.match(inBook, /rule sidebar/, 'the project lost its own rule')
  assert.match(inBook, /rule everywhere/)
  const elsewhere = run(home, JSON.stringify({ cwd: '/Users/me/shop' }))
  assert.doesNotMatch(elsewhere, /rule sidebar/, 'a lesson from one repo leaked into another')
  assert.match(elsewhere, /rule everywhere/)
  assert.doesNotMatch(elsewhere, /rule pending/, 'a proposed rule reached a session')
})

test('a session with no cwd gets global rules alone', async () => {
  const home = await homeWithRules()
  const out = run(home, 'not json')
  assert.match(out, /rule everywhere/)
  assert.doesNotMatch(out, /rule sidebar/, 'a scoped rule reached a session that cannot prove its project')
})

test('the strongest rules come first, the cap holds, and the session is ledgered', async () => {
  const home = await mkdtemp(join(tmpdir(), 'limbic-inject-'))
  const dir = join(home, '.limbic', 'rules')
  await mkdir(dir, { recursive: true })
  for (let i = 1; i <= 14; i++) {
    await writeFile(join(dir, `r${i}.md`),
      `---\nstatus: accepted\nsize: ${i}\nsignature: r${i}\n---\n\n## Proposed rule\n\nrule r${i}\n\n## Evidence (${i} events)\n`)
  }
  const out = run(home, JSON.stringify({ cwd: '/x', session_id: 'S' }))
  const shown = [...out.matchAll(/^- rule (r\d+)/gm)].map(m => m[1])
  assert.equal(shown.length, 12, 'more rules is not more help — the cap did not hold')
  assert.equal(shown[0], 'r14', 'the rule with the most evidence was not first')
  assert.match(out, /2 more accepted rules held back/, 'rules were dropped without a word')
  const [record] = (await readFile(join(home, '.limbic', 'live-ledger.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  assert.equal(record.label, 'injected')
  assert.equal(record.given.length, 12, 'efficacy cannot count a delivery nobody recorded')
})
