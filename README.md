# 🧠 limbic

limbic learns rules from the corrections you give a coding agent, so that you do not
have to give the same correction again.

A coding agent does not remember a correction after the session ends. If you correct
the same mistake in three sessions, you type the correction three times. limbic reads
your prompts, finds the corrections that repeat, and proposes a rule for each. You
approve each rule. limbic then gives the approved rules to new sessions, and measures
whether each rule reduces its mistake.

The name comes from the limbic system, the part of the brain that reacts to surprise
and turns experience into memory. The design follows Jeff Hawkins' memory-prediction
framework (*On Intelligence*): each delivery from the agent is a prediction that the work
is done well, and your next message confirms it or corrects it. limbic keeps only the
corrections.

## Status: rules work offline, the live test runs

| Question | Evidence | Answer |
|---|---|---|
| Is the problem real? | In the author's history, about half of the corrections repeat a correction from the 60 days before (August–September 2026, matched by meaning) | Yes |
| Does a learned rule stop its mistake? | `limbic eval` on 31 past tasks: the mistake came back in **11 of 60** answers with the rules and **34 of 59** without them (p < 0.001) | Yes, offline. The agent answered in words, with no tools and no code |
| Does it change live sessions? | The holdout started on 2026-10-18. At one person's session volume, it needs months | Not known yet |
| Are the labels right? | κ 0.85 against a hand corpus for the original labels. `directive`, `missed_step` and commit-as-accept are checked by eye only | Mostly |
| How much of the problem can it catch? | Online retrodiction: 4.3% of corrections were covered by a rule deducible from the corrections before them | Little, yet. Clustering is strict on purpose |

One rule tested worse with the rule than without it (3 of 4 against 2 of 4). A sample
of four is too small to decide, so the rule waits for a second run. [REPORT.md](REPORT.md)
has the numbers from the first version.

## How it works

| Step | What happens | Where |
|---|---|---|
| **Record** | A hook reads each prompt you type and labels it: correction, fix request, challenge, missed step, directive, accept or neutral. It strips IDE blocks, pasted text and background-task notices first | `hooks/classify.js` → `~/.limbic/live-ledger.jsonl` |
| **Relabel** | Once a month, `replay --llm` reads the transcripts again. Haiku labels the prompts that the regex missed, with the turn before each one as context | `~/.limbic/ledger.jsonl` |
| **Find** | `dream` clusters lessons that repeat into proposed rules. Each directive ("remember in ~/.claude that …") is a proposal of its own. With `--llm`, Haiku words each rule in the vocabulary of your CLAUDE.md, and files a rule that CLAUDE.md already states as `covered` | `~/.limbic/rules/*.md` |
| **Approve** | You read each proposal with its evidence, and accept or reject it. Nothing reaches a session without your accept | `limbic rules`, `accept`, `reject` |
| **Apply** | At session start, a hook gives each session at most 12 accepted rules, the most evidence first. A rule learned in one project goes only to that project. A second hook can repeat one CLAUDE.md section beside the tool call it governs | `hooks/inject.js`, `hooks/remind.js` |
| **Measure** | Each rule is held out of one session in five. limbic compares the misses with and without each rule, the repeat rate per month, and an offline test of the rule | `efficacy`, `stats`, `eval`, `commits` |
| **Graduate** | A rule that worked moves into your CLAUDE.md by your hand, and limbic stops injecting it. The injected list stays short | `limbic graduate` |

Everything runs locally. The ledger keeps labels, scores and at most 300 characters of
each prompt. It does not store full transcripts ([CONTRIBUTING.md](CONTRIBUTING.md)
says why).

## Setup

limbic needs Node 20 or later and has no dependencies. It is not on npm. **Do not run
`npx limbic`:** that name on npm belongs to a different project, and npx would run its
code.

