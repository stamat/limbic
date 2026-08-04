import { cluster, tokens, jaccard, AUTO, FLOOR } from './cluster.js'
import { semanticClusters } from './semantic.js'
import { cosine, EMB_FLOOR } from './embed.js'
import { CORRECTIVE } from './surprise.js'

// The thesis benchmark: rules deduced from the first half of history, scored
// against corrections in the second. "Preventable" means a later correction
// matches an earlier cluster the way cluster membership is decided — same
// thresholds, same oracle, no special pleading. Chronology is per-record
// timestamp order, not per-project: rules are allowed to transfer across
// projects because that is precisely the claim being tested.
export async function retrodict (records, { threshold = AUTO, minSize = 3, oracle = null, embedder = null } = {}) {
  const corrective = records
    .filter(r => CORRECTIVE.has(r.label) && r.ts)
    .sort((a, b) => a.ts.localeCompare(b.ts))
  const half = Math.floor(corrective.length / 2)
  const past = corrective.slice(0, half)
  const future = corrective.slice(half)

  const vec = await eventVectors(corrective, embedder)
  const clusters = oracle
    ? (await semanticClusters(past, oracle, { minSize, embedder })).clusters
    : cluster(past, { minSize, threshold })
  const clusterToks = clusters.map(c => c.events.map(e => tokens(e.text)))

  let preventable = 0
  const hits = []
  for (const f of future) {
    const ft = tokens(f.text)
    let hit = clusters.findIndex((c, i) => clusterToks[i].some(t => jaccard(ft, t) >= threshold))
    if (hit === -1 && oracle) {
      // Same nomination rule as clustering: lexical floor or embedding floor
      // earns a member a cached oracle question, nothing merges unconfirmed.
      for (let i = 0; i < clusters.length && hit === -1; i++) {
        const members = clusters[i].events.filter((e, m) =>
          jaccard(ft, clusterToks[i][m]) >= FLOOR || pairCosine(vec, f, e) >= EMB_FLOOR)
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

// Online retrodiction: for every corrective event, was there already a
// cluster covering it among the events before it? Half-split retrodiction
// cannot credit bursts — a mistake corrected three times in one afternoon
// forms and pays off entirely inside one half. This is the honest version of
// the question injection would answer live: "did limbic know this already?"
// All pair verdicts are computed once up front (cache makes this idempotent);
// prefix clusterings are then deterministic replays over the verdict graph.
export async function retrodictOnline (records, { minSize = 3, oracle = null, embedder = null } = {}) {
  const corrective = records
    .filter(r => CORRECTIVE.has(r.label) && r.ts)
    .sort((a, b) => a.ts.localeCompare(b.ts))

  const vec = await eventVectors(corrective, embedder)
  const warm = Math.max(minSize, 3)
  let preventable = 0
  let scored = 0
  const hits = []
  for (let i = warm; i < corrective.length; i++) {
    const past = corrective.slice(0, i)
    const clusters = oracle
      ? (await semanticClusters(past, oracle, { minSize, embedder })).clusters
      : cluster(past, { minSize })
    scored++
    const f = corrective[i]
    const ft = tokens(f.text)
    let hit = clusters.find(c => c.events.some(e => jaccard(ft, tokens(e.text)) >= AUTO))
    if (!hit && oracle) {
      for (const c of clusters) {
        const members = c.events.filter(e =>
          jaccard(ft, tokens(e.text)) >= FLOOR || pairCosine(vec, f, e) >= EMB_FLOOR)
        if (!members.length) continue
        const verdicts = await oracle.samePairs(members.map(m => ({ a: f.text, b: m.text })))
        if (verdicts.some(v => v === true)) { hit = c; break }
      }
    }
    if (hit) {
      preventable++
      hits.push({ text: f.text.slice(0, 100), signature: hit.signature })
    }
  }
  return { events: corrective.length, scored, preventable, rate: scored ? preventable / scored : 0, hits }
}

// Vectors keyed by event identity, embedded once per run — the same records
// flow through past slices, future scoring and every online prefix.
async function eventVectors (events, embedder) {
  const map = new Map()
  if (!embedder) return map
  const vecs = await embedder.embed(events.map(e => e.text))
  events.forEach((e, i) => { if (vecs[i]) map.set(e, vecs[i]) })
  return map
}

function pairCosine (vec, a, b) {
  const va = vec.get(a)
  const vb = vec.get(b)
  return va && vb ? cosine(va, vb) : 0
}
