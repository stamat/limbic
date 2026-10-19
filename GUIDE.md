# Guide

How to run limbic end to end: the commands in working order, every file it
writes, what each label means (you will hand-label against these), what
spends money, and what happens when a piece is missing. The pitch and the
numbers live in [README.md](README.md) and [REPORT.md](REPORT.md); why any
verdict is believed lives in [DEDUCTION.md](DEDUCTION.md); this is the
operations manual.

## Quickstart

```sh
npx limbic replay --llm     # rebuild the ledger from your Claude Code history
npx limbic stats            # what the ledger says about you
npx limbic dream --llm      # cluster corrections into proposed rules
npx limbic rules            # read proposals; accept/reject each by hand
npx limbic efficacy         # did an accepted rule work? keep, graduate, revise or check
npx limbic graduate <file>  # after you paste a rule that worked into your CLAUDE.md
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
| `missed_step` | a step the agent should have taken unasked. Not corrective: no surprise, no chain. Dream clusters it with the corrections | "did we update the docs?", "don't forget to update the examples" |
| `directive` | a standing instruction the user asks the agent to keep. Dream proposes each one alone | "remember in ~/.claude that changelog notes stay bare", "from now on, always run the linter" |
| `accept` | the work landed. A request to commit or push counts. A question is never an accept | "works now, thanks", "commit and push" |
| `neutral` | everything else: tasks, questions, information, thinking aloud | "em or rem what's the difference?" |
| `interrupt` / `denial` / `self_correction` | behavioral events, not prompts | — |
| `injected` | which rules, or `CLAUDE.md#<heading>` sections, a session was given (`given`) and which the holdout kept from it (`held`), with the `model` and a hash of CLAUDE.md (`doctrine`). Written by inject and remind | — |

Judgment calls that recur: a design question ("was it better to…?",
"should we have chosen em?") is neutral — challenge requires pushing back,
not thinking aloud. A fresh task containing "fix" is neutral — work, not
dissatisfaction. "Why isn't X working?" is a fix_request wearing a
why-question. A verbatim resend after an error is neutral.

## Commands

- **`replay [--projects DIR] [--project SLUG] [--ledger FILE] [--llm]`** —
  rebuilds every session whose transcript is in `~/.claude/projects`, and
  keeps the records of sessions whose transcript Claude Code deleted.
  Idempotent: same history, same ledger, byte for byte. `--llm` adds the
  oracle layers. Run `replay --llm` once a month: the live hook labels with
  regex only, which finds fewer corrections than the oracle, so months
  labelled two ways cannot be compared. Set `cleanupPeriodDays` in
  `settings.json` (365, for example) so the transcripts are still there.
- **`stats [--ledger FILE] [--llm]`** — first, for each month, the share of
  lessons that repeat a lesson from the 60 days before: limbic works when it
  falls. The window is fixed, because an open one grows with history alone.
  Without `--llm` a repeat must share words with the earlier lesson, so a
  paraphrase is missed and the rate runs low. With `--llm` the pairs over the
  lexical or embedding floor go to the oracle, as `dream` does it, cached. Then
  correction rates against your own baseline,
  per-session sparklines, behavioral counts, top cues, and for each month the
  share of accepts with no correction since the accept before. That share is
  the number that shows whether the agent improves overall. It is coarse: a
  commit request counts as an accept. Reads both ledgers unless `--ledger`
  names one.
- **`dream [--ledger FILE] [--llm] [--min N] [--claude-md FILE]`** — cluster
  corrective and missed-step events into proposed rules under
  `~/.limbic/rules/`, and propose each directive as its own rule. At `--min 2`
  a pair is admitted only when embedding and oracle both confirm it. Proposes
  at most 10 per run. Reads both ledgers unless `--ledger` names one: a
  session in both is replay's. With `--llm` each rule is phrased with your
  CLAUDE.md (default `~/.claude/CLAUDE.md`) in the prompt, in its words. A
  rule the file already states is filed as `covered`: it is not proposed,
  and it does not come back.
- **`rules [--all]`** / **`accept <file>`** / **`reject <file>`** — the
  propose gate. A rejected cluster never re-proposes. `accept` writes the
  date into the rule as `accepted:`.
- **`efficacy [--ledger FILE] [--llm]`** — for each accepted rule, the
  lessons like its evidence per 1000 prompts, before the `accepted:` date and
  after. Without `--llm`, like means lexical overlap at the threshold that
  pairs two events with no oracle. With `--llm`, a paraphrase counts too: the
  same matcher as `stats --llm`. Fewer than 200 prompts after acceptance reads `too early`. A
  lower rate is evidence, not proof: you may only have stopped working where
  the mistake lives. Each rule also shows `given` (sessions that got it) and
  `missed` (of those, sessions with a lesson like its evidence), with up to
  two missed lessons to read, and the same two counts for the sessions the
  holdout kept the rule from. Each rule also gets an action, the rule's life
  cycle:

  | Action | When | Do |
  |---|---|---|
  | `graduate` or `revise` by holdout | 20 sessions or more each side of the holdout: fewer misses with the rule than without it graduates, otherwise revise. This decides before any row below | as below |
  | `keep` | fewer than 1000 prompts after acceptance | nothing yet |
  | `graduate` | the rate after is lower than before | paste the rule into your CLAUDE.md, then `limbic graduate <file>` |
  | `revise` | the rate after is the same or higher, or 3 sessions that had the rule made the mistake anyway | edit the statement, or reject the rule |
  | `check` | fewer than 5 lessons before acceptance matched the evidence, so the rate after cannot be read against it | read the rule; keep it or reject it |
