import { tokens, jaccard } from './cluster.js'

// Semantic clustering: lexical similarity nominates candidate pairs, the
// oracle confirms them, union-find merges confirmed pairs into clusters.
// Membership is auditable twice over — every merged pair was either above the
// lexical threshold (deterministic) or answered "yes" by the oracle (cached,
// replayable). The floor exists because asking the oracle about every pair is
// O(n²) plan-budget; below it, two corrections share so little language that
// a shared rule is implausible.
const AUTO = 0.25
const FLOOR = 0.06

export async function semanticClusters (events, oracle, { minSize = 3 } = {}) {
  const toks = events.map(e => tokens(e.text))
  const parent = events.map((_, i) => i)
  const find = (x) => parent[x] === x ? x : (parent[x] = find(parent[x]))
  const union = (a, b) => { parent[find(a)] = find(b) }

  const ask = []
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const sim = jaccard(toks[i], toks[j])
      if (sim >= AUTO) union(i, j)
      else if (sim >= FLOOR) ask.push({ i, j })
    }
  }

  let confirmed = 0
  if (oracle && ask.length) {
    const verdicts = await oracle.samePairs(ask.map(({ i, j }) => ({ a: events[i].text, b: events[j].text })))
    ask.forEach(({ i, j }, n) => {
      if (verdicts[n] === true) { union(i, j); confirmed++ }
    })
  }

  const groups = new Map()
  events.forEach((e, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(i)
  })

  const clusters = [...groups.values()]
    .filter(g => g.length >= minSize)
    .map(g => {
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
