import { tokens, jaccard, AUTO, FLOOR } from './cluster.js'
import { cosine, EMB_FLOOR } from './embed.js'

// Semantic clustering: lexical similarity nominates candidate pairs, the
// oracle confirms them, union-find merges confirmed pairs into clusters.
// Membership is auditable twice over — every merged pair was either above the
// lexical threshold (deterministic) or answered "yes" by the oracle (cached,
// replayable). The floor exists because asking the oracle about every pair is
// O(n²) plan-budget; below it, two corrections share so little language that
// a shared rule is implausible.

// A cluster held together only by imperative glue is a category, not a
// mistake: "fix it" and "fix all" share a verb, never a lesson. Clusters
// whose shared vocabulary sits entirely in this set are dropped — the first
// honest retrodiction run counted four such matches as "preventable".
const GENERIC = new Set([
  'fix', 'all', 'still', 'work', 'working', 'broken', 'issue', 'issues',
  'need', 'needs', 'wrong', 'bug', 'error', 'problem', 'update', 'change'
])

// Merging is average-linkage over the confirmed-pair graph, not union-find:
// transitive closure let one drifted oracle "yes" chain unrelated corrections
// into a 16-member misc-dissatisfaction blob on the first real run, and a
// blob matches everything, which flatters every benchmark downstream. Two
// groups merge only when at least LINKAGE of their cross-pairs are confirmed.
const LINKAGE = 0.6

export async function semanticClusters (events, oracle, { minSize = 3, embedder = null } = {}) {
  const toks = events.map(e => tokens(e.text))
  // Embeddings nominate what tokens cannot: a pair with zero lexical overlap
  // still reaches the oracle when its cosine clears the embedding floor.
  // Nomination widens the ask list, never the edge set — the oracle confirms
  // every sub-AUTO pair, embedding-nominated or not.
  const vecs = embedder ? await embedder.embed(events.map(e => e.text)) : []
  const edges = new Set()
  // Edge provenance feeds the minSize-2 rule: a two-event cluster is a claim
  // resting on one pair, so that pair must be double-confirmed — embedding
  // floor AND oracle yes. Lexical overlap alone, or either signal alone, only
  // ever earns membership in a 3+ cluster.
  const meta = new Map()
  const edge = (i, j) => i < j ? `${i}:${j}` : `${j}:${i}`

  const ask = []
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const sim = jaccard(toks[i], toks[j])
      const cos = vecs[i] && vecs[j] ? cosine(vecs[i], vecs[j]) : 0
      if (sim >= AUTO) {
        edges.add(edge(i, j))
        meta.set(edge(i, j), { cos, oracle: false })
        continue
      }
      if (sim >= FLOOR || cos >= EMB_FLOOR) ask.push({ i, j, cos })
    }
  }

  let confirmed = 0
  if (oracle && ask.length) {
    const verdicts = await oracle.samePairs(ask.map(({ i, j }) => ({ a: events[i].text, b: events[j].text })))
    ask.forEach(({ i, j, cos }, n) => {
      if (verdicts[n] === true) {
        edges.add(edge(i, j))
        meta.set(edge(i, j), { cos, oracle: true })
        confirmed++
      }
    })
  }

  let groups = events.map((_, i) => [i])
  for (let merged = true; merged;) {
    merged = false
    let best = null
    for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        let links = 0
        for (const i of groups[a]) for (const j of groups[b]) if (edges.has(edge(i, j))) links++
        const density = links / (groups[a].length * groups[b].length)
        if (density >= LINKAGE && (!best || density > best.density)) best = { a, b, density }
      }
    }
    if (best) {
      groups[best.a] = groups[best.a].concat(groups[best.b])
      groups.splice(best.b, 1)
      merged = true
    }
  }

  const clusters = groups
    .filter(g => g.length >= minSize)
    .filter(g => {
      if (g.length !== 2) return true
      const m = meta.get(edge(g[0], g[1]))
      return Boolean(m && m.oracle && m.cos >= EMB_FLOOR)
    })
    .filter(g => {
      const counts = new Map()
      for (const i of g) for (const t of toks[i]) counts.set(t, (counts.get(t) ?? 0) + 1)
      const floor = Math.ceil(g.length / 2)
      const shared = [...counts.entries()].filter(([, n]) => n >= floor).map(([t]) => t)
      return shared.some(t => !GENERIC.has(t))
    })
    .map(g => {
      g.sort((a, b) => a - b)
      const evs = g.map(i => events[i])
      const counts = new Map()
      for (const i of g) for (const t of toks[i]) counts.set(t, (counts.get(t) ?? 0) + 1)
      const floor = Math.ceil(g.length / 2)
      const shared = new Set([...counts.entries()].filter(([, n]) => n >= floor).map(([t]) => t))
      return {
        events: evs,
        size: evs.length,
        projects: [...new Set(evs.map(e => e.project))],
        labels: [...new Set(evs.map(e => e.label))],
        shared,
        signature: [...shared].sort().slice(0, 8).join('-') || `s${evs.length}-${evs[0].ts ?? 'na'}`
      }
    })
    .sort((a, b) => b.size - a.size)

  return { clusters, asked: ask.length, confirmed }
}
