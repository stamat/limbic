import { listSessionFiles, parseSession } from './transcript.js'
import { classify } from './classify.js'
import { scoreSession } from './surprise.js'
import { resetLedger, appendRecords, toRecord } from './ledger.js'

// Replay is a full rebuild, never an append: running it twice over the same
// history must produce byte-identical ledgers, or no benchmark downstream of
// the ledger can be trusted. The oracle keeps that property by caching every
// verdict — a second --llm replay asks nothing new.
export async function replay ({ projectsDir, ledgerPath, project = null, oracle = null }) {
  const files = await listSessionFiles(projectsDir, project)
  await resetLedger(ledgerPath)
  const summary = { files: files.length, sessions: 0, prompts: 0, badLines: 0, records: 0, oracleUpgrades: 0 }

  for (const f of files) {
    // Session files are live: Claude Code rotates and deletes them while a
    // slow replay runs, so a file listed a minute ago may be gone now.
    // Skipped and counted, never fatal — the first --llm run died on this.
    let session
    try {
      session = await parseSession(f.path)
    } catch (err) {
      if (err.code === 'ENOENT') {
        summary.vanished = (summary.vanished ?? 0) + 1
        continue
      }
      throw err
    }
    summary.badLines += session.badLines
    if (!session.prompts.length) continue
    summary.sessions++
    summary.prompts += session.prompts.length

    const labeled = session.prompts.map(p => ({ ...p, ...classify(p.text) }))

    // Only regex-neutral prompts with context go to the oracle: regex labels
    // survived a hand audit, oracle labels get the harder cases regex cannot
    // see — soft critique of what the previous turn delivered.
    if (oracle) {
      const idx = labeled.flatMap((l, i) => (l.label === 'neutral' && l.context ? [i] : []))
      const verdicts = await oracle.classify(idx.map(i => ({ context: labeled[i].context, text: labeled[i].text })))
      idx.forEach((i, n) => {
        if (verdicts[n] && verdicts[n] !== 'neutral') {
          labeled[i] = { ...labeled[i], label: verdicts[n], cue: 'oracle' }
          summary.oracleUpgrades++
        }
      })
    }

    const scored = scoreSession(labeled)
    const records = scored.map(e => toRecord(e, {
      project: f.project,
      sessionId: session.sessionId ?? session.file
    }))
    await appendRecords(ledgerPath, records)
    summary.records += records.length
  }
  return summary
}
