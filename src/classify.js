// Precision over recall, deliberately: a prompt mislabeled "correction" becomes
// a poisoned rule injected into every future session, while a missed correction
// only delays a rule until the mistake repeats. Cues are start-anchored or
// phrase-bound for that reason — a bare "wrong" or "fix" anywhere would flood
// the ledger with fresh tasks that merely contain the word.
//
// Cue lists were expanded once against a hand-audited replay of 1201 real
// prompts (v0 audit: precision 86%, recall 36%). The audit also measured this
// classifier's ceiling: soft critique of delivered work ("the toggle should
// not shift") is invisible without the previous turn — that class waits for
// the turn-context classifier, it does not get looser regexes here.
// English-only; the ledger records the cue that fired, so every label is
// auditable after the fact.

const CORRECTION = [
  /^(no|nope)\b[,.! ]/i,
  /^(stop|wait)\b/i,
  /^wrong\b/i,
  /\b(that'?s|this is|it'?s) (wrong|not right|incorrect|broken)\b/i,
  /\bnot what i (asked|meant|wanted)\b/i,
  /^i mean(t)?\b/i,
  /\bi meant\b/i,
  /\bwhat i meant\b/i,
  /\byou (missed|forgot|broke|deleted|ignored|skipped)\b/i,
  /\bwe forgot\b/i,
  /\b(undo|revert) (that|this|it)\b/i,
  /\brestore\b.{0,40}\bprevious\b/i,
  /\bput (it|that) back\b/i,
  /\bshould (not|never) have\b/i,
  /\bi don'?t think (it|that|this|we|you)\b/i
]

const FIX_REQUEST = [
  /\bstill (broken|failing|wrong|not working|doesn'?t work)\b/i,
  /\b(d(oes|os)n'?t|does not|won'?t|isn'?t) work(ing)?\b/i,
  /\bsame (error|problem|issue)s?\b/i,
  /\bsuffer(s)? from the same\b/i,
  /\btry again\b/i,
  /\b(it|that) (fails|failed|errors|crashed)\b/i,
  /\bgets? cut off\b/i,
  /\bnot visible\b/i,
  /\bwhat happened (with|to)\b/i
]

// A decision questioned is not a defect reported: challenges cluster into
// documentation and decision gaps downstream, never into bug-shaped rules.
const CHALLENGE = [
  /^(but )?why (did|do|are|is|was|were|would|isn'?t|aren'?t|doesn'?t|don'?t) (we|you|the|it|this|that)\b/i,
  /^but\b.{3,}\b(still|also|doesn'?t|isn'?t|won'?t|not|need)\b/i,
  /\bhard to read\b/i,
  /\btoo (much|many|big|small|slow|complex|complicated)\b/i,
  /\bi don'?t like\b/i
]

const ACCEPT = [
  /^(thanks|thank you|great|perfect|nice|good|awesome|lgtm|ship it)\b/i,
  /\bworks now\b/i,
  /\bwell done\b/i,
  /\blooks good\b/i
]

// Diagnostic questions wear corrective words without corrective intent —
// "does poops have the same issue?" is curiosity, not a report. The guard
// only covers interrogative openers that the audit caught misfiring; "why"
// stays out of it because why-questions are the challenge class itself, and
// "what happened" is exempted or the guard would eat the fix_request cue
// that phrase exists to fire — a prompt-opening "what happened to X" is a
// report about delivered work, not curiosity.
const DIAGNOSTIC_OPENER = /^(does|do|is|are|can|could|should|would|what(?! happened)|where|when|how)\b/i

const LABELS = [
  ['correction', CORRECTION],
  ['fix_request', FIX_REQUEST],
  ['challenge', CHALLENGE],
  ['accept', ACCEPT]
]

const GUARDED = new Set(['fix_request'])

export function classify (text) {
  for (const [label, cues] of LABELS) {
    for (const cue of cues) {
      if (!cue.test(text)) continue
      if (GUARDED.has(label) && DIAGNOSTIC_OPENER.test(text.trim())) continue
      return { label, cue: cue.source }
    }
  }
  return { label: 'neutral', cue: null }
}