1. Clone this repository, and make the command available:

   ```sh
   git clone https://github.com/stamat/limbic.git ~/Sites/localhost/limbic
   cd ~/Sites/localhost/limbic && npm link    # or: alias limbic="node $PWD/bin/limbic.js"
   ```

2. Keep your transcripts for a year. Claude Code deletes them after 30 days, and `replay`
   can relabel only what is on disk. In `~/.claude/settings.json`:

   ```json
   "cleanupPeriodDays": 365
   ```

3. Read your history into the ledger, and look at it:

   ```sh
   limbic replay --llm
   limbic stats
   ```

4. Install the hooks. limbic prints the block and never edits your settings. Paste it
   yourself:

   ```sh
   limbic install             # classify + inject
   limbic install --remind    # also repeat the "Commits" section before a commit
   ```

5. Find and approve rules:

   ```sh
   limbic dream --llm
   limbic rules               # read each proposal and its evidence
   limbic accept <file>       # or: limbic reject <file>
   ```

6. Optional: for matching by meaning, run [ollama](https://ollama.com) with
   `nomic-embed-text`. Without it, `--llm` uses the oracle alone and says so.

`--llm` spends your Claude plan budget: Haiku calls, capped for each run (`--max-calls`,
default 60) and cached forever. Each command reports what it spent.

## How to measure success

limbic works if you correct the same mistake less often. The repeat rate measures that.
The other measures check it from different sides:

| Measure | Command | What it shows | When it can answer |
|---|---|---|---|
| **Repeat rate** | `limbic stats --llm` | For each month: of the corrections, how many repeat one from the 60 days before. It must fall | After a few months of rules |
| **Holdout** | `limbic efficacy --llm` | Misses in sessions with a rule against sessions without it, for each rule and for all rules pooled. Fisher's exact test decides. Without a significant difference, it gives no verdict | Months: a rule's mistake comes up in about 1% of sessions |
| **Offline test** | `limbic eval` | Each rule's past tasks, answered with and without the rule, and judged | Days. It tests whether the rule is understood, not live behaviour |
| **Output check** | `limbic commits` | Commit messages against the Commits section, with and without the reminder | Weeks. Only for rules a script can check |
| **Clean accepts** | `limbic stats` | Accepts with no correction since the accept before | A trend over months. Coarse: a commit request counts as an accept |
| **Cost** | `limbic stats`, hook output | Tokens injected per session (about 370 for 8 rules), plan calls per run | Always |

Read them in this order, and run them on this schedule:

1. **Monthly:** `limbic replay --llm`, then `limbic stats --llm` and
   `limbic efficacy --llm`. The live hook labels with regex only, which finds about a
   third of the corrections that the oracle finds. Without a monthly replay, two months
   are not comparable.
2. **After a new accept:** `limbic eval --rule <file>`. A rule that does not help
   offline will not help live.
3. **When `efficacy` says `graduate`:** paste the rule into your CLAUDE.md, then
   `limbic graduate <file>`. When it says `revise`, reword the rule or reject it.

What can make a number lie, and what guards against it:

| Problem | Guard |
|---|---|
| The model changed | Each session records its model (`SessionStart` gives it in most sessions) |
| CLAUDE.md changed at the same time | Each session records a hash of CLAUDE.md |
| The labeller changed | Monthly `replay --llm` labels every month the same way |
| A before/after comparison cannot show cause | The holdout. Only a comparison inside the same period removes changes in the model, CLAUDE.md and the work |
| Lexical matching misses a paraphrase | `--llm` on `stats` and `efficacy`. Without it every count runs low, by the same amount on both sides |
| The offline test judges what the agent says, not what it does | The live holdout. `eval` is evidence, not proof |

## Use

```sh
limbic replay      # rebuild the ledger from ~/.claude/projects history; keeps sessions whose transcripts are gone
limbic stats       # repeat rate per month, correction rates, clean accepts (--llm: match by meaning)
limbic dream       # cluster corrections and missed steps into proposed rules (--llm to phrase via claude -p)
limbic rules       # review proposals; accept/reject each by hand
limbic efficacy    # did an accepted rule work? keep, graduate, revise or check (--llm: match by meaning)
limbic eval        # the offline test: each rule's old tasks, with and without it
limbic commits     # commit messages against your Commits section, reminded or not
limbic graduate    # a rule that worked moves into your CLAUDE.md; limbic stops injecting it
limbic retrodict   # the thesis benchmark, honest either way (--online for per-event)
limbic calibrate   # score the cascade against your hand labels (--sample first)
limbic curate      # accepted rules read against your CLAUDE.md: additions, and rules it already covers
limbic install     # prints the hooks block for ~/.claude/settings.json — never edits it
```

[GUIDE.md](GUIDE.md) is the operations manual: every command, label, file and hook.
[RESEARCH.md](RESEARCH.md) and [SOURCES.md](SOURCES.md) contain the research behind each
part. [DEDUCTION.md](DEDUCTION.md) explains how each measured number was checked.

## How scoring works

Consecutive corrections form a chain: `surprise = 1 − 0.5ⁿ` for the *n*-th
correction in a row. A second correction on the same work means the first fix did not
work, so it scores higher, but not twice as high. Any prompt that is not a correction
ends the chain. Session scores are compared with your own rolling baseline, so a user
who corrects often does not get a high score in every session. The formulas come from
[Titans](https://arxiv.org/abs/2501.00663) (chained, decaying surprise) and from
[NuPIC's anomaly likelihood](https://github.com/numenta/nupic-legacy) (the baseline).

## Where this goes

[ROADMAP.md](ROADMAP.md), gated: each stage ships only if the previous one's numbers
meet their target. In short: measure (v0), find and propose rules (v0.2), live hooks
for Claude Code (v0.3), predict follow-up requests (v0.4), and turn stable rules into
lint checks and tests (v1). The long-term goal is an automated reviewer built from all
your past corrections.

## Prior art, and when to use it instead

| Tool | What it does | Use it when |
|---|---|---|
| [Claude Code auto memory](https://code.claude.com/docs/en/memory) | Claude writes notes from your corrections and preferences, loaded each session | You want memory with no setup. It has no evidence threshold, no approval step, no measurement and no retirement |
| [grudge](https://github.com/eddieparc/grudge) | Lesson files you write by hand, retrieved by area | You want full manual control of every lesson |
| [claude-subconscious](https://github.com/letta-ai/claude-subconscious) | A background Letta agent adds context to sessions | You want rich memory blocks and accept a server and an API key |
| [claude-mem](https://github.com/thedotmack/claude-mem) | Compresses whole sessions into searchable memory | You want recall of everything, not rules deduced from corrections |
| [Reflexion](https://arxiv.org/abs/2303.11366) | Verbal reflection on task failures inside one episode | You build a research agent loop, not use a CLI |

What limbic does differently: it makes rules only from your corrections, you approve
each rule, it measures each rule, and it retires a rule when your CLAUDE.md contains it.
It stores less than the other tools on purpose.

## What it does not do

- **Nothing is automatic.** Rules wait in `~/.limbic/rules/` until you accept them, and
  no rule reaches a session until you install the hooks.
- **No proof of live effect yet.** The offline test answers in words; the live holdout
  needs months at one person's session volume.
- **Little semantics without `--llm`.** Sarcasm, implicit frustration and non-English
  corrections pass unlabeled, and only corrections with shared words cluster.
- **The commit checks are fixed.** `limbic commits` checks the author's commit style: one
  line, no Conventional Commits prefix, lowercase. A different style needs different
  checks in `src/commits.js`.
- **Claude Code only.** The core does not depend on the agent, but there are no Codex or
  opencode adapters yet. Windows is untested: paths go through node's path module, but
  no CI runs there.

## License

[MIT](LICENSE)
