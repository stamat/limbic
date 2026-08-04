#!/usr/bin/env node
// Stop hook, opt-in (costs one Haiku call per turn): predict the user's
// likely next ask from the turn's tail, store it; classify.js's next run
// scores hit/miss into the live ledger. Every delivery is already the
// implicit prediction "this is done" — this hook adds the explicit second
// axis: novelty. A prediction hit that repeats becomes preemption material;
// a miss is an episode worth remembering. Failure of any kind exits 0
// silently: prediction is a bonus signal, never a tax on the session.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { open, writeFile, mkdir } from 'node:fs/promises'
// Stdin is fd 0 — the promises readFile refuses fds, the sync one reads them.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

if (process.env.LIMBIC_ORACLE) process.exit(0)

try {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  // Transcripts reach tens of MB and this hook runs every turn: read only the
  // tail — the last assistant text lives there. A line cut at the tail's edge
  // fails JSON.parse and is skipped like any malformed line.
  const TAIL = 65536
  const fh = await open(input.transcript_path, 'r')
  let transcript
  try {
    const { size } = await fh.stat()
    const start = Math.max(0, size - TAIL)
    const buf = Buffer.alloc(size - start)
    await fh.read(buf, 0, buf.length, start)
    transcript = buf.toString('utf8')
  } finally {
    await fh.close()
  }
  const lines = transcript.trim().split('\n').slice(-40)
  let lastAssistant = null
  for (const line of lines) {
    try {
      const e = JSON.parse(line)
      if (e.type === 'assistant' && !e.isSidechain) {
        const text = (e.message?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n')
        if (text.trim()) lastAssistant = text.slice(-500)
      }
    } catch {}
  }
  if (lastAssistant) {
    const { stdout } = await promisify(execFile)('claude',
      ['-p', '--model', 'haiku',
        `An AI coding agent just finished a turn ending with:\n---\n${lastAssistant}\n---\nPredict the user's most likely next message. Reply with ONLY a JSON array of 3 short candidate messages.`],
      { timeout: 60000, env: { ...process.env, LIMBIC_ORACLE: '1' } })
    const m = stdout.match(/\[[\s\S]*?\]/)
    if (m) {
      const predictions = JSON.parse(m[0]).slice(0, 3).map(String)
      const path = join(homedir(), '.limbic', 'prediction.json')
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, JSON.stringify({ sessionId: input.session_id ?? null, ts: new Date().toISOString(), predictions }))
    }
  }
} catch {}
process.exit(0)
