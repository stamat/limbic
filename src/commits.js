import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Compliance measured on what the agent made, not on what the user said:
// every commit message in the transcripts, checked against the Commits
// section of CLAUDE.md. A commit is frequent and the check needs no judge, so
// this answers in weeks where corrections — about 1% of sessions per rule —
// take months. The checks are the author's Commits doctrine, written out:
// one line, no Conventional Commits prefix, lowercase. A different doctrine
// needs different checks here.

// A command runs `git commit` only in a segment of its own; text that merely
// mentions it — a heredoc writing docs about commits — is not a commit. The
// first remind run fired on exactly that.
// A heredoc body is text, not commands — it is cut before the segments are
// read, or a script that writes `… && git commit -m b` into a file counts as
// a commit. The commit heredoc itself, `-m "$(cat <<'EOF' …)"`, is read first.
function withoutHeredocs (command) {
  return command.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\b/g, '')
}

export function runsCommit (command) {
  return withoutHeredocs(command).split(/&&|\|\||[;|\n]/).some(seg => /^\s*(cd\s+\S+\s+)?git(\s+-C\s+\S+)?(\s+-[a-zA-Z]\b)*\s+commit\b/.test(seg))
}

// The message of each commit a command makes — one entry per commit, since
// `git commit -m a && … && git commit -m b` is two commits, not a message with
// two lines. Read from -m "…" or -m '…', folded into a flag group (`-qm`,
// `-am`) or spelled `--message`, and from the heredoc form
// `-m "$(cat <<'EOF' … EOF)"` Claude Code writes by default. An entry is null
// when that commit's message cannot be read (-F, an editor).
export function commitMessages (command) {
  if (!runsCommit(command)) return []
  const heredoc = command.match(/-m\s+"\$\(cat\s+<<\s*'?(\w+)'?\n([\s\S]*?)\n\s*\1\s*\)"/)
  if (heredoc) return [heredoc[2]]
  return withoutHeredocs(command).split(/&&|\|\||;/).filter(runsCommit).map(seg => {
    const parts = [...seg.matchAll(/(?:^|\s)(?:-[a-zA-Z]*m|--message)(?:\s+|=)(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/g)].map(m => m[1] ?? m[2])
    return parts.length ? parts.join('\n\n') : null
  })
}

export function commitViolations (message) {
  const out = []
  const text = message.trim()
  if (text.includes('\n')) out.push('more than one line')
  if (/^[a-z]+(\([^)]*\))?!?:\s/i.test(text)) out.push('conventional commits prefix')
  if (/^[A-Z]/.test(text)) out.push('not lowercase')
  return out
}

// Every commit an agent session made, from the transcripts on disk.
export async function scanCommits (projectsDir) {
  const out = []
  let dirs = []
  try { dirs = await readdir(projectsDir, { withFileTypes: true }) } catch { return out }
  for (const d of dirs.filter(d => d.isDirectory())) {
    let files = []
    try { files = (await readdir(join(projectsDir, d.name))).filter(f => f.endsWith('.jsonl')) } catch { continue }
    for (const f of files) {
      let raw
      try { raw = await readFile(join(projectsDir, d.name, f), 'utf8') } catch { continue }
      for (const line of raw.split('\n')) {
        if (!line.includes('commit')) continue
        let e
        try { e = JSON.parse(line) } catch { continue }
        if (e.isSidechain || !Array.isArray(e.message?.content)) continue
        for (const c of e.message.content) {
          if (c.type !== 'tool_use' || c.name !== 'Bash' || !runsCommit(c.input?.command ?? '')) continue
          for (const message of commitMessages(c.input.command)) {
            out.push({ ts: e.timestamp, sessionId: e.sessionId ?? f.replace(/\.jsonl$/, ''), project: d.name, message, violations: message === null ? null : commitViolations(message) })
          }
        }
      }
    }
  }
  return out.sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
}

// Commits split by what their session was told: the reminder given, held out
// by the holdout, or neither (before remind, or a session that never committed
// past the hook). `key` is the injected entry, `CLAUDE.md#Commits`.
export function byReminder (commits, records, key = 'CLAUDE.md#Commits') {
  const given = new Set()
  const held = new Set()
  for (const r of records) {
    if (r.label !== 'injected') continue
    if (r.given?.includes(key)) given.add(r.sessionId)
    if (r.held?.includes(key)) held.add(r.sessionId)
  }
  const groups = { given: [], held: [], none: [] }
  for (const c of commits) {
    if (c.violations === null) continue
    groups[given.has(c.sessionId) ? 'given' : held.has(c.sessionId) ? 'held' : 'none'].push(c)
  }
  return groups
}
