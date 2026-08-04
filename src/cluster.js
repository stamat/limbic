// Clustering is Jaccard over stopworded word sets — no embeddings, no LLM, on
// purpose: at ledger scale (dozens of corrective events) O(n²) exact overlap
// beats approximate anything, and a cluster you can explain ("they share
// 'navbar', 'overflow'") survives the human audit that every rule must pass.

const STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'be', 'it', 'its', 'that', 'this',
  'to', 'of', 'in', 'on', 'for', 'and', 'or', 'but', 'we', 'you', 'i', 'my',
  'do', 'does', 'did', 'not', 'no', 'let', 'lets', "let's", 'can', 'should',
  'would', 'have', 'has', 'with', 'as', 'at', 'so', 'if', 'then', 'there',
  'why', 'what', 'how', 'when', 'also', 'just', 'like', 'me', 'us', 'our'
])

export function tokens (text) {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP.has(w))
  )
}

export function jaccard (a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

// The similarity constants live beside the similarity they parameterize —
// AUTO is the lexical overlap above which two texts pair with no oracle;
// FLOOR is the weakest overlap worth spending a cached oracle question on.
// Every module imports these; a second 0.25 anywhere is a drift bug.
export const AUTO = 0.25
export const FLOOR = 0.06

// Greedy single-link: an event joins the first cluster it clears the
// threshold against. Same project is not required — a mistake repeating
// across projects is a stronger rule, not a different one — but it is
// recorded, so the dream pass can scope the rule it proposes.
export function cluster (events, { threshold = AUTO, minSize = 3 } = {}) {
  const items = events.map(e => ({ event: e, toks: tokens(e.text) }))
  const clusters = []
  for (const item of items) {
    let placed = false
    for (const c of clusters) {
      if (c.items.some(other => jaccard(item.toks, other.toks) >= threshold)) {
        c.items.push(item)
        placed = true
        break
      }
    }
    if (!placed) clusters.push({ items: [item] })
  }
  return clusters
    .filter(c => c.items.length >= minSize)
    .map(c => {
      const evs = c.items.map(i => i.event)
      const shared = sharedTokens(c.items.map(i => i.toks))
      return {
        events: evs,
        size: evs.length,
        projects: [...new Set(evs.map(e => e.project))],
        labels: [...new Set(evs.map(e => e.label))],
        shared,
        signature: [...shared].sort().slice(0, 8).join('-') || `c${evs.length}-${evs[0].ts ?? 'na'}`
      }
    })
    .sort((a, b) => b.size - a.size)
}

function sharedTokens (sets) {
  if (!sets.length) return new Set()
  const counts = new Map()
  for (const s of sets) for (const t of s) counts.set(t, (counts.get(t) ?? 0) + 1)
  // Tokens present in at least half the cluster: strict intersection collapses
  // to nothing as soon as one member phrases the same complaint differently.
  const floor = Math.ceil(sets.length / 2)
  return new Set([...counts.entries()].filter(([, n]) => n >= floor).map(([t]) => t))
}
