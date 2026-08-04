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

## Status: measured — detection κ 0.85, online retrodiction 4.3% at double-confirmed pairs, hooks await your paste

Nothing is injected into any session unless you install the hooks yourself. `replay`
measures the correction signal in your existing Claude Code history; `dream` clusters
it into proposed rules you accept or reject by hand; `retrodict` runs the thesis
benchmark. The purely lexical first pass scored **0.0% preventable**; the Haiku
oracle briefly showed 20.8% — which died under audit, artifact by artifact (a
union-find mega-blob, imperative-glue clusters), back to an honest **0.0%** — and
the number that finally survived hardening is **4.3% online**, from pair-clusters
admitted only when embedding and oracle both confirm them. Detection comes first:
a cascade of regex cues, behavioral events (interruptions, tool denials, agent
self-confessions), a repeat/rephrase detector and a refutation pass over every
oracle positive, measured at **κ 0.85** against a hand corpus — [REPORT.md](REPORT.md)
carries the full numbers ladder, [GUIDE.md](GUIDE.md) the operations manual. What
keeps the project alive besides the numbers: the
dream pass deduced seven rules from real corrections, two of which independently
re-derived rules the author already maintains by hand in CLAUDE.md. The bet, priced
before believing it:

- **Classifier precision** — a prompt mislabeled "correction" would later become a
  poisoned rule injected into every session. The cascade is precision-first at every
  layer, and every label carries the cue, marker or verdict that fired, so you can
  audit it.
- **Signal density** — rules need repeated corrections to cluster. If you correct too
  rarely, or too uniformly, there is nothing to deduce.

## Use

```sh
npx limbic replay      # rebuild the ledger from ~/.claude/projects history
npx limbic stats       # correction rates, surprise baseline, per-session sparklines
npx limbic dream       # cluster corrections into proposed rules (--llm to phrase via claude -p)
npx limbic rules       # review proposals; accept/reject each by hand
npx limbic retrodict   # the thesis benchmark, honest either way (--online for per-event)
npx limbic calibrate   # score the cascade against your hand labels (--sample first)
npx limbic install     # prints the hooks block for ~/.claude/settings.json — never edits it
```

Live hooks exist and are opt-in by hand: `hooks/classify.js` ledgers every prompt
(regex only, exits fast, never blocks), `hooks/inject.js` injects *accepted rules
only* at session start, `hooks/predict.js` (add it yourself, it costs one Haiku call
per turn) predicts your next message so the following prompt scores hit or miss.
Day-one results, defects found and the improvement plan: [REPORT.md](REPORT.md).
Detection research behind the next stage: [RESEARCH.md](RESEARCH.md).

Everything runs locally. Nothing leaves this machine; the ledger (`~/.limbic/`) stores
labels, scores and a bounded 300-character excerpt per prompt — it is not a transcript
archive, by refusal (see CONTRIBUTING.md).

## How scoring works

Corrections chain: `surprise = 1 − 0.5ⁿ` for the *n*-th consecutive correction — the
second correction on the same work is not twice the signal, it is "the first fix did not
take," which is worse news. Any non-corrective prompt closes the chain — praise confirms
the fix landed, moving on simply ends the episode; escalation means an unbroken run of
corrections, and session-scale heat belongs to the EMA trace. Session scores are read against your own
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

No memory injection unless you install it — rules sit in `~/.limbic/rules/` awaiting
your verdict, and nothing reads them back into a session until you paste the hooks
block yourself (`limbic install` prints it, never edits settings). Without `--llm`
there is no semantic anything: sarcasm, implicit frustration and non-English
corrections pass unlabeled, and only token-similar corrections cluster. With `--llm`
it spends your Claude subscription's plan budget — capped per run, cached forever,
reported at the end of every command. No Codex/opencode adapters yet (the core is
agent-agnostic; adapters land at v1). Windows is untested — path handling uses
node's path module throughout, but no CI runs there yet.

## License

[MIT](LICENSE)
