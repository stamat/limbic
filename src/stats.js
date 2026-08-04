const SPARKS = '▁▂▃▄▅▆▇█'

export function sparkline (values) {
  if (!values.length) return ''
  const max = Math.max(...values, 0.0001)
  return values.map(v => SPARKS[Math.min(7, Math.floor((v / max) * 8))]).join('')
}

const CORRECTIVE = new Set(['correction', 'fix_request'])

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
    const p = { project, sessions: sessions.size, prompts: 0, corrections: 0, fixRequests: 0, accepts: 0, sessionRates: [] }
    for (const recs of sessions.values()) {
      p.prompts += recs.length
      let corrective = 0
      for (const r of recs) {
        if (r.label === 'correction') { p.corrections++; corrective++ }
        if (r.label === 'fix_request') { p.fixRequests++; corrective++ }
        if (r.label === 'accept') p.accepts++
        if (r.cue) cueCounts.set(r.cue, (cueCounts.get(r.cue) ?? 0) + 1)
        if (r.chain > maxChain) maxChain = r.chain
      }
      const rate = recs.length ? corrective / recs.length : 0
      p.sessionRates.push(rate)
      allRates.push(rate)
    }
    p.correctionRate = p.prompts ? (p.corrections + p.fixRequests) / p.prompts : 0
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
      corrective: projects.reduce((a, p) => a + p.corrections + p.fixRequests, 0),
      accepts: projects.reduce((a, p) => a + p.accepts, 0),
      sessions: projects.reduce((a, p) => a + p.sessions, 0)
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
  lines.push(`sessions ${t.sessions}  prompts ${t.prompts}  corrective ${t.corrective} (${(overallRate * 100).toFixed(1)}%)  accepts ${t.accepts}`)
  lines.push(`baseline correction rate ${(agg.baseline.mean * 100).toFixed(1)}% ±${(agg.baseline.std * 100).toFixed(1)}  outlier past ${(agg.outlierThreshold * 100).toFixed(1)}%  max chain ${agg.maxChain}`)
  lines.push('')
  for (const p of agg.projects) {
    if (!p.prompts) continue
    lines.push(`${p.project}`)
    lines.push(`  sessions ${p.sessions}  prompts ${p.prompts}  corrective ${p.corrections + p.fixRequests} (${(p.correctionRate * 100).toFixed(1)}%)  accepts ${p.accepts}`)
    lines.push(`  per-session rate ${sparkline(p.sessionRates)}`)
  }
  if (agg.topCues.length) {
    lines.push('')
    lines.push('top cues:')
    for (const [cue, n] of agg.topCues) lines.push(`  ${String(n).padStart(4)}  ${cue}`)
  }
  return lines.join('\n')
}
