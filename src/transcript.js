import { createReadStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { join, basename } from 'node:path'

// Claude Code writes one JSONL file per session under ~/.claude/projects/<slug>/.
// A "human prompt" is the only entry kind limbic reads: everything else in the
// stream — tool results, sidechain (subagent) traffic, hook attachments, slash
// command wrappers — is agent plumbing and must never enter the ledger, or the
// classifier scores text the user never typed.
const COMMAND_MARKERS = ['<command-name>', '<local-command-stdout>', '<local-command-caveat>']

export function isHumanPrompt (entry) {
  if (entry.type !== 'user') return false
  if (entry.isSidechain) return false
  if (entry.origin?.kind !== 'human') return false
  const content = entry.message?.content
  if (!Array.isArray(content)) return false
  return content.some(c => c.type === 'text' && c.text?.trim())
}

export function promptText (entry) {
  return entry.message.content
    .filter(c => c.type === 'text' && c.text)
    .map(c => c.text)
    .join('\n')
    .trim()
}

function isCommandWrapper (text) {
  return COMMAND_MARKERS.some(m => text.includes(m))
}

// Malformed lines are counted, never fatal: a transcript is hostile input —
// truncated writes and mid-write reads are normal on a live session file.
export async function parseSession (filePath) {
  const session = { file: basename(filePath), sessionId: null, prompts: [], badLines: 0 }
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      session.badLines++
      continue
    }
    session.sessionId ??= entry.sessionId ?? null
    if (!isHumanPrompt(entry)) continue
    const text = promptText(entry)
    if (!text || isCommandWrapper(text)) continue
    session.prompts.push({
      ts: entry.timestamp ?? null,
      text,
      cwd: entry.cwd ?? null,
      gitBranch: entry.gitBranch ?? null
    })
  }
  return session
}

export async function listSessionFiles (projectsDir, projectFilter = null) {
  const out = []
  const projects = await readdir(projectsDir, { withFileTypes: true })
  for (const p of projects) {
    if (!p.isDirectory()) continue
    if (projectFilter && p.name !== projectFilter) continue
    const dir = join(projectsDir, p.name)
    for (const f of await readdir(dir)) {
      if (f.endsWith('.jsonl')) out.push({ project: p.name, path: join(dir, f) })
    }
  }
  return out
}
