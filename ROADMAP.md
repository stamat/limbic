# Roadmap

**Day-one outcome and the improvement plan that supersedes the forward stages here:
[REPORT.md](REPORT.md).** Short version: v0–v0.4 machinery exists, the retrodiction
gate stands honestly unpassed at 0.0%, the bottleneck is the similarity substrate,
and stages i1–i5 in the report are the path. This file stays as the original spec
and gate record.

Gated, not dated: each stage ships only when the previous stage's numbers clear their
bar. A stage that fails its gate stops the project honestly — the README reports the
numbers either way. Research debts are named where they are owed: surprise shape from
[Titans](https://arxiv.org/abs/2501.00663), bounded memory and decay from
[Evo-Memory](https://arxiv.org/pdf/2511.20857), rules-first arbitration from
[RPMS](https://arxiv.org/abs/2603.17831), anomaly-likelihood baselines from
[NuPIC](https://github.com/numenta/nupic-legacy), the propose-inbox and `mechanized`
lifecycle from [grudge](https://github.com/eddieparc/grudge), hook architecture patterns
from [claude-subconscious](https://github.com/letta-ai/claude-subconscious).

## v0 — measurement harness (now)

Replay Claude Code history, classify prompts (regex, precision-first), score surprise
chains, print stats. No memory, no injection, no LLM calls.

**Gate to v0.2:** corrective rate across real history lands between 3% and 40% (below:
too sparse to cluster; above: classifier is mislabeling), and hand-auditing the top 50
corrective events shows ≥ 90% are genuine corrections. The audit corpus doubles as the
labeled test set for every later classifier change.

**Audit result (2026-08-04, 1201 prompts, 309 sessions):** first classifier measured
precision 86%, recall ~36% — and found its own ceiling: the largest missed class is
soft critique of delivered work ("the toggle should not shift"), unclassifiable without
the previous turn's content. Cue expansion from the audited classes (why-challenges as
their own `challenge` label, typo variants, restore-to-previous, a diagnostic-question
guard) lifted corrective to 3.5% with max chain 4 — the gate floor clears. The ceiling
finding pulls the turn-context Haiku classifier from v0.3 into v0.2 as a measured
necessity, not a convenience. Judged examples live as classifier tests; the audit
itself was worked through by hand but never persisted as a file — found during i1,
recorded honestly here. i2 rebuilds it as a labeled corpus under `~/.limbic/corpus/`;
real prompt text stays out of the public repo either way.

## v0.2 — the dream pass (`limbic dream`)

Offline deduction over the ledger. Cluster corrective events by project and similarity;
3+ in a cluster emits a **rule candidate** into `~/.limbic/inbox/` as plain Markdown —
proposed, never activated (grudge's inbox, our automation). `limbic rules` lists;
`limbic accept/reject` promotes or suppresses. Optional Haiku assist for clustering via
`claude -p`, regex-only otherwise — degrade honestly.

Evo-Memory's warnings become mechanics here: the ledger and rule set are bounded; rules
decay when their cluster stops recurring; rejected clusters stay suppressed.

**Benchmark (retrodiction):** replay history in halves — rules deduced from the first
half, scored against the second: what fraction of later corrections did an earlier rule
address? **Gate to v0.3:** ≥ 10% preventable, and zero rules a human audit calls wrong.

**First run (2026-08-04): 0.0% — gate not passed.** 42 corrective events produced zero
clusters at gate settings; loosening the threshold manufactured clusters glued by
generic phrases ("isn't working"), the exact generic-advice failure Evo-Memory warns
about. Two ceilings, one cause: real repetition is semantic — "menu previews suffer the
same issues navbar did" shares no tokens with the navbar corrections it repeats. Next
step is therefore fixed: the `claude -p` Haiku assist upgrades from phrasing-only to
(a) turn-context classification during replay and (b) same-mistake judgment on
candidate pairs above a weak lexical floor — bounded calls, deterministic evidence,
same propose gate. The harness did its job: belief priced before purchase.

**Third run (2026-08-04, audit-hardened): 0.0% — and that is the finding.** The day's
numbers, in order: 7.5% (capped oracle), 20.8% (uncapped — inflated by a 16-member
union-find blob and an imperative-glue cluster), 9.1% (average-linkage killed the
blob), 0.0% (generic-vocabulary guard killed "fix it"~"fix all"). Each drop was a
measurement artifact dying, not signal vanishing: the full-history dream still finds
real clusters (the 9-event pseudo-element saga), but those bursts live inside one
project phase — split chronologically in half, their membership scatters below
threshold. The hypothesis this leaves: corrections recur in *bursts within a work
phase*, not across months, so a rule's payoff window is the rest of the burst — which
half-split retrodiction structurally cannot see. Next benchmark: sliding-window
retrodiction (rule deduced at event k, scored against k+1…k+w). Until it runs, the
thesis stands undemonstrated on this history and this README-level claim stays
exactly that honest.

**Second run (2026-08-04, semantic oracle, capped at 40+30 calls): 7.5% — closer, not
passed.** Context classification lifted corrective to 8.8% (106 events); semantic
merge produced 7 proposed rules, retrodiction matched 4 of 53 future corrections to
past clusters — including cross-token hits ("gap between sidebar and header" ↔
"covering the bottom line of the header"). Two of the seven deduced rules independently
re-derived rules the author already keeps in CLAUDE.md ("read docs end to end", "ask
whether it should exist first") — manual and deduced doctrine converging is the
strongest evidence yet. Before the next gate attempt: cross-session batching (per-
session batches waste the cap on near-empty calls), an uncapped classification pass,
and a precision audit of oracle labels — max chain hit 12, which smells like a
mislabeled streak until audited.

## v0.3 — live hooks (Claude Code adapter)

`UserPromptSubmit` classifies live (regex fast-path, capped Haiku assist), appends to
the ledger; `SessionStart` injects *accepted rules only*, filtered by project —
RPMS's finding is the arbitration law: rules first, episodes only when state-filtered,
or memory hurts. Stop-hook background work stays non-blocking
(claude-subconscious's pattern). Recursion guard: a hook-spawned `claude` never fires
hooks. Whisper/full/off modes.

**Gate to v0.4:** across 4+ weeks A/B (rules injected on alternate days): correction
rate on rule-covered mistake classes drops ≥ 30%, and injected-rule token cost stays
under the measured token savings.

## v0.4 — prediction and preemption

The explicit prediction loop: turn end predicts the likely follow-up; a proven pattern
(N hits) lets the agent fold the answer in before it is asked. Novelty misses start
writing episodes, not just corrections — the second surprise axis.

**Gate to v1:** preempted follow-ups measurably reduce turns-to-done without scope
creep complaints becoming their own correction cluster.

## v1 — mechanization

Stable rules compile out of memory into enforcement: a lint rule, a test, a hook —
grudge's `mechanized` status, automated. A mechanized rule stops being injected
context; the dream pass proposes the mechanization the way it proposes rules. Adapters
for Codex/opencode land here — the core never knew which agent it served.

**The end state:** an automated reviewer assembled from everything you ever corrected,
judging autonomous work before you see it — the QA floor that autonomous project
creation stands on. The dream pass proposes recurring checks as loops the same way it
proposes rules and mechanizations: a correction cluster that keeps recurring on a
schedule becomes a proposed scheduled run, human-gated like everything else. You review
novelty; the ledger reviews the rest.

## Explicitly not planned

Multi-user/team memory, cloud sync, a GUI, semantic search over full transcripts,
any storage the user cannot read with `cat`. See CONTRIBUTING.md refusals.
