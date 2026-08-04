import { cluster, tokens, jaccard } from './cluster.js'
import { semanticClusters } from './semantic.js'

const CORRECTIVE = new Set(['correction', 'fix_request', 'challenge'])
const FLOOR = 0.06

// The thesis benchmark: rules deduced from the first half of history, scored
// against corrections in the second. "Preventable" means a later correction
// matches an earlier cluster the way cluster membership is decided — same
// thresholds, same oracle, no special pleading. Chronology is per-record
// timestamp order, not per-project: rules are allowed to transfer across
// projects because that is precisely the claim being tested.
export async function retrodict (records, { threshold = 0.25, minSize = 3, oracle = null } = {}) {
  const corrective = records
    .filter(r => CORRECTIVE.has(r.label) && r.ts)
    .sort((a, b) => a.ts.localeCompare(b.ts))
  const half = Math.floor(corrective.length / 2)
  const past = corrective.slice(0, half)
  const future = corrective.slice(half)

  const clusters = oracle
    ? (await semanticClusters(past, oracle, { minSize })).clusters
    : cluster(past, { minSize, threshold })
  const clusterToks = clusters.map(c => c.events.map(e => tokens(e.text)))

  let preventable = 0
  const hits = []
  for (const f of future) {
    const ft = tokens(f.text)
    let hit = clusters.findIndex((c, i) => clusterToks[i].some(t => jaccard(ft, t) >= threshold))
    if (hit === -1 && oracle) {
      // Same nomination rule as clustering: only members above the lexical
      // floor are worth a cached oracle question.
      for (let i = 0; i < clusters.length && hit === -1; i++) {
        const members = clusters[i].events.filter((_, m) => jaccard(ft, clusterToks[i][m]) >= FLOOR)
        if (!members.length) continue
        const verdicts = await oracle.samePairs(members.map(m => ({ a: f.text, b: m.text })))
        if (verdicts.some(v => v === true)) hit = i
      }
    }
    if (hit !== -1) {
      preventable++
      hits.push({ text: f.text.slice(0, 100), signature: clusters[hit].signature })
    }
  }
  return {
    pastEvents: past.length,
    futureEvents: future.length,
    rules: clusters.length,
    preventable,
    rate: future.length ? preventable / future.length : 0,
    hits
  }
}
