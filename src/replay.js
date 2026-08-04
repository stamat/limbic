import { listSessionFiles, parseSession } from './transcript.js'
import { classify } from './classify.js'
import { scoreSession } from './surprise.js'
import { resetLedger, appendRecords, toRecord } from './ledger.js'

// Replay is a full rebuild, never an append: running it twice over the same
// history must produce byte-identical ledgers, or no benchmark downstream of
// the ledger can be trusted.
export async function replay ({ projectsDir, ledgerPath, project = null }) {
  const files = await listSessionFiles(projectsDir, project)
  await resetLedger(ledgerPath)
  const summary = { files: files.length, sessions: 0, prompts: 0, badLines: 0, records: 0 }

  for (const f of files) {
    const session = await parseSession(f.path)
    summary.badLines += session.badLines
    if (!session.prompts.length) continue
    summary.sessions++
    summary.prompts += session.prompts.length

    const labeled = session.prompts.map(p => ({ ...p, ...classify(p.text) }))
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
