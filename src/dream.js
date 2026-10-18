import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cluster, tokens } from './cluster.js'
import { semanticClusters } from './semantic.js'
import { listRules, writeRule, rulesDir } from './rules.js'

import { LESSON } from './surprise.js'

const exec = promisify(execFile)
// A dream run proposes at most this many rules: an inbox that scrolls is an
// inbox that gets ignored, and Evo-Memory's finding stands — unbounded memory
// growth degrades retrieval, human retrieval included.
const MAX_PROPOSALS = 10

// The doctrine rides in every phrase call, so it is capped: a CLAUDE.md is a
// few thousand tokens, and a pasted novel must not multiply the cost of ten
// claude calls.
const DOCTRINE_CAP = 24000

// The model's whole answer when the doctrine already holds the rule.
const COVERED = 'COVERED'

// The LLM only ever phrases the rule; it never picks the cluster. Membership
// and evidence stay deterministic and auditable — language is the only part
// worth renting a model for. `claude -p` rides subscription auth; any failure
// (no binary, timeout, garbage output) degrades to the template statement,
// stated in the rule body, never a crash. With the user's doctrine in hand the
// model writes in its vocabulary and register, and may answer COVERED.
async function phrase (events, { useLlm, doctrine, directive }) {
  const fallback = directive
    ? events[0].text.replace(/\n/g, ' ')
    : `Recurring ${events[0].label} (${events.length}×): "${events[0].text.slice(0, 120)}" — phrase this rule by editing this file.`
  if (!useLlm) return fallback
  const prompt = [
    directive
      ? 'This user message asks an AI coding agent to remember a standing instruction.'
      : 'These user messages are corrections of an AI coding agent, clustered as one repeated mistake.',
    'Write ONE imperative rule (max 2 lines) the agent should follow from now on. Output only the rule.',
    ...(doctrine
      ? [
          'The user\'s own instructions to the agent follow. Write the rule in their vocabulary and style.',
          `If they already state this rule, output only ${COVERED}.`,
          '<instructions>', doctrine.slice(0, DOCTRINE_CAP), '</instructions>'
        ]
      : []),
    '',
    ...events.map(e => `- ${e.text.replace(/\n/g, ' ').slice(0, 200)}`)
  ].join('\n')
  try {
    // LIMBIC_ORACLE keeps the spawned claude's own hooks out: without it the
    // live hook ledgered this prompt as the user's, twelve times in two runs.
    const { stdout } = await exec('claude', ['-p', '--model', 'haiku', prompt],
      { timeout: 60000, env: { ...process.env, LIMBIC_ORACLE: '1' } })
    const line = stdout.trim()
    return line && line.length < 500 ? line : fallback
  } catch {
    return fallback
  }
}

// A directive is its own rule: the user said it once, outright, so it skips
// the cluster and the minimum size. It is still only proposed — the propose
// gate is the security boundary, and a pasted "remember: …" is exactly the
// injection CONTRIBUTING.md names.
function directiveRules (records) {
  return records
    .filter(r => r.label === 'directive' && r.text)
    .map(r => ({
      events: [r],
      size: 1,
      projects: [r.project],
      labels: ['directive'],
      signature: `directive-${[...tokens(r.text)].slice(0, 6).join('-')}`
    }))
}

export async function dream ({ records, dir = rulesDir(), useLlm = false, oracle = null, embedder = null, minSize = 3, threshold = 0.25, doctrine = null }) {
  const lessons = records.filter(r => LESSON.has(r.label))
  let clusters, asked = 0, confirmed = 0
  if (oracle) {
    ({ clusters, asked, confirmed } = await semanticClusters(lessons, oracle, { minSize, embedder }))
  } else {
    clusters = cluster(lessons, { minSize, threshold })
  }
  const directives = directiveRules(records)

  const existing = await listRules(dir)
  const known = new Set(existing.map(r => r.meta.signature))

  const summary = { lessons: lessons.length, directives: directives.length, clusters: clusters.length, asked, confirmed, proposed: 0, covered: 0, skippedKnown: 0 }
  // Directives first: the user asked for those in so many words.
  for (const c of [...directives, ...clusters]) {
    if (summary.proposed + summary.covered >= MAX_PROPOSALS) break
    if (known.has(c.signature)) {
      summary.skippedKnown++
      continue
    }
    known.add(c.signature)
    c.statement = await phrase(c.events, { useLlm, doctrine, directive: c.labels[0] === 'directive' })
    // Covered is written, not dropped: a dropped cluster comes back every run.
    // `limbic rules --all` shows it, and nothing injects it.
    if (c.statement === COVERED) {
      c.statement = 'Already stated in your instructions — the doctrine holds this rule.'
      await writeRule(c, dir, 'covered')
      summary.covered++
      continue
    }
    await writeRule(c, dir)
    summary.proposed++
  }
  return summary
}
