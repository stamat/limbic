const SPARKS = '▁▂▃▄▅▆▇█'

export function sparkline (values) {
  if (!values.length) return ''
  const max = Math.max(...values, 0.0001)
  return values.map(v => SPARKS[Math.min(7, Math.floor((v / max) * 8))]).join('')
}

import { BEHAVIORAL } from './surprise.js'

// Baseline normalization is the NuPIC anomaly-likelihood idea shrunk to fit:
// a session is only remarkable relative to this user's own distribution of
// correction rates, never on its raw score — a user who corrects everything
// must not light the meter every session.
export function aggregate (records) {
  const byProject = new Map()
  for (const r of records) {
    if (!byProject.has(r.project)) byProject.set(r.project, new Map())
    const sessions = byProject.get(r.project)
    if (!sessions.has(r.sessionId)) sessions.set(r.sessionId, [])
    sessions.get(r.sessionId).push(r)
  }

  const projects = []
  const allRates = []
  const cueCounts = new Map()
  let maxChain = 0

  for (const [project, sessions] of byProject) {
    const p = { project, sessions: sessions.size, prompts: 0, corrections: 0, fixRequests: 0, challenges: 0, rephrases: 0, interrupts: 0, denials: 0, selfCorrections: 0, accepts: 0, sessionRates: [] }
    for (const recs of sessions.values()) {
      // Behavioral events are counted apart and never inflate the prompt
      // denominator — an Esc is a signal, not a prompt the user typed.
      let corrective = 0
      let promptCount = 0
      for (const r of recs) {
        if (BEHAVIORAL.has(r.label)) {
          if (r.label === 'interrupt') p.interrupts++
          else if (r.label === 'denial') p.denials++
          else p.selfCorrections++
          continue
        }
        promptCount++
        if (r.label === 'correction') { p.corrections++; corrective++ }
        if (r.label === 'fix_request') { p.fixRequests++; corrective++ }
        if (r.label === 'challenge') { p.challenges++; corrective++ }
        if (r.label === 'rephrase') { p.rephrases++; corrective++ }
        if (r.label === 'accept') p.accepts++
        if (r.cue) cueCounts.set(r.cue, (cueCounts.get(r.cue) ?? 0) + 1)
        if (r.chain > maxChain) maxChain = r.chain
      }
      p.prompts += promptCount
      const rate = promptCount ? corrective / promptCount : 0
      p.sessionRates.push(rate)
      allRates.push(rate)
    }
    p.corrective = p.corrections + p.fixRequests + p.challenges + p.rephrases
    p.correctionRate = p.prompts ? p.corrective / p.prompts : 0
    projects.push(p)
  }

  const mean = allRates.length ? allRates.reduce((a, b) => a + b, 0) / allRates.length : 0
  const variance = allRates.length
    ? allRates.reduce((a, b) => a + (b - mean) ** 2, 0) / allRates.length
    : 0
  const std = Math.sqrt(variance)

  projects.sort((a, b) => b.prompts - a.prompts)
  const topCues = [...cueCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)

  return {
    projects,
    totals: {
      prompts: projects.reduce((a, p) => a + p.prompts, 0),
      corrective: projects.reduce((a, p) => a + p.corrective, 0),
      accepts: projects.reduce((a, p) => a + p.accepts, 0),
      sessions: projects.reduce((a, p) => a + p.sessions, 0),
      interrupts: projects.reduce((a, p) => a + p.interrupts, 0),
      denials: projects.reduce((a, p) => a + p.denials, 0),
      selfCorrections: projects.reduce((a, p) => a + p.selfCorrections, 0)
    },
    baseline: { mean, std },
    outlierThreshold: mean + 2 * std,
    topCues,
    maxChain
  }
}

export function render (agg) {
  const lines = []
  const t = agg.totals
  const overallRate = t.prompts ? (t.corrective / t.prompts) : 0
  lines.push(`sessions ${t.sessions}  prompts ${t.prompts}  corrective ${t.corrective} (${(overallRate * 100).toFixed(1)}%)  accepts ${t.accepts}  interrupts ${t.interrupts}  denials ${t.denials}  self-corrections ${t.selfCorrections}`)
  lines.push(`baseline correction rate ${(agg.baseline.mean * 100).toFixed(1)}% ±${(agg.baseline.std * 100).toFixed(1)}  outlier past ${(agg.outlierThreshold * 100).toFixed(1)}%  max chain ${agg.maxChain}`)
  lines.push('')
  for (const p of agg.projects) {
    if (!p.prompts) continue
    lines.push(`${p.project}`)
    const behavioral = p.interrupts || p.denials || p.selfCorrections ? `  interrupts ${p.interrupts}  denials ${p.denials}  self-corrections ${p.selfCorrections}` : ''
    lines.push(`  sessions ${p.sessions}  prompts ${p.prompts}  corrective ${p.corrective} (${(p.correctionRate * 100).toFixed(1)}%: ${p.corrections}c ${p.fixRequests}f ${p.challenges}q ${p.rephrases}r)  accepts ${p.accepts}${behavioral}`)
    lines.push(`  per-session rate ${sparkline(p.sessionRates)}`)
  }
  if (agg.topCues.length) {
    lines.push('')
    lines.push('top cues:')
    for (const [cue, n] of agg.topCues) lines.push(`  ${String(n).padStart(4)}  ${cue}`)
  }
  return lines.join('\n')
}
