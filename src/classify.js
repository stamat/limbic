// Precision over recall, deliberately: a prompt mislabeled "correction" becomes
// a poisoned rule injected into every future session, while a missed correction
// only delays a rule until the mistake repeats. Cues are start-anchored or
// phrase-bound for that reason — a bare "wrong" or "fix" anywhere would flood
// the ledger with fresh tasks that merely contain the word.
// English-only in v0; the ledger records the cue that fired so every label is
// auditable after the fact.

const CORRECTION = [
  /^(no|nope)\b[,.! ]/i,
  /^(stop|wait)\b/i,
  /\b(that'?s|this is|it'?s) (wrong|not right|incorrect|broken)\b/i,
  /\bnot what i (asked|meant|wanted)\b/i,
  /\bi meant\b/i,
  /\byou (missed|forgot|broke|deleted|ignored|skipped)\b/i,
  /\bwhy (did|would) you\b/i,
  /\b(undo|revert) (that|this|it)\b/i,
  /\bshould (not|never) have\b/i
]

const FIX_REQUEST = [
  /\bstill (broken|failing|wrong|not working|doesn'?t work)\b/i,
  /\b(doesn'?t|does not|won'?t|isn'?t) work(ing)?\b/i,
  /\bsame (error|problem|issue)\b/i,
  /\btry again\b/i,
  /\b(it|that) (fails|failed|errors|crashed)\b/i
]

const ACCEPT = [
  /^(thanks|thank you|great|perfect|nice|good|awesome|lgtm|ship it)\b/i,
  /\bworks now\b/i,
  /\bwell done\b/i,
  /\blooks good\b/i
]

const LABELS = [
  ['correction', CORRECTION],
  ['fix_request', FIX_REQUEST],
  ['accept', ACCEPT]
]

export function classify (text) {
  for (const [label, cues] of LABELS) {
    for (const cue of cues) {
      if (cue.test(text)) return { label, cue: cue.source }
    }
  }
  return { label: 'neutral', cue: null }
}
