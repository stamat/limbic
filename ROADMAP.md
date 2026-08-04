# Roadmap

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
judging autonomous work before you see it. You review novelty; the ledger reviews the
rest.

## Explicitly not planned

Multi-user/team memory, cloud sync, a GUI, semantic search over full transcripts,
any storage the user cannot read with `cat`. See CONTRIBUTING.md refusals.
