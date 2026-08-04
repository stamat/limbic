# Changelog

All notable changes to limbic are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
