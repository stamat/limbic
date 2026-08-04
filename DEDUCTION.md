# Deduction — how limbic decides something is true

Every promotion in this pipeline moves a piece of text one hop closer to being
injected into a future session. A false positive does not just sit in a file — it
compounds: a mislabeled prompt becomes a fake corrective event, fake events glue a
fake cluster, the cluster proposes a wrong rule, and an accepted wrong rule whispers
bad doctrine into every session after. So the question this file answers is the
project's load-bearing one: **at each hop, what does it take to believe?**

[GUIDE.md](GUIDE.md) says how to run the machinery; [REPORT.md](REPORT.md) says what
it measured; this file says why any of it is believed. The short answer: nothing
crosses a hop on one witness, everything records the witness it crossed on, and the
human holds the veto at every irreversible door.

## The principles

- **Precision before recall, priced.** The asymmetry is the whole design: a missed
  correction delays a rule until the mistake repeats — annoying. A false correction
  poisons future context — compounding. Every layer's default is therefore *no*:
  regex cues are start-anchored and phrase-bound, oracle instructions end in "when
  unsure, neutral", the validation pass ends in "when in doubt, no."
- **Two independent witnesses per promotion.** Nomination is never confirmation.
  Lexical or embedding similarity may *nominate* a pair; only the oracle *confirms*
  it; only linkage density *merges* it. A cluster of two — a claim resting on a
  single pair — needs both signal families to agree (embedding floor AND oracle
  yes). One drifted witness cannot promote anything alone; the 16-member union-find
  blob is what happened when it briefly could.
- **Deterministic before judged.** Free, replayable, explainable layers run first;
  the model is only asked about the residue those layers cannot see, and its every
  answer is cached, version-keyed and replayable. A verdict you cannot re-derive is
  not evidence.
- **Every verdict carries its evidence.** Each ledger record names the cue, marker
  or verdict that fired (`cue: "^(no|nope)\\b"`, `cue: "oracle-refuted"`,
  `cue: "rephrase:0.57"`). Every audit in REPORT.md was a grep, because the
  evidence rides with the claim.
- **Doubt refuses to promote — except where dropping is the harm.** The cascade
  abstains to neutral; the propose gate holds anything unconfirmed. The curator
  runs the one deliberate inversion: an unverifiable coverage judgment *proposes*
  the rule rather than silently dropping it, because its failure directions are
  reversed — a wrongly proposed line costs the human a shrug, a wrongly dropped
  rule dies unseen.
