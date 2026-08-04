import { tokens, jaccard } from './cluster.js'

// Repeat/rephrase is the largest feedback category in chat-log studies (see
// RESEARCH.md) and carries no corrective vocabulary — regex and oracle both
// miss it. Detection is deterministic and immediate-neighbour only: an accept
// between the two asks kills the reading, short prompts never match (their
// token sets make Jaccard a coin flip), and a prompt some other layer already
// labeled keeps that label and its cue. A wider window can come later if the
// hand corpus earns it.
const THRESHOLD = 0.5
const MIN_TOKENS = 4

export function markRephrases (labeled, { threshold = THRESHOLD, minTokens = MIN_TOKENS } = {}) {
  for (let i = 1; i < labeled.length; i++) {
    if (labeled[i].label !== 'neutral') continue
    const prev = labeled[i - 1]
    if (prev.label === 'accept') continue
    const a = tokens(prev.text)
    const b = tokens(labeled[i].text)
    if (a.size < minTokens || b.size < minTokens) continue
    const sim = jaccard(a, b)
    if (sim >= threshold) {
      labeled[i] = { ...labeled[i], label: 'rephrase', cue: `rephrase:${sim.toFixed(2)}` }
    }
  }
  return labeled
}
