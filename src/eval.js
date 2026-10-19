import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { evidenceTexts, fisherLess } from './efficacy.js'
import { BEHAVIORAL } from './surprise.js'

// The offline test: does a rule stop its own mistake? A live holdout needs
// months at a 1% mistake rate; this asks today. Each case is a task from
// history — the prompt that came right before a correction in the rule's
// evidence — put to the agent with the rule and without it, several times,
// and a judge says whether each answer makes the mistake again.
//
// What it cannot see: the code. The agent answers in words what it would do,
// with no tools and no repository, so a rule about rendered pixels can only
// be judged on intent. The judge is a model and adds its own noise. A falling
// violation rate here is evidence that the rule is understood and applied,
// not proof that the live sessions change.

const exec = promisify(execFile)

// The real runner: `claude -p`, with LIMBIC_ORACLE set so the spawned
// session's own hooks stay off — otherwise inject would put every accepted
// rule into the "without" answers, and classify would ledger the prompt.
export async function claude (prompt, model = null) {
  const args = ['-p', ...(model ? ['--model', model] : []), prompt]
  const { stdout } = await exec('claude', args, { timeout: 180000, env: { ...process.env, LIMBIC_ORACLE: '1' }, maxBuffer: 4 * 1024 * 1024 })
  return stdout.trim()
}

// A case for each evidence line whose record is in the ledger and has a
// prompt before it in the same session. Evidence is matched on its first 40
// characters: hand-written rules quote their evidence shortened.
export function cases (rule, records) {
  const prompts = records.filter(r => r.ts && r.text && !BEHAVIORAL.has(r.label) && r.label !== 'injected')
  const key = t => t.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40)
  const out = []
  for (const line of evidenceTexts(rule.body)) {
    const i = prompts.findIndex(r => key(r.text) === key(line))
    if (i < 1 || prompts[i - 1].sessionId !== prompts[i].sessionId) continue
    out.push({ task: prompts[i - 1].text, mistake: prompts[i].text, project: prompts[i].project })
  }
  return out
}

export function statement (rule) {
  return rule.body.split('## Evidence')[0].replace('## Proposed rule', '').trim()
}

function agentPrompt (c, rule) {
  return [
    ...(rule ? [`Follow this rule from the user's own instructions: ${rule}`, ''] : []),
    `You are a coding agent in the user's project ${String(c.project ?? '').replace(/^-Users-[^-]+-(Sites-localhost-)?/, '')}.`,
    'You cannot run tools here. In at most 8 lines, say what you will do and what you will report back.',
    '',
    `The user says: ${c.task}`
  ].join('\n')
}

function judgePrompt (c, rule, answer) {
  return [
    'An AI coding agent once got this task, and the user then corrected it.',
    `Task: ${c.task}`,
    `Correction: ${c.mistake}`,
    `The rule that correction taught: ${rule}`,
    '',
    'Here is a new answer to the same task:',
    answer,
    '',
    'Does the new answer make the mistake the correction was about? Reply with one word: yes, no, or na (the answer gives no way to tell).'
  ].join('\n')
}

// runs × cases × {with, without}, each answer judged. Calls are capped: the
// agent and the judge each count, and a run that hits the cap reports what it
// finished. `run` and `judge` are injectable so the arithmetic is testable
// without a model.
export async function evaluate (rule, cases_, { runs = 2, model = null, maxCalls = 60, run = claude, judge = p => claude(p, 'haiku') } = {}) {
  const rulesText = statement(rule)
  const tally = { with: { yes: 0, no: 0, na: 0 }, without: { yes: 0, no: 0, na: 0 } }
  let calls = 0
  outer:
  for (const c of cases_) {
    for (let n = 0; n < runs; n++) {
      for (const side of ['with', 'without']) {
        if (calls + 2 > maxCalls) break outer
        calls += 2
        let verdict = 'na'
        try {
          const answer = await run(agentPrompt(c, side === 'with' ? rulesText : null), model)
          const word = (await judge(judgePrompt(c, rulesText, answer))).toLowerCase().match(/\b(yes|no|na)\b/)
          verdict = word ? word[1] : 'na'
        } catch {}
        tally[side][verdict]++
      }
    }
  }
  const w = tally.with
  const o = tally.without
  const p = (w.yes + w.no) && (o.yes + o.no) ? fisherLess(w.yes, w.no, o.yes, o.no) : 1
  return { file: rule.file, cases: cases_.length, calls, tally, p }
}
