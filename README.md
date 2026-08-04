# 🧠 limbic

An agent's memory gate: it learns what you correct, so you stop correcting it.

You told your agent last Tuesday that the overflow fix goes in the parent, not the child.
It did it in the child again today, cheerfully, and reported success. The correction you
typed — the third time now — evaporated the moment the session closed. Every coding agent
ships with this amnesia; limbic exists to close that loop.

Named for the limbic system, because that is literally the job description: the amygdala
scores surprise, the hippocampus forms episodes and consolidates them during sleep. The
architecture follows Jeff Hawkins' memory-prediction framework from *On Intelligence* —
a book I have loved since 2009 — by way of a simple inversion: the agent's sensory stream
is *you*. Every delivery is an implicit prediction ("this is done, done well"). Your next
message either confirms it or violates it, and the violations are the only part worth
remembering.

## Status: v0, a measurement harness — the thesis is deliberately unproven

This version makes no memories and injects nothing. It replays your existing Claude Code
session history and measures whether the signal limbic bets on actually exists: how often
you correct, how corrections chain, what your baseline looks like. If the numbers come
back noise, the project stops here and this README will say so. The bet, priced before
believing it:

- **Classifier precision** — a prompt mislabeled "correction" would later become a
  poisoned rule injected into every session. v0's classifier is regex-only, precision
  over recall, and every label carries the cue that fired, so you can audit it.
- **Signal density** — rules need repeated corrections to cluster. If you correct too
  rarely, or too uniformly, there is nothing to deduce.

## Use

```sh
npx limbic replay   # rebuild the ledger from ~/.claude/projects history
npx limbic stats    # correction rates, surprise baseline, per-session sparklines
```

Everything runs locally. Nothing leaves this machine; the ledger (`~/.limbic/`) stores
labels, scores and a bounded 300-character excerpt per prompt — it is not a transcript
archive, by refusal (see CONTRIBUTING.md).

## How scoring works

Corrections chain: `surprise = 1 − 0.5ⁿ` for the *n*-th consecutive correction — the
second correction on the same work is not twice the signal, it is "the first fix did not
take," which is worse news. An accept closes the chain; silence does not (moving on
without praise is not evidence the fix landed). Session scores are read against your own
rolling baseline, never raw — a user who corrects everything must not light the meter
every session. The shape is stolen honestly: chained-and-decaying surprise from
[Titans](https://arxiv.org/abs/2501.00663), baseline normalization from
[NuPIC's anomaly likelihood](https://github.com/numenta/nupic-legacy).

## Where this goes

[ROADMAP.md](ROADMAP.md), gated: each stage ships only if the previous one's numbers
clear their bar. The short version — measure (v0), deduce rules and propose them (v0.2),
live hooks on Claude Code (v0.3), preempt predicted follow-ups (v0.4), compile stable
rules into lint/tests that run without you (v1). The endgame is an automated reviewer
built from everything you ever corrected — the QA floor that autonomous project work
stands on.

## Prior art, and when to use it instead

| Tool | What it does | Use it when |
|---|---|---|
| [grudge](https://github.com/eddieparc/grudge) | Lesson files you write by hand, retrieved by area | You want full manual control and auditability of every lesson |
| [claude-subconscious](https://github.com/letta-ai/claude-subconscious) | Background Letta agent whispering context into sessions | You want rich memory blocks and accept a server + API key |
| [claude-mem](https://github.com/thedotmack/claude-mem) | Compresses whole sessions into searchable memory | You want recall of everything, not deduction from corrections |
| [Reflexion](https://arxiv.org/abs/2303.11366) | In-episode verbal reflection on task failures | You are building a research agent loop, not using a CLI |

limbic's corner: automatic, zero-infra, correction-driven. It stores less than all of
them on purpose — the bet is that what you *corrected* is worth more than what you *did*.

## What it does not do

No LLM calls in v0, so no semantic classification — sarcasm, implicit frustration and
non-English corrections pass unlabeled. No memory injection yet. No Codex/opencode
adapters yet (the core is agent-agnostic; adapters arrive with v0.3). Windows is
untested — path handling uses node's path module throughout, but no CI runs there yet.

## License

[MIT](LICENSE)
