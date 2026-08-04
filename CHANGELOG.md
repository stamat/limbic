# Changelog

All notable changes to limbic are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Added

- **v0 measurement harness.** `limbic replay` rebuilds a local ledger
  (`~/.limbic/ledger.jsonl`) from Claude Code session history: human prompts only
  (sidechains, tool results and command wrappers excluded), classified by a
  precision-first regex classifier (`correction`, `fix_request`, `accept`, `neutral`,
  every label carrying its cue), scored with chained surprise (`1 − 0.5ⁿ`, accept
  resets, silence does not) and an EMA trace. `limbic stats` renders correction rates,
  a personal baseline with outlier threshold, per-session sparklines and top cues.
  Stored prompt text capped at 300 chars — the ledger is not a transcript store.
  Zero dependencies, everything local, no LLM calls.
