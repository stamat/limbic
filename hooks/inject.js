#!/usr/bin/env node
// SessionStart hook: print accepted rules — stdout becomes session context.
// Accepted only, ever: the propose gate is the security boundary between the
// ledger and the agent's context (see CONTRIBUTING.md threat model). RPMS
// arbitration holds here too — rules inject, episodes never do.
// Stdin is fd 0, readable only by the sync fs API — the promises readFile
// refuses fds and the refusal exited this hook silently before it ever ran.
import { readFileSync } from 'node:fs'
import { listRules } from '../src/rules.js'

if (process.env.LIMBIC_ORACLE) process.exit(0)

try {
  readFileSync(0, 'utf8')
  const accepted = (await listRules()).filter(r => r.meta.status === 'accepted')
  if (accepted.length) {
    console.log('# limbic — rules learned from your own corrections\n')
    for (const r of accepted) {
      const statement = r.body.split('## Evidence')[0].replace('## Proposed rule', '').trim()
      console.log(`- ${statement} _(${r.meta.size} corrections, ${r.file})_`)
    }
  }
} catch {}
process.exit(0)
