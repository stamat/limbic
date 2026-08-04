import { appendFile, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

// Stored prompt text is capped: the ledger is a scoring record, not a transcript
// store — that job is refused in CONTRIBUTING.md. 300 chars keeps the cue
// context auditable without quietly becoming a session archive.
const TEXT_CAP = 300

export function defaultLedgerPath () {
  return join(homedir(), '.limbic', 'ledger.jsonl')
}

export function toRecord (event, { project, sessionId }) {
  return {
    ts: event.ts,
    project,
    sessionId,
    label: event.label,
    cue: event.cue,
    chain: event.chain,
    surprise: event.surprise,
    trace: event.trace,
    gitBranch: event.gitBranch ?? null,
    text: event.text.slice(0, TEXT_CAP)
  }
}

export async function resetLedger (path) {
  await rm(path, { force: true })
  await mkdir(dirname(path), { recursive: true })
}

export async function appendRecords (path, records) {
  if (!records.length) return
  await mkdir(dirname(path), { recursive: true })
  const lines = records.map(r => JSON.stringify(r)).join('\n') + '\n'
  await appendFile(path, lines)
}

export async function readLedger (path) {
  let raw
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return []
  }
  const out = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {}
  }
  return out
}
