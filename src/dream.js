import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cluster } from './cluster.js'
import { listRules, writeRule, rulesDir } from './rules.js'

const exec = promisify(execFile)

const CORRECTIVE = new Set(['correction', 'fix_request', 'challenge'])
// A dream run proposes at most this many rules: an inbox that scrolls is an
// inbox that gets ignored, and Evo-Memory's finding stands — unbounded memory
// growth degrades retrieval, human retrieval included.
const MAX_PROPOSALS = 10

// The LLM only ever phrases the rule; it never picks the cluster. Membership
// and evidence stay deterministic and auditable — language is the only part
// worth renting a model for. `claude -p` rides subscription auth; any failure
// (no binary, timeout, garbage output) degrades to the template statement,
// stated in the rule body, never a crash.
async function phrase (events, useLlm) {
  const fallback = `Recurring ${events[0].label} (${events.length}×): "${events[0].text.slice(0, 120)}" — phrase this rule by editing this file.`
  if (!useLlm) return fallback
  const prompt = [
    'These user messages are corrections of an AI coding agent, clustered as one repeated mistake.',
    'Write ONE imperative rule (max 2 lines) the agent should follow to prevent this mistake. Output only the rule.',
    '',
    ...events.map(e => `- ${e.text.replace(/\n/g, ' ').slice(0, 200)}`)
  ].join('\n')
  try {
    const { stdout } = await exec('claude', ['-p', '--model', 'haiku', prompt], { timeout: 60000 })
    const line = stdout.trim()
    return line && line.length < 500 ? line : fallback
  } catch {
    return fallback
  }
}

export async function dream ({ records, dir = rulesDir(), useLlm = false, minSize = 3, threshold = 0.25 }) {
  const corrective = records.filter(r => CORRECTIVE.has(r.label))
  const clusters = cluster(corrective, { minSize, threshold })

  const existing = await listRules(dir)
  const known = new Set(existing.map(r => r.meta.signature))

  const summary = { corrective: corrective.length, clusters: clusters.length, proposed: 0, skippedKnown: 0 }
  for (const c of clusters) {
    if (summary.proposed >= MAX_PROPOSALS) break
    if (known.has(c.signature)) {
      summary.skippedKnown++
      continue
    }
    c.statement = await phrase(c.events, useLlm)
    await writeRule(c, dir)
    summary.proposed++
  }
  return summary
}
