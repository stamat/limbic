import { cosine, EMB_FLOOR } from './embed.js'

// The curator closes the loop where the user actually lives: doctrine is the
// CLAUDE.md they already maintain, not a parallel store limbic invents. It
// reads accepted rules against that file and prints — never writes — a
// proposal: additions for what the doctrine does not cover, and "already
// covered" verdicts for rules the user keeps by hand (the dedup that explains
// why two re-derived rules were rejected on day one). Embeddings nominate
// rule↔line pairs, the oracle confirms coverage; with neither available every
// rule is proposed as an addition and the human judges — degrade honestly,
// and the safe direction is always to propose, never to silently drop.

// Candidate doctrine lines: bullets and plain prose lines, markdown
// decoration stripped. Headings organize, they do not instruct — skipped.
export function doctrineLines (markdown) {
  const out = []
  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('```') || line.startsWith('|')) continue
    const text = line
      .replace(/^[-*]\s+/, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .trim()
    if (text.length >= 20) out.push(text)
  }
  return out
}

export async function curate ({ rules, doctrine, oracle = null, embedder = null }) {
  const lines = doctrineLines(doctrine)
  const additions = []
  const covered = []

  const lineVecs = embedder ? await embedder.embed(lines) : []
  for (const rule of rules) {
    const statement = rule.statement
    let best = null
    if (embedder) {
      const [v] = await embedder.embed([statement])
      if (v) {
        for (let i = 0; i < lines.length; i++) {
          if (!lineVecs[i]) continue
          const cos = cosine(v, lineVecs[i])
          if (cos >= EMB_FLOOR && (!best || cos > best.cos)) best = { line: lines[i], cos }
        }
      }
    }
    let isCovered = false
    if (best && oracle) {
      const [same] = await oracle.samePairs([{ a: statement, b: best.line }])
      isCovered = same === true
    }
    if (isCovered) covered.push({ rule, line: best.line, cos: best.cos })
    else additions.push(rule)
  }
  return { additions, covered, doctrineLines: lines.length }
}