- **The human holds every irreversible door.** Machine output stops at `proposed`.
  Acceptance, corpus labels, the hooks block, the CLAUDE.md paste — all by hand.
  This is also the security boundary (CONTRIBUTING.md's threat model): the
  classifier gates *signal quality*; the propose gate gates *injection*.
- **Measurements distrust themselves.** Raw agreement flatters, so κ is the
  headline (published deflation: "85% agreement" ≈ κ 0.48). Cached verdicts fake
  perfect consistency, so repeat runs get fresh caches. Fixed item order hides
  position bias, so repeats shuffle. A better prompt silently reusing old answers
  is cache poisoning, so cache keys carry the instruction version. Replay is a
  full rebuild so the same history yields the same ledger, byte for byte.
- **Every number must be killable.** A benchmark that cannot say 0.0% is
  advertising. Retrodiction, calibration and the propose gate are all built so the
  honest answer can be zero — and repeatedly was.

## Chain of custody

What each promotion requires, who can veto it, and where the evidence lands:

| Hop | Claim | Evidence required | Veto | Recorded in |
|---|---|---|---|---|
| text → label | "this prompt is a correction" | regex cue; or oracle verdict **plus** surviving the refutation pass; rephrase: similarity in the 0.5–0.95 band, no accept between, both prompts ≥4 tokens | validation pass; diagnostic-question guard | `ledger.jsonl` `cue` |
| entry → behavioral event | "the user pushed back without words" | exact interrupt marker; denial message in an `is_error` tool result; confession cue in assistant text | events carry zero surprise and feed no rules | `ledger.jsonl`, own labels |
| label → corrective event | "worth clustering" | label ∈ {correction, fix_request, challenge, rephrase} — behavioral and accept never | — | `CORRECTIVE` in `surprise.js` |
| events → pair | "same underlying mistake" | lexical ≥ AUTO (0.25); else nomination (lexical ≥ 0.06 or cosine ≥ 0.7) **plus** oracle yes | oracle no; oracle null = not promoted | oracle cache, replayable |
| pairs → cluster | "a repeating mistake" | average-linkage: ≥60% of cross-pairs confirmed; shared vocabulary beyond generic verbs; size ≥3, or size 2 with embedding **and** oracle agreeing on the one pair | generic-vocabulary guard | cluster signature |
| cluster → proposed rule | "worth a human's minute" | unknown signature (a rejected cluster never re-proposes); inbox capped at 10 | — | `rules/*.md`, `status: proposed` |
| proposed → accepted | "true enough to inject" | **human judgment only** | human | `status: accepted` |
| accepted → injected | "belongs in live context" | human pasted the hooks block; inject reads accepted only | delete the block | `settings.json`, user's hand |
| accepted → doctrine | "belongs in CLAUDE.md" | curator proposes; embedding+oracle may mark "already covered"; human pastes | human | the user's own file |
| claim → published number | "this works N%" | a benchmark that can output zero; κ against a labeled corpus with provenance marked; repeat runs on fresh caches | the next audit | REPORT.md |

## Case law

The abstract rules above were each paid for by a specific failure. The receipts:

- **20.8% → 0.0%.** The first uncapped run flattered itself through a union-find
  blob (one drifted "yes" chained 16 unrelated corrections) and imperative glue
  ("fix it" ~ "fix all"). Average-linkage and the generic-vocabulary guard are the
  witnesses added; the number died. Killing your best number is the system working.
- **The chain of 15.** One "escalation" spanned a day of unrelated fixes — the
  metric was measuring session heat, not escalation. Spec revised: any
  non-corrective prompt resets the chain; the old guarantee's test replaced loudly.
- **The guard that ate its own cue.** "what happened with X" could never fire at a
  prompt's start — the diagnostic-question guard swallowed it. Found by writing the
  test the cue never had.
- **Three dead hooks.** Every hook read stdin a way node's promises API refuses;
  the throw was swallowed and each exited 0 having done nothing. The first hook
  test ever written found it. *Built* is a fiction until something can fail.
- **The s9 saga dissolving.** i1's gate ("the saga re-forms as one cluster") went
  unfalsifiable when stricter detection refuted the saga's own members upstream.
  The gate was re-anchored to calibration instead of being pencil-whipped.
- **Rephrase, 0-for-2.** The detector's only two firings on real history were
  verbatim resends after an expired session and a spend limit — retries, not
  rephrases. The hand corpus convicted it; the verbatim band (≥0.95) acquits
  retries now. κ moved 0.82 → 0.85 on the fix.
- **The oracle, consistent and flat.** Three fresh-cache shuffled runs: inter-run
  κ 0.91–0.96 (stable), accuracy κ 0.80–0.81 — *below* the deterministic 0.85.
  Consistency is not correctness; the architecture's most expensive layer is
  currently its least earning, and n1 decides whether it improves or leaves.

## What cannot be deduced yet

Named openly, because an unlisted unknown reads as a claim:

- **Whether the labels are right.** The corpus carries Opus-reference annotations —
  a different model than the Haiku oracle it judges, but still not the user's
  hand. κ 0.85 is honest against that reference and provisional against gold;
  every line is editable and κ republishes on rerun.
- **Whether 4.3% survives fresh verdicts.** The first non-zero rode fully cached
  oracle answers; the same protocol that caught the oracle flat must confirm the
  pairs hold.
- **Whether the six hits are right.** i3's gate owes a human wrong-rule audit;
  "preventable" is machine-judged until then.
- **Whether injection helps at all.** The thesis's last hop — rules in context
  reducing corrections — has zero live data. It starts with a paste (n2), and
  every number before it is upstream of the only one that matters.
- **What never reaches the transcript.** A user silently deleting agent code
  corrects without typing; 30.9% of agent code dies that way in published data.
  Transcript-side deduction is structurally blind there — git-side retention is
  the named exploration, not a claim.
