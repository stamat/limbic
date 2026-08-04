// Covers: the live hook's state guarantees — per-session chains under
// interleaving, and predictions scored exactly once. The hook is run as the
// real child process with HOME pointed at a temp dir, because the guarantee
// is about what lands on disk, not about internals.
// Deliberately not covered: classification itself (classify.test.js owns it)
// and the SessionStart/Stop hooks' claude calls (network is not a unit test).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const hook = join(dirname(fileURLToPath(import.meta.url)), 'classify.js')

function run (home, payload) {
  const env = { ...process.env, HOME: home }
  delete env.LIMBIC_ORACLE
  execFileSync('node', [hook], { input: JSON.stringify(payload), env })
}

async function ledger (home) {
  const raw = await readFile(join(home, '.limbic', 'live-ledger.jsonl'), 'utf8')
  return raw.trim().split('\n').map(JSON.parse)
}

test('chains are per-session: interleaved sessions never reset each other', async () => {
  const home = await mkdtemp(join(tmpdir(), 'limbic-hook-'))
  run(home, { prompt: 'no, wrong file', session_id: 'A' })
  run(home, { prompt: 'no, not that one', session_id: 'B' })
  run(home, { prompt: 'no, still the wrong file', session_id: 'A' })
  const records = await ledger(home)
  assert.deepEqual(records.map(r => r.chain), [1, 1, 2],
    'session A\'s second correction continues A\'s chain across B\'s interleaved prompt')
})

test('a scored prediction is consumed, never rescored against later prompts', async () => {
  const home = await mkdtemp(join(tmpdir(), 'limbic-hook-'))
  const dir = join(home, '.limbic')
  await mkdir(dir, { recursive: true })
  const predictionPath = join(dir, 'prediction.json')
  await writeFile(predictionPath, JSON.stringify({
    sessionId: 'A',
    predictions: ['run the tests now please']
  }))
  run(home, { prompt: 'run the tests now please', session_id: 'A' })
  run(home, { prompt: 'run the tests now please', session_id: 'A' })
  const records = await ledger(home)
  assert.equal(records[0].prediction?.hit, true, 'the standing prediction scores once')
  assert.equal(records[1].prediction, null, 'and is gone for the next prompt')
  await assert.rejects(access(predictionPath), 'the prediction file is consumed from disk')
})

test('a prediction for another session is left standing', async () => {
  const home = await mkdtemp(join(tmpdir(), 'limbic-hook-'))
  const dir = join(home, '.limbic')
  await mkdir(dir, { recursive: true })
  const predictionPath = join(dir, 'prediction.json')
  await writeFile(predictionPath, JSON.stringify({ sessionId: 'B', predictions: ['anything'] }))
  run(home, { prompt: 'unrelated prompt entirely', session_id: 'A' })
  await access(predictionPath)
})
