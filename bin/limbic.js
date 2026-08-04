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

  limbic retrodict [--ledger FILE]
      The thesis benchmark: rules from the first half of history scored
      against corrections in the second. Honest either way.

Everything runs locally; only --llm ever calls a model.`

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

function oracleReport (oracle) {
  if (oracle) console.log(`oracle: ${oracle.calls} calls, ${oracle.cacheHits} cache hits`)
}

if (cmd === 'replay') {
  const oracle = await makeOracle()
  const summary = await replay({
    projectsDir: flag(args, '--projects', join(homedir(), '.claude', 'projects')),
    ledgerPath: flag(args, '--ledger', defaultLedgerPath()),
    project: flag(args, '--project', null),
    oracle
  })
  console.log(`files ${summary.files}  sessions ${summary.sessions}  prompts ${summary.prompts}  records ${summary.records}  bad lines ${summary.badLines}  oracle upgrades ${summary.oracleUpgrades}`)
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
  const records = await readLedger(flag(args, '--ledger', defaultLedgerPath()))
  const summary = await dream({
    records,
    useLlm: args.includes('--llm'),
    oracle,
    minSize: Number(flag(args, '--min', 3))
  })
  console.log(`corrective ${summary.corrective}  clusters ${summary.clusters}  (pairs asked ${summary.asked}, confirmed ${summary.confirmed})  proposed ${summary.proposed}  already known ${summary.skippedKnown}`)
  oracleReport(oracle)
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
  const { retrodict } = await import('../src/retrodict.js')
  const oracle = await makeOracle()
  const records = await readLedger(flag(args, '--ledger', defaultLedgerPath()))
  const r = await retrodict(records, { oracle })
  console.log(`past ${r.pastEvents} events → ${r.rules} rules; future ${r.futureEvents} events, preventable ${r.preventable} (${(r.rate * 100).toFixed(1)}%)`)
  for (const h of r.hits) console.log(`  ~ [${h.signature}] ${h.text}`)
  oracleReport(oracle)
} else {
  console.log(HELP)
  process.exit(cmd ? 1 : 0)
}
