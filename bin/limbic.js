#!/usr/bin/env node
import { join } from 'node:path'
import { homedir } from 'node:os'
import { replay } from '../src/replay.js'
import { readLedger, defaultLedgerPath } from '../src/ledger.js'
import { aggregate, render } from '../src/stats.js'

const HELP = `limbic — an agent's memory gate

usage:
  limbic replay [--projects DIR] [--project SLUG] [--ledger FILE]
      Rebuild the ledger from Claude Code session history.
      Defaults: --projects ~/.claude/projects, --ledger ~/.limbic/ledger.jsonl

  limbic stats [--ledger FILE]
      Correction rates, surprise baseline, per-session sparklines.

  limbic dream [--ledger FILE] [--llm] [--min N]
      Cluster corrective events into proposed rules in ~/.limbic/rules/.
      Proposed, never activated: accept or reject each one yourself.
      --llm phrases rules via \`claude -p\` (subscription auth); without it,
      or on any failure, rules carry an editable template statement.

  limbic rules [--all]
      List proposed rules (--all includes accepted and rejected).

  limbic accept <file> | reject <file>
      Promote or suppress a proposed rule. Rejected clusters stay suppressed.

  limbic retrodict [--ledger FILE] [--llm] [--online]
      The thesis benchmark: rules from the first half of history scored
      against corrections in the second. --online scores every event against
      only what came before it. Honest either way.

  limbic install
      Print the hooks block for ~/.claude/settings.json — never edits it.

Everything runs locally; only --llm ever calls a model. --llm accepts
--max-calls N (default 60) — the per-run cap on claude invocations.`

function flag (args, name, fallback) {
  const i = args.indexOf(name)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

const [cmd, ...args] = process.argv.slice(2)

async function makeOracle () {
  if (!args.includes('--llm')) return null
  const { Oracle } = await import('../src/oracle.js')
  return new Oracle({ maxCalls: Number(flag(args, '--max-calls', 60)) })
}

// The embedder rides along with --llm: embeddings only nominate pairs, the
// oracle confirms them — vectors without an oracle would have no one to ask.
// A dead or missing ollama costs one failed call and the run degrades to
// oracle-only, stated in the report line.
async function makeEmbedder () {
  if (!args.includes('--llm')) return null
  const { Embedder } = await import('../src/embed.js')
  return new Embedder()
}

function oracleReport (oracle, embedder) {
  if (oracle) console.log(`oracle: ${oracle.calls} calls, ${oracle.cacheHits} cache hits`)
  if (embedder) {
    console.log(embedder.available
      ? `embeddings: ${embedder.calls} calls, ${embedder.cacheHits} cache hits`
      : 'embeddings: ollama unavailable — degraded to oracle-only')
  }
}

if (cmd === 'replay') {
  const oracle = await makeOracle()
  const summary = await replay({
    projectsDir: flag(args, '--projects', join(homedir(), '.claude', 'projects')),
    ledgerPath: flag(args, '--ledger', defaultLedgerPath()),
    project: flag(args, '--project', null),
    oracle
  })
  console.log(`files ${summary.files}  sessions ${summary.sessions}  prompts ${summary.prompts}  records ${summary.records}  bad lines ${summary.badLines}`)
  console.log(`rephrases ${summary.rephrases}  interrupts ${summary.interrupts}  denials ${summary.denials}  self-corrections ${summary.selfCorrections}  oracle upgrades ${summary.oracleUpgrades}  refuted ${summary.oracleRefuted}`)
  oracleReport(oracle)
} else if (cmd === 'stats') {
  const records = await readLedger(flag(args, '--ledger', defaultLedgerPath()))
  if (!records.length) {
    console.error('ledger is empty — run `limbic replay` first')
    process.exit(1)
  }
  console.log(render(aggregate(records)))
} else if (cmd === 'dream') {
  const { dream } = await import('../src/dream.js')
  const oracle = await makeOracle()
  const embedder = await makeEmbedder()
  const records = await readLedger(flag(args, '--ledger', defaultLedgerPath()))
  const summary = await dream({
    records,
    useLlm: args.includes('--llm'),
    oracle,
    embedder,
    minSize: Number(flag(args, '--min', 3))
  })
  console.log(`corrective ${summary.corrective}  clusters ${summary.clusters}  (pairs asked ${summary.asked}, confirmed ${summary.confirmed})  proposed ${summary.proposed}  already known ${summary.skippedKnown}`)
  oracleReport(oracle, embedder)
  if (summary.proposed) console.log('review with: limbic rules')
} else if (cmd === 'rules') {
  const { listRules } = await import('../src/rules.js')
  const all = await listRules()
  const shown = args.includes('--all') ? all : all.filter(r => r.meta.status === 'proposed')
  if (!shown.length) {
    console.log(args.includes('--all') ? 'no rules yet — run `limbic dream`' : 'no proposed rules')
  }
  for (const r of shown) {
    const head = r.body.split('\n').find(l => l && !l.startsWith('#')) ?? ''
    console.log(`[${r.meta.status}] ${r.file}  (${r.meta.size} events)\n    ${head.slice(0, 120)}`)
  }
} else if (cmd === 'accept' || cmd === 'reject') {
  const { setStatus } = await import('../src/rules.js')
  const file = args[0]
  if (!file) {
    console.error(`usage: limbic ${cmd} <file>`)
    process.exit(1)
  }
  await setStatus(file, cmd === 'accept' ? 'accepted' : 'rejected')
  console.log(`${file} → ${cmd}ed`)
} else if (cmd === 'retrodict') {
  const { retrodict, retrodictOnline } = await import('../src/retrodict.js')
  const oracle = await makeOracle()
  const embedder = await makeEmbedder()
  const records = await readLedger(flag(args, '--ledger', defaultLedgerPath()))
  if (args.includes('--online')) {
    const r = await retrodictOnline(records, { oracle, embedder })
    console.log(`online: ${r.scored} scored of ${r.events} corrective; preventable ${r.preventable} (${(r.rate * 100).toFixed(1)}%)`)
    for (const h of r.hits) console.log(`  ~ [${h.signature}] ${h.text}`)
  } else {
    const r = await retrodict(records, { oracle, embedder })
    console.log(`past ${r.pastEvents} events → ${r.rules} rules; future ${r.futureEvents} events, preventable ${r.preventable} (${(r.rate * 100).toFixed(1)}%)`)
    for (const h of r.hits) console.log(`  ~ [${h.signature}] ${h.text}`)
  }
  oracleReport(oracle, embedder)
} else if (cmd === 'install') {
  // Print-only, deliberately: limbic never edits your settings.json — a
  // memory tool that modifies its host's configuration crosses the same
  // boundary the propose gate exists to guard. Paste the block yourself.
  const { fileURLToPath } = await import('node:url')
  const { dirname: dn, join: jn } = await import('node:path')
  const root = dn(dn(fileURLToPath(import.meta.url)))
  const hooks = {
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: `node "${jn(root, 'hooks', 'classify.js')}"`, timeout: 5 }] }],
    SessionStart: [{ hooks: [{ type: 'command', command: `node "${jn(root, 'hooks', 'inject.js')}"`, timeout: 5 }] }]
  }
  console.log('add to ~/.claude/settings.json under "hooks":\n')
  console.log(JSON.stringify(hooks, null, 2))
} else {
  console.log(HELP)
  process.exit(cmd ? 1 : 0)
}
