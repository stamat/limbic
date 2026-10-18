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

export function liveLedgerPath () {
  return join(homedir(), '.limbic', 'live-ledger.jsonl')
}

// Claude Code names a project's history directory after its cwd with `/` and
// `.` (seen; other characters assumed) turned into `-`. Replay reads that
// name, the live hook sees the raw cwd: until both went through here, one
// project was two keys in stats and a rule could not be scoped to either.
export function projectSlug (project) {
  return typeof project === 'string' ? project.replace(/[^A-Za-z0-9]/g, '-') : project
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
      const r = JSON.parse(line)
      out.push({ ...r, project: projectSlug(r.project) })
    } catch {}
  }
  return out
}

// The whole history is two files: replay's rebuild and the hook's appends.
// Replay cannot rebuild what Claude Code already deleted (transcripts expire
// after `cleanupPeriodDays`), so the live ledger is the only copy of older
// sessions. A session in both is replay's — it saw the previous turn and the
// oracle; the hook saw regex alone.
export async function readHistory (replayPath = defaultLedgerPath(), livePath = liveLedgerPath()) {
  const replayed = await readLedger(replayPath)
  const sessions = new Set(replayed.map(r => r.sessionId))
  const live = (await readLedger(livePath)).filter(r => !sessions.has(r.sessionId))
  return [...replayed, ...live].sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
}
