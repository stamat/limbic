# Changelog

All notable changes to limbic are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **RESEARCH.md** — correction-detection research report: what the field calls the
  problem (other-initiated repair, implicit feedback, developer pushback), the
  published numbers that transfer, this machine's own unread behavioral signal,
  and the cascade architecture stage i0 builds. **SOURCES.md** — every external
  source in one annotated registry: summary, category, what limbic takes from it,
  and how deeply it was read.
- **i0 detection hardening**, from that research. Behavioral events become
  first-class ledger records with zero surprise: mid-turn interruptions (44 on real
  history), tool denials (13; plan rejections arrive as the same message), and agent
  self-confessions (8) — model output that gets its own label and can never
  masquerade as a user correction. A deterministic repeat/rephrase detector
  (`src/detect.js`) catches the largest published feedback category (2 at its
  conservative 0.5 threshold). Every positive oracle verdict now faces a second,
  refutation-phrased validation pass (`oracle.validate`, cached, version-keyed):
  on real history it refuted 47 of 142 positives (33%), corrective settled at 141
  (11.1%), and max chain fell 12 → 5 — the mislabeled-streak suspicion from the
  second run's audit, confirmed and fixed. Retrodiction after all of it: still
  0.0% both modes, and half-split now yields zero rules at minSize 3 — detection
  got sharper, cluster supply starves harder; i1 and i3 carry that burden.
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
  the research says, improvement stages i0–i5. v1 mechanization skipped and the
  reason named: one accepted rule is no supply.
- **v0.2.1 semantic oracle.** One module (`src/oracle.js`) owns every LLM touch:
  batched `claude -p --model haiku` calls under subscription auth, capped per run
  (`--max-calls`, default 60), cached forever (`~/.limbic/cache/` — the same question
  is never paid for twice), recursion-guarded (`LIMBIC_ORACLE`), and hardened against
  hostile model output — anything unparseable degrades to the deterministic answer.
  `replay --llm` classifies regex-neutral prompts against the previous assistant
  turn; `dream --llm`/`retrodict --llm` merge clusters through same-mistake pair
  judgment (lexical floor nominates, oracle confirms). On real history: corrective
  3.5% → 8.8%, retrodiction 0.0% → 7.5%, and the dream proposed 7 rules — two of
  which independently re-derived rules the author already keeps in CLAUDE.md, which
  is the thesis working.
- **v0.2 dream pass.** `limbic dream` clusters corrective events (Jaccard over
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

### Fixed

- **All three hooks were dead on arrival**: they read stdin with the promises
  `readFile(0)`, which refuses file descriptors — the read threw, the outer catch
  swallowed it, and every hook exited 0 having done nothing. Caught by the first
  hook test ever written; stdin now rides the sync API.
- **Live chains survive parallel sessions.** `live-state.json` held one global
  session counter, so two open panes reset each other's chains on every interleaved
  prompt. State is now per-session, bounded at 50 sessions, oldest evicted.
- **A prediction is scored exactly once.** An interrupted turn left the standing
  prediction rescoring against every later prompt, biasing the hit-rate the v0.4
  gate exists to measure. Scored predictions are consumed from disk.
- **The "what happened with/to" cue survives its own guard.** The diagnostic-question
  guard ate the fix_request cue whenever the phrase opened the prompt — the cue only
  ever fired mid-sentence. The guard now exempts it.
- **IDE wrapper text no longer reaches the classifier.** `<ide_selection>`,
  `<ide_opened_file>` and `<system-reminder>` blocks ride inside prompt text; selected
  code saying "doesn't work" was labeling prompts as fix_requests. Wrappers are stripped
  at the trust boundary; wrapper-only prompts vanish. Found by the first replay audit.
- **A session file vanishing between listing and reading** killed the first slow
  `--llm` run; now skipped and counted, never fatal.

### Changed

- **Classifier v2, from a hand audit of 1201 real prompts** (precision 86%, recall ~36%
  measured on v1): new `challenge` label for why-did-we decision questions and
  delivered-work complaints, typo-tolerant cues, restore-to-previous as correction, and
  a diagnostic-question guard so "does X have the same issue?" stays neutral. Corrective
  rate on real history moved 1.2% → 3.5%, max chain 1 → 4. Stats break corrective into
  `c/f/q/r` per project.
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
  drop a measurement artifact dying. ROADMAP.md records the run ladder; REPORT.md's
  i-stages are the answer.
- **The predict hook reads the transcript tail**, not the whole file — transcripts
  reach tens of MB and the hook runs every turn.
