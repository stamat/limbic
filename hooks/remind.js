#!/usr/bin/env node
// PreToolUse hook: repeat one CLAUDE.md section beside the tool call it
// governs — `node remind.js Commits`, fired by a hook `if` such as
// `Bash(git commit *)`. The doctrine has been in context since session start;
// what grows with instruction count is omission, the rule forgotten rather
// than misread (IFScale, arXiv 2507.11538). Each section fires once per
// session: a reminder on every commit is noise the next one learns to skip.
// Exit 0 always — a memory tool that blocks a tool call is worse than none.
import { readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { section } from '../src/curate.js'
import { appendInjected } from '../src/ledger.js'

if (process.env.LIMBIC_ORACLE) process.exit(0)

try {
  const heading = process.argv.slice(2).join(' ').trim()
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const sid = input.session_id
  if (heading && sid) {
    const dir = join(homedir(), '.limbic')
    const statePath = join(dir, 'remind-state.json')
    let state = {}
    try { state = JSON.parse(await readFile(statePath, 'utf8')) } catch {}
    if (typeof state.sessions !== 'object' || state.sessions === null) state = { sessions: {} }
    const seen = state.sessions[sid] ?? []
    if (!seen.includes(heading)) {
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
        // Bounded at 50 sessions, oldest dropped, as the classify hook's state.
        delete state.sessions[sid]
        state.sessions[sid] = [...seen, heading]
        const keys = Object.keys(state.sessions)
        for (const k of keys.slice(0, Math.max(0, keys.length - 50))) delete state.sessions[k]
        await mkdir(dir, { recursive: true })
        await writeFile(statePath, JSON.stringify(state))
        await appendInjected({ sessionId: sid, cwd: input.cwd, given: [`CLAUDE.md#${heading}`] })
      }
    }
  }
} catch {}
process.exit(0)
