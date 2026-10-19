#!/usr/bin/env node
// PreToolUse hook: repeat one CLAUDE.md section beside the tool call it
// governs — `node remind.js Commits`, fired by a hook `if` such as
// `Bash(git commit *)`. The doctrine has been in context since session start;
// what grows with instruction count is omission, the rule forgotten rather
// than misread (IFScale, arXiv 2507.11538). Each section fires once per
// session: a reminder on every commit is noise the next one learns to skip.
// Exit 0 always — a memory tool that blocks a tool call is worse than none.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { section } from '../src/curate.js'
import { appendInjected } from '../src/ledger.js'
import { runsCommit } from '../src/commits.js'

// Half the sessions get no reminder: commits are frequent and their check
// needs no judge, so an even split answers soonest. Decided once per session
// from a hash, so a resumed session decides the same way.
const HOLDOUT = 2

if (process.env.LIMBIC_ORACLE) process.exit(0)

try {
  const args = process.argv.slice(2)
  const heading = args.filter(a => !a.startsWith('--')).join(' ').trim()
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const sid = input.session_id
  // The hook `if` matches words anywhere in the command, a heredoc that only
  // mentions `git commit` included; --commit asks for a commit that runs.
  const runs = !args.includes('--commit') || runsCommit(input.tool_input?.command ?? '')
  if (heading && sid && runs) {
    const dir = join(homedir(), '.limbic')
    const statePath = join(dir, 'remind-state.json')
    let state = {}
    try { state = JSON.parse(await readFile(statePath, 'utf8')) } catch {}
    if (typeof state.sessions !== 'object' || state.sessions === null) state = { sessions: {} }
    const seen = state.sessions[sid] ?? []
    const key = `CLAUDE.md#${heading}`
    const held = createHash('sha256').update(`${sid}:${key}`).digest()[0] % HOLDOUT === 0
    const remember = async () => {
      // Bounded at 50 sessions, oldest dropped, as the classify hook's state.
      delete state.sessions[sid]
      state.sessions[sid] = [...seen, heading]
      const keys = Object.keys(state.sessions)
      for (const k of keys.slice(0, Math.max(0, keys.length - 50))) delete state.sessions[k]
      await mkdir(dir, { recursive: true })
      await writeFile(statePath, JSON.stringify(state))
    }
    if (!seen.includes(heading) && held) {
      await remember()
      await appendInjected({ sessionId: sid, cwd: input.cwd, given: [], held: [key] })
    } else if (!seen.includes(heading)) {
      const doctrine = await readFile(join(homedir(), '.claude', 'CLAUDE.md'), 'utf8')
      const body = section(doctrine, heading)
      if (!body) {
        // stderr reaches the debug log only; a hook naming a heading the
        // doctrine lacks is a misconfiguration, and it says so there.
        console.error(`limbic remind: no "${heading}" heading in ~/.claude/CLAUDE.md`)
      } else {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            additionalContext: `Your CLAUDE.md, "${heading}" — it governs the action you are about to take:\n\n${body}`
          }
        }))
        await remember()
        await appendInjected({ sessionId: sid, cwd: input.cwd, given: [key] })
      }
    }
  }
} catch {}
process.exit(0)
