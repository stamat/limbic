# Changelog

All notable changes to limbic are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Online retrodiction** (`limbic retrodict --online`): for every corrective event,
  was a covering cluster already deducible from what came before? Scored 0.0% on real
  history — the burst hypothesis fails in its strong form under the hardened
  pipeline; [REPORT.md](REPORT.md) carries the full analysis.
- **v0.3 adapter, built not installed**: `hooks/classify.js` (regex-only hot path,
  live ledger), `hooks/inject.js` (accepted rules only, the propose gate as security
  boundary), `limbic install` prints the settings block and never edits settings.
- **v0.4 prediction, opt-in and unproven**: `hooks/predict.js` (one Haiku call per
  turn, silent-fail), hit/miss scored into the live ledger by the classify hook.
- **REPORT.md** — day-one report: the numbers ladder, five audit-found defects, what
  the research says, improvement stages i1–i5. v1 mechanization skipped and the
  reason named: one accepted rule is no supply.

### Fixed

- **IDE wrapper text no longer reaches the classifier.** `<ide_selection>`,
  `<ide_opened_file>` and `<system-reminder>` blocks ride inside prompt text; selected
  code saying "doesn't work" was labeling prompts as fix_requests. Wrappers are stripped
  at the trust boundary; wrapper-only prompts vanish. Found by the first replay audit.

### Changed

- **Classifier v2, from a hand audit of 1201 real prompts** (precision 86%, recall ~36%
  measured on v1): new `challenge` label for why-did-we decision questions and
  delivered-work complaints, typo-tolerant cues, restore-to-previous as correction, and
  a diagnostic-question guard so "does X have the same issue?" stays neutral. Corrective
  rate on real history moved 1.2% → 3.5%, max chain 1 → 4. Stats break corrective into
  `c/f/q` per project.

### Changed

- **Chain spec revised: any non-corrective prompt resets the chain.** The first audit
  found a "chain of 15" spanning a day of unrelated fixes — cumulative session heat,
  which the EMA trace already measures. Escalation now means an unbroken run of
  corrections. The old guarantee's test is replaced, deliberately and loudly.
- **Cluster merging is average-linkage, not union-find** — one drifted oracle "yes"
  chained a 16-member misc-blob on the first uncapped run, and a blob matches
  everything. Two groups merge only when ≥60% of cross-pairs are confirmed. Plus a
  generic-vocabulary guard: clusters sharing only words like "fix"/"all"/"broken" are
  categories, not mistakes, and are dropped.
- **Oracle v2**: design questions ("was it better to…") are neutral, not challenges;
  cache keys carry the instruction version so a better prompt cannot silently reuse
  answers to the old one; replay batches the oracle backlog across sessions (26 calls
  now cover what 40 per-session calls did not).
- **Retrodiction after all of the above: 0.0%**, down from an inflated 20.8% — each
  drop a measurement artifact dying. ROADMAP.md records the run ladder and the
  burst-locality hypothesis it leaves; a sliding-window benchmark is the named next
  step.

### Added

- **v0.2.1 semantic oracle.** One module (`src/oracle.js`) owns every LLM touch:
  batched `claude -p --model haiku` calls under subscription auth, capped per run
  (`--max-calls`, default 60), cached forever (`~/.limbic/cache/` — the same question
  is never paid for twice), recursion-guarded (`LIMBIC_ORACLE`), and hardened against
  hostile model output — anything unparseable degrades to the deterministic answer.
  `replay --llm` classifies regex-neutral prompts against the previous assistant
  turn; `dream --llm`/`retrodict --llm` merge clusters through same-mistake pair
  judgment (lexical floor nominates, oracle confirms, union-find merges). On real
  history: corrective 3.5% → 8.8%, retrodiction 0.0% → 7.5%, and the dream proposed
  7 rules — two of which independently re-derived rules the author already keeps in
  CLAUDE.md, which is the thesis working. Also fixed: a session file vanishing
  between listing and reading killed the first slow run; now skipped and counted. `limbic dream` clusters corrective events (Jaccard over
  stopworded tokens, zero deps) into rule candidates under `~/.limbic/rules/` —
  status `proposed`, never activated; `limbic rules` lists, `limbic accept|reject`
  promotes or suppresses, and a rejected cluster never re-proposes. `--llm` phrases
  rules via `claude -p` (subscription auth), degrading to an editable template on any
  failure; the LLM never picks cluster membership. `limbic retrodict` runs the thesis
  benchmark — first run scored 0.0% preventable on real history and the ROADMAP
  records why: repetition is semantic, lexical clustering cannot see it.

- **v0 measurement harness.** `limbic replay` rebuilds a local ledger
  (`~/.limbic/ledger.jsonl`) from Claude Code session history: human prompts only
  (sidechains, tool results and command wrappers excluded), classified by a
  precision-first regex classifier (`correction`, `fix_request`, `accept`, `neutral`,
  every label carrying its cue), scored with chained surprise (`1 − 0.5ⁿ`, accept
  resets, silence does not) and an EMA trace. `limbic stats` renders correction rates,
  a personal baseline with outlier threshold, per-session sparklines and top cues.
  Stored prompt text capped at 300 chars — the ledger is not a transcript store.
  Zero dependencies, everything local, no LLM calls.
