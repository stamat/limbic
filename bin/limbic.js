#!/usr/bin/env node
import { join } from 'node:path'
import { homedir } from 'node:os'
import { replay } from '../src/replay.js'
import { readLedger, defaultLedgerPath } from '../src/ledger.js'
import { aggregate, render } from '../src/stats.js'

const HELP = `limbic — an agent's memory gate (v0: measurement harness)

usage:
  limbic replay [--projects DIR] [--project SLUG] [--ledger FILE]
      Rebuild the ledger from Claude Code session history.
      Defaults: --projects ~/.claude/projects, --ledger ~/.limbic/ledger.jsonl

  limbic stats [--ledger FILE]
      Correction rates, surprise baseline, per-session sparklines.

Everything runs locally; nothing leaves this machine.`

function flag (args, name, fallback) {
  const i = args.indexOf(name)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

const [cmd, ...args] = process.argv.slice(2)

if (cmd === 'replay') {
  const summary = await replay({
    projectsDir: flag(args, '--projects', join(homedir(), '.claude', 'projects')),
    ledgerPath: flag(args, '--ledger', defaultLedgerPath()),
    project: flag(args, '--project', null)
  })
  console.log(`files ${summary.files}  sessions ${summary.sessions}  prompts ${summary.prompts}  records ${summary.records}  bad lines ${summary.badLines}`)
} else if (cmd === 'stats') {
  const records = await readLedger(flag(args, '--ledger', defaultLedgerPath()))
  if (!records.length) {
    console.error('ledger is empty — run `limbic replay` first')
    process.exit(1)
  }
  console.log(render(aggregate(records)))
} else {
  console.log(HELP)
  process.exit(cmd ? 1 : 0)
}
