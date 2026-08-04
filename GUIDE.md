# Guide

How to run limbic end to end: the commands in working order, every file it
writes, what each label means (you will hand-label against these), what
spends money, and what happens when a piece is missing. The pitch and the
numbers live in [README.md](README.md) and [REPORT.md](REPORT.md); this is
the operations manual.

## Quickstart

```sh
npx limbic replay --llm     # rebuild the ledger from your Claude Code history
npx limbic stats            # what the ledger says about you
npx limbic dream --llm      # cluster corrections into proposed rules
npx limbic rules            # read proposals; accept/reject each by hand
npx limbic retrodict --llm --online --min 2   # the thesis benchmark
npx limbic curate --llm     # propose accepted rules into your CLAUDE.md
npx limbic install          # print the hooks block; paste it yourself
```

Everything runs locally. Only `--llm` spends anything, and it is capped and
cached (see [Costs](#costs)).

## The detection cascade

`replay` labels every prompt through layers, cheap-and-certain before
expensive-and-judged. Every label carries the cue, marker or verdict that
fired — `stats` shows the top cues, and any single decision is auditable
after the fact.

| Layer | What it reads | Cost | Typical cue |
|---|---|---|---|
| Regex cues | prompt text | free | `^(no\|nope)\b[,.! ]` |
| Behavioral events | interruption markers, tool denials, agent self-confessions | free | `interrupt`, `denial`, `\bmy mistake\b` |
| Rephrase detector | consecutive prompt pair | free | `rephrase:0.57` |
| Oracle classify | prompt + previous assistant turn | Haiku, batched | `oracle` |
| Validation pass | every positive oracle verdict, refutation-phrased | Haiku, positives only | `oracle-refuted` |

Verbatim resends are retries, not rephrases — an identical prompt follows an
expired session or a spend limit, and the detector skips it. Behavioral
events carry zero surprise and never touch the correction chain: an Esc is a
signal, not a prompt. Agent self-confessions are model output — own label,
never a user correction, feeding no rule until their precision is proven.

## The labels

You will meet these in `stats`, in rule evidence, and in the corpus file when
you label by hand. The bar for every corrective label: would a rule that
prevents this have saved the exchange?

| Label | Means | Example |
|---|---|---|
| `correction` | prior work or understanding was wrong | "no, I meant the other frame", "restore the previous setting" |
| `fix_request` | delivered work reported broken | "the dropdown is still broken on mobile" |
| `challenge` | pushback on a decision or the quality of delivered work | "why do we need globals?", "too much spacing between the icons" |
| `rephrase` | the same ask reworded, previous delivery missed | detected, not typed |
| `accept` | the work landed | "works now, thanks" |
| `neutral` | everything else: tasks, questions, information, thinking aloud | "commit", "em or rem what's the difference?" |
| `interrupt` / `denial` / `self_correction` | behavioral events, not prompts | — |

Judgment calls that recur: a design question ("was it better to…?",
"should we have chosen em?") is neutral — challenge requires pushing back,
not thinking aloud. A fresh task containing "fix" is neutral — work, not
dissatisfaction. "Why isn't X working?" is a fix_request wearing a
why-question. A verbatim resend after an error is neutral.

## Commands

- **`replay [--projects DIR] [--project SLUG] [--ledger FILE] [--llm]`** —
  full rebuild of the ledger from `~/.claude/projects` history. Idempotent:
  same history, same ledger, byte for byte. `--llm` adds the oracle layers.
- **`stats [--ledger FILE]`** — correction rates against your own baseline,
  per-session sparklines, behavioral counts, top cues.
- **`dream [--llm] [--min N]`** — cluster corrective events into proposed
  rules under `~/.limbic/rules/`. At `--min 2` a pair is admitted only when
  embedding and oracle both confirm it. Proposes at most 10 per run.
- **`rules [--all]`** / **`accept <file>`** / **`reject <file>`** — the
  propose gate. A rejected cluster never re-proposes.
- **`retrodict [--llm] [--online] [--min N]`** — the thesis benchmark.
  Half-split: rules from the first half of history scored against the second.
  `--online`: for every corrective event, was a covering cluster already
  deducible from what came before it?
- **`calibrate [--sample] [--llm] [--repeats N] [--corpus FILE]`** —
  `--sample` pulls a stratified corpus into `~/.limbic/corpus/labels.jsonl`;
  you fill in `"human"` on each line (the labels above). Scoring reports
  Cohen's κ — never raw agreement alone — with per-label precision/recall;
  `--llm --repeats 3` reruns the oracle on fresh caches in shuffled order, so
  cached verdicts and fixed positions cannot fake consistency.
- **`curate [--claude-md FILE] [--llm]`** — accepted rules read against the
  CLAUDE.md you already maintain: proposes additions, flags rules your
  doctrine already covers. Prints only.
- **`install [--predict]`** — prints the hooks block for
  `~/.claude/settings.json`. Never edits it; to uninstall, delete the block.

## Files on disk

Everything under `~/.limbic/`, all readable with `cat`, all safe to delete
(replay rebuilds the ledger; caches refill; rules and corpus are yours —
back those up).

| Path | What | Written by |
|---|---|---|
| `ledger.jsonl` | one record per prompt/event | `replay` (full rebuild) |
| `live-ledger.jsonl` | same shape, appended live | classify hook |
| `live-state.json` | per-session chain counters, bounded at 50 | classify hook |
| `prediction.json` | the standing next-message prediction, consumed on scoring | predict hook |
| `rules/*.md` | one rule per file, status in frontmatter | `dream`, `accept`, `reject` |
| `corpus/labels.jsonl` | calibration corpus, `human` field is yours | `calibrate --sample`, you |
| `cache/oracle.jsonl` | every oracle verdict, keyed by instruction version | oracle |
| `cache/embeddings.jsonl` | every embedded text, keyed by model | embedder |

Ledger record fields: `ts`, `project`, `sessionId`, `label`, `cue`, `chain`
(unbroken corrective run), `surprise` (`1 − 0.5ⁿ`), `trace` (EMA),
`gitBranch`, `text` (capped at 300 chars — the ledger is not a transcript
store, by refusal).

Rule file: frontmatter (`status: proposed|accepted|rejected`, `date`, `size`,
`labels`, `projects`, `signature`) then the statement and its evidence lines.
Edit the statement freely — the file is the rule.

Corpus item: frozen classifier inputs (`text`, `prevPrompt`, `context`) plus
`cascade` (the machine's label at sample time) and `human` (yours; `labeler`
records who labeled). Overwrite any line and rerun `calibrate` — κ
republishes against the new ground truth.

## Costs

Only `--llm` calls a model, and only two shapes exist:

- `claude -p --model haiku`, batched 20 items per call, capped per run
  (`--max-calls`, default 60), cached forever in `cache/oracle.jsonl` — the
  same question is never paid for twice. Cache keys carry the instruction
  version: a better prompt cannot silently reuse old answers.
- ollama `POST /api/embeddings` on localhost — free, local, cached in
  `cache/embeddings.jsonl`.

`LIMBIC_ORACLE=1` guards recursion: a hook-spawned claude that re-enters
limbic sees the flag and does nothing. Every command reports its spend:
`oracle: N calls, M cache hits`.

## Hooks

`install` prints; you paste. Three hooks, all exit 0 always — a memory tool
that blocks a prompt is worse than no memory tool:

- **classify** (`UserPromptSubmit`): regex-only hot path, appends to the live
  ledger, keeps per-session chains, scores and consumes any standing
  prediction. The oracle never runs here.
- **inject** (`SessionStart`): prints accepted rules — and only accepted —
  into session context. The propose gate is the security boundary.
- **predict** (`Stop`, opt-in via `--predict`): one Haiku call per turn,
  predicts your next message from the turn's tail; the next prompt scores it
  hit or miss.

## When a piece is missing

| Missing | Behavior |
|---|---|
| `--llm` not passed | deterministic layers only; no calls, no embeddings |
| `claude` binary absent or timing out | oracle answers null; deterministic labels stand; rules get template statements |
| ollama not running | one failed call marks it absent for the run; oracle-only path, stated in the report line |
| oracle cap reached | remaining items stay at their deterministic label |
| a session file vanishes mid-replay | skipped and counted, never fatal |
| malformed transcript lines | counted (`bad lines`), never fatal |

## Limits

Regex cues are English-only; non-English corrections reach the oracle layer
or pass unlabeled. Windows is untested. The ledger caps stored text at 300
characters and stores no full transcripts — that job is refused
(CONTRIBUTING.md), [claude-mem](https://github.com/thedotmack/claude-mem)
does it well.
