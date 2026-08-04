import { listSessionFiles, parseSession } from './transcript.js'
import { classify } from './classify.js'
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
  const summary = { files: files.length, sessions: 0, prompts: 0, badLines: 0, records: 0, vanished: 0, oracleUpgrades: 0 }

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
    if (!session.prompts.length) continue
    summary.sessions++
    summary.prompts += session.prompts.length
    sessions.push({
      project: f.project,
      sessionId: session.sessionId ?? session.file,
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
    backlog.forEach((b, n) => {
      if (verdicts[n] && verdicts[n] !== 'neutral') {
        b.s.labeled[b.i] = { ...b.s.labeled[b.i], label: verdicts[n], cue: 'oracle' }
        summary.oracleUpgrades++
      }
    })
  }

  await resetLedger(ledgerPath)
  for (const s of sessions) {
    const records = scoreSession(s.labeled).map(e => toRecord(e, { project: s.project, sessionId: s.sessionId }))
    await appendRecords(ledgerPath, records)
    summary.records += records.length
  }
  return summary
}
