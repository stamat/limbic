#!/usr/bin/env node
// SessionStart hook: print accepted rules — stdout becomes session context.
// Accepted only, ever: the propose gate is the security boundary between the
// ledger and the agent's context (see CONTRIBUTING.md threat model). RPMS
// arbitration holds here too — rules inject, episodes never do.
// Stdin is fd 0, readable only by the sync fs API — the promises readFile
// refuses fds and the refusal exited this hook silently before it ever ran.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { listRules } from '../src/rules.js'
import { projectSlug, appendInjected } from '../src/ledger.js'

// More rules is not more help: ReasoningBank scored 49.7% retrieving one
// memory and 44.4% retrieving four, and IFScale shows omissions climb with
// instruction count. Past the cap the weakest wait — graduate or reject to
// make room, and the hook says how many it held back.
const MAX_INJECT = 12

// One session in HOLDOUT goes without each rule. Misses with the rule
// against misses without it is the one measure that separates a rule from
// everything else that changed — the model, the doctrine, the work. The pick
// hashes session and rule, so a resumed session decides the same way and no
// session loses every rule at once.
const HOLDOUT = 5

function heldOut (sessionId, file) {
  return createHash('sha256').update(`${sessionId}:${file}`).digest()[0] % HOLDOUT === 0
}

function doctrineHash () {
  try {
    return createHash('sha256').update(readFileSync(join(homedir(), '.claude', 'CLAUDE.md'))).digest('hex').slice(0, 12)
  } catch {
    return null
  }
}

if (process.env.LIMBIC_ORACLE) process.exit(0)

try {
  let input = {}
  try { input = JSON.parse(readFileSync(0, 'utf8')) } catch {}
  // A scoped rule reaches only a session that proves it is in that project:
  // no cwd on stdin means global rules alone, never every rule.
  const here = projectSlug(input.cwd ?? null)
  // Strongest evidence first: under load a model follows earlier
  // instructions better (IFScale's primacy effect), so order is a choice.
  const accepted = (await listRules())
    .filter(r => r.meta.status === 'accepted' && (!r.meta.project || r.meta.project === here))
    .sort((a, b) => Number(b.meta.size ?? 0) - Number(a.meta.size ?? 0))
  // With no session id there is nothing to record the holdout against, so
  // nothing is held.
  const held = input.session_id ? accepted.filter(r => heldOut(input.session_id, r.file)) : []
  const eligible = accepted.filter(r => !held.includes(r))
  const shown = eligible.slice(0, MAX_INJECT)
  if (shown.length) {
    console.log('# limbic — rules learned from your own corrections\n')
    for (const r of shown) {
      const statement = r.body.split('## Evidence')[0].replace('## Proposed rule', '').trim()
      console.log(`- ${statement} _(${r.meta.size} corrections, ${r.file})_`)
    }
    if (eligible.length > shown.length) {
      console.log(`\n_(${eligible.length - shown.length} more accepted rules held back — \`limbic efficacy\` says which to graduate)_`)
    }
  }
  await appendInjected({
    sessionId: input.session_id,
    cwd: input.cwd,
    given: shown.map(r => r.file),
    held: held.map(r => r.file),
    model: input.model ?? null,
    doctrine: doctrineHash()
  })
} catch {}
process.exit(0)
