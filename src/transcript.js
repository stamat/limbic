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

// IDE context rides inside the prompt text itself: selection and opened-file
// blocks contain arbitrary code and prose the user did not type. Left in, a
// selected line saying "doesn't work" labels the prompt a fix_request — the
// first replay audit caught exactly that. Stripped, not rejected: the user's
// own words often follow the block.
const WRAPPER_BLOCKS = /<(ide_selection|ide_opened_file|system-reminder)>[\s\S]*?<\/\1>/g

export function stripWrappers (text) {
  return text.replace(WRAPPER_BLOCKS, '').trim()
}

// Interruptions and tool denials are corrections nobody typed: Esc mid-turn
// and a rejected tool call both say "not that" without a single user word.
// They become behavioral events, never prompts — no text means nothing for
// the classifier or the chain to read, so they carry their own labels and
// zero surprise until live data (i4) earns them a weight. Plan rejections
// arrive with the same denial message and are not separable from it.
const INTERRUPT = /^\[Request interrupted by user( for tool use)?\]$/
const DENIAL = /doesn.t want to proceed with this tool use/i

// The agent confessing its own mistake is a defect that never needed a user
// correction — repeated confessions are doctrine material too. Assistant text
// is model output, so these cues are deliberately narrow confessions, never
// work narration ("let me fix the test" is ordinary iteration, not a
// confession), and the event can never masquerade as something the user said:
// its label is behavioral-family and it feeds no rule until proven.
const SELF_CORRECTION = [
  /\bmy mistake\b/i,
  /\bi was wrong\b/i,
  /\bi (incorrectly|mistakenly|wrongly)\b/i,
  /\bi (misread|misunderstood|overlooked)\b/i,
  /\bactually,? (that|this|it) (is|was) (wrong|incorrect)\b/i,
  /\bscratch that\b/i,
  /\bcorrecting my (earlier|previous)\b/i
]

export function selfCorrection (text) {
  for (const cue of SELF_CORRECTION) {
    const m = cue.exec(text)
    if (m) {
      const start = Math.max(0, m.index - 60)
      return { cue: cue.source, excerpt: text.slice(start, m.index + 140).replace(/\n/g, ' ').trim() }
    }
  }
  return null
}

export function behavioralEvent (entry) {
  if (entry.type !== 'user' || entry.isSidechain) return null
  const content = entry.message?.content
  if (!Array.isArray(content)) return null
  for (const c of content) {
    if (c.type !== 'tool_result' || !c.is_error) continue
    const text = typeof c.content === 'string' ? c.content : JSON.stringify(c.content ?? '')
    if (DENIAL.test(text)) return { kind: 'denial' }
  }
  const text = content
    .filter(c => c.type === 'text' && c.text)
    .map(c => c.text)
    .join('\n')
    .trim()
  if (INTERRUPT.test(text)) return { kind: 'interrupt' }
  return null
}

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

function assistantText (entry) {
  if (entry.type !== 'assistant' || entry.isSidechain) return null
  const content = entry.message?.content
  if (!Array.isArray(content)) return null
  const text = content
    .filter(c => c.type === 'text' && c.text)
    .map(c => c.text)
    .join('\n')
    .trim()
  return text || null
}

function isCommandWrapper (text) {
  return COMMAND_MARKERS.some(m => text.includes(m))
}

// Malformed lines are counted, never fatal: a transcript is hostile input —
// truncated writes and mid-write reads are normal on a live session file.
export async function parseSession (filePath) {
  const session = { file: basename(filePath), sessionId: null, prompts: [], behavioral: [], badLines: 0 }
  let lastAssistant = null
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
    // The tail of the last assistant turn rides along as context: "the toggle
    // should not shift" is only classifiable against what was just delivered.
    // Tail, not head — the closing summary is where delivered work is named.
    const at = assistantText(entry)
    if (at) {
      lastAssistant = at.slice(-400)
      const sc = selfCorrection(at)
      if (sc) {
        session.behavioral.push({
          kind: 'self_correction',
          cue: sc.cue,
          excerpt: sc.excerpt,
          ts: entry.timestamp ?? null,
          cwd: entry.cwd ?? null,
          gitBranch: entry.gitBranch ?? null
        })
      }
      continue
    }
    const b = behavioralEvent(entry)
    if (b) {
      session.behavioral.push({
        kind: b.kind,
        ts: entry.timestamp ?? null,
        cwd: entry.cwd ?? null,
        gitBranch: entry.gitBranch ?? null
      })
      continue
    }
    if (!isHumanPrompt(entry)) continue
    const text = stripWrappers(promptText(entry))
    if (!text || isCommandWrapper(text)) continue
    session.prompts.push({
      ts: entry.timestamp ?? null,
      text,
      context: lastAssistant,
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
