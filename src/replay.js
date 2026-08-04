import { listSessionFiles, parseSession } from './transcript.js'
import { classify } from './classify.js'
import { markRephrases } from './detect.js'
import { scoreSession } from './surprise.js'
import { resetLedger, appendRecords, toRecord } from './ledger.js'

// Replay is a full rebuild, never an append: running it twice over the same
// history must produce byte-identical ledgers, or no benchmark downstream of
// the ledger can be trusted. The oracle keeps that property by caching every
// verdict — a second --llm replay asks nothing new.
//
// Two phases, deliberately: parse everything first, ask the oracle once over
// the whole backlog. Per-session batches averaged two items against a batch
// size of twenty — the first capped run spent 40 calls labeling what a
// cross-session pass covers in a handful.
export async function replay ({ projectsDir, ledgerPath, project = null, oracle = null }) {
  const files = await listSessionFiles(projectsDir, project)
  const summary = { files: files.length, sessions: 0, prompts: 0, badLines: 0, records: 0, vanished: 0, oracleUpgrades: 0, oracleRefuted: 0, rephrases: 0, interrupts: 0, denials: 0, selfCorrections: 0 }

  const sessions = []
  for (const f of files) {
    // Session files are live: Claude Code rotates and deletes them while a
    // slow replay runs, so a file listed a minute ago may be gone now.
    // Skipped and counted, never fatal — the first --llm run died on this.
    let session
    try {
      session = await parseSession(f.path)
    } catch (err) {
      if (err.code === 'ENOENT') {
        summary.vanished++
        continue
      }
      throw err
    }
    summary.badLines += session.badLines
    // A session with only behavioral events still carries signal — an Esc in
    // a session whose prompts were all slash-command plumbing must not vanish.
    if (!session.prompts.length && !session.behavioral.length) continue
    summary.sessions++
    summary.prompts += session.prompts.length
    sessions.push({
      project: f.project,
      sessionId: session.sessionId ?? session.file,
      behavioral: session.behavioral,
      labeled: session.prompts.map(p => ({ ...p, ...classify(p.text) }))
    })
  }

  // Only regex-neutral prompts with context go to the oracle: regex labels
  // survived a hand audit, oracle labels get the harder cases regex cannot
  // see — soft critique of what the previous turn delivered.
  if (oracle) {
    const backlog = []
    for (const s of sessions) {
      s.labeled.forEach((l, i) => {
        if (l.label === 'neutral' && l.context) backlog.push({ s, i, context: l.context, text: l.text })
      })
    }
    const verdicts = await oracle.classify(backlog)
    const upgraded = []
    backlog.forEach((b, n) => {
      if (verdicts[n] && verdicts[n] !== 'neutral') upgraded.push({ b, label: verdicts[n] })
    })
    // Every positive verdict faces a second, refutation-phrased pass before it
    // sticks — a refuted upgrade stays neutral with the cue recording why.
    const checks = await oracle.validate(upgraded.map(({ b }) => ({ context: b.context, text: b.text })))
    upgraded.forEach(({ b, label }, n) => {
      if (checks[n] === false) {
        b.s.labeled[b.i] = { ...b.s.labeled[b.i], cue: 'oracle-refuted' }
        summary.oracleRefuted++
      } else {
        b.s.labeled[b.i] = { ...b.s.labeled[b.i], label, cue: 'oracle' }
        summary.oracleUpgrades++
      }
    })
  }

  await resetLedger(ledgerPath)
  for (const s of sessions) {
    markRephrases(s.labeled)
    summary.rephrases += s.labeled.filter(l => l.label === 'rephrase').length
    const meta = { project: s.project, sessionId: s.sessionId }
    const scored = scoreSession(s.labeled).map(e => toRecord(e, meta))
    // Behavioral events ride the same ledger with zero surprise: they are not
    // prompts, so they pass the chain untouched and merge back in by time.
    const behavioral = s.behavioral.map(b => {
      summary[{ interrupt: 'interrupts', denial: 'denials', self_correction: 'selfCorrections' }[b.kind]]++
      return toRecord({ ts: b.ts, label: b.kind, cue: b.cue ?? b.kind, chain: 0, surprise: 0, trace: null, gitBranch: b.gitBranch, text: b.excerpt ?? '' }, meta)
    })
    const records = [...scored, ...behavioral].sort((a, b) => String(a.ts ?? '').localeCompare(String(b.ts ?? '')))
    await appendRecords(ledgerPath, records)
    summary.records += records.length
  }
  return summary
}