- **`graduate <file> [--claude-md FILE]`** — sets an accepted rule to
  `graduated`, and `inject` stops sending it. It refuses until a line in your
  CLAUDE.md states the rule (lexical overlap, as above): limbic never edits
  the file, and a rule must not leave the sessions without a home. `curate`
  names the rules your CLAUDE.md already covers; graduate those too.
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
- **`install [--predict] [--remind]`** — prints the hooks block for
  `~/.claude/settings.json`. Never edits it; to uninstall, delete the block.
  `--remind` adds the remind hook for the "Commits" heading before
  `git commit`; copy the entry for other headings and commands.

## Files on disk

Everything under `~/.limbic/`, all readable with `cat`, all safe to delete
(replay rebuilds the ledger; caches refill; rules and corpus are yours —
back those up).

| Path | What | Written by |
|---|---|---|
| `ledger.jsonl` | one record per prompt/event | `replay` (full rebuild) |
| `live-ledger.jsonl` | same shape, appended live. The only copy of a session after Claude Code deletes its transcript (`cleanupPeriodDays`, 30 by default) | classify hook |
| `live-state.json` | per-session chain counters, bounded at 50 | classify hook |
| `remind-state.json` | which sections each session was reminded of, bounded at 50 sessions | remind hook |
| `prediction.json` | the standing next-message prediction, consumed on scoring | predict hook |
| `rules/*.md` | one rule per file, status in frontmatter | `dream`, `accept`, `reject`, you |
| `corpus/labels.jsonl` | calibration corpus, `human` field is yours | `calibrate --sample`, you |
| `cache/oracle.jsonl` | every oracle verdict, keyed by instruction version | oracle |
| `cache/embeddings.jsonl` | every embedded text, keyed by model | embedder |

Ledger record fields: `ts`, `project` (the Claude Code history directory name
of the cwd — `/Users/me/shop.rs` is `-Users-me-shop-rs` — in both ledgers), `sessionId`, `label`, `cue`, `chain`
(unbroken corrective run), `surprise` (`1 − 0.5ⁿ`), `trace` (EMA),
`gitBranch`, `text` (capped at 300 chars — the ledger is not a transcript
store, by refusal).

Rule file: frontmatter (`status: proposed|accepted|rejected|covered|graduated`, `date`,
`accepted` once accepted, `size`, `labels`, `projects`, `project` when the
evidence comes from one project, `signature`) then the statement and its
evidence lines. Edit the statement freely — the file is the rule. A rule you
write by hand needs only `status`, `size` and `signature`. Remove `project:`
to give a rule to every session.

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

`install` prints; you paste. Four hooks, all exit 0 always — a memory tool
that blocks a prompt is worse than no memory tool:

- **classify** (`UserPromptSubmit`): regex-only hot path, appends to the live
  ledger, keeps per-session chains, scores and consumes any standing
  prediction. The oracle never runs here.
- **inject** (`SessionStart`): prints accepted rules — and only accepted —
  into session context. The propose gate is the security boundary. A rule
  with `project:` goes only to a session whose cwd is that project. A session
  that gives no cwd gets the global rules alone. At most 12 rules, the most
  evidence first: more memory made agents worse in ReasoningBank, and models
  follow early instructions better under load (IFScale). The hook says how
  many it held back, and records what it gave as an `injected` record.
  **Holdout:** each rule skips one session in five, picked from a hash of the
  session and the rule, so a resumed session decides the same way. Misses
  with the rule against misses without it is the only measure that the
  model, the doctrine and the work cannot bend.
- **remind** (`PreToolUse`, opt-in via `--remind`): repeats one CLAUDE.md
  section beside the tool call it governs — `remind.js Commits` with the hook
  `if` `Bash(git commit *)`. Once per section per session. The section is read
  from `~/.claude/CLAUDE.md` each time, so the text stays in one place. A
  heading the file lacks prints nothing and says so in the debug log.
- **predict** (`Stop`, opt-in via `--predict`): one Haiku call per turn,
  predicts your next message from the turn's tail; the next prompt scores it
  hit or miss.

## When a piece is missing

| Missing | Behavior |
|---|---|
| `--llm` not passed | deterministic layers only; no calls, no embeddings |
| `claude` binary absent or timing out | oracle answers null; deterministic labels stand; rules get template statements |
| CLAUDE.md absent for `dream --llm` | rules are phrased without it, and the run says so; nothing is filed as covered |
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
