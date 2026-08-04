# Correction detection — research report

2026-08-04. Everything downstream of the classifier starves when it starves: clusters
need corrective events, rules need clusters, retrodiction needs rules, and the day-one
report traced every weak number back to the same root — not enough true corrections
detected, and not enough trust in the ones that were. This report is the research pass
before hardening detection: what the field calls the problem, which published numbers
transfer, what signal this machine's own history already carries unread, and the
detection architecture the evidence supports.

"Bulletproof" here is a measured claim, not a mood: **precision first** (a mislabeled
correction becomes a poisoned rule injected into every future session), **recall
second** (a missed correction only delays a rule until the mistake repeats), **every
label auditable** (the cue, marker or verdict that fired rides with it), and
**calibration repeatable** (versioned instructions, chance-corrected agreement, not
raw percent).

## Where limbic stands

| Layer | Precision | Recall | Source of number |
|---|---|---|---|
| Regex classifier v2 | 86% | ~36% | hand audit of 1201 real prompts (v0 gate) |
| Haiku oracle, turn-context | ~75–80% | unmeasured | informal audit during v0.2.1; never scored against the corpus |
| Behavioral signals | — | 0% | not read at all |

Corrective rate on real history after audit hardening: 12.6% of prompts.

## What the field calls this

Three research communities own pieces of this problem under three names. The
vocabulary matters twice: it is how prior art is found, and how labels should be
designed.

| Name | Field | What it covers |
|---|---|---|
| Other-initiated repair (OIR) | conversation analysis → computational | recipient signals trouble with what was just said; the speaker fixes it — the user correcting the agent is OIR verbatim |
| Naturally occurring / implicit user feedback | LLM chat-log mining | corrections, rephrases, complaints and praise users volunteer mid-conversation |
| Developer pushback, misalignment episodes | coding-agent studies | corrections, failure reports and interruptions in real agent sessions |

## The numbers that transfer

| Finding | Number | Source | Meaning for limbic |
|---|---|---|---|
| Users push back after a large share of coding-agent turns | 39% of turns | [SWE-chat](https://arxiv.org/html/2604.20779v1) | limbic's 12.6% corrective is not the ceiling; definitions differ (steering counts as pushback there), but the headroom is real |
| Hard interruptions | 3.3–6.0% of turns | [SWE-chat](https://arxiv.org/html/2604.20779v1) | this machine: 44 ledgered against 1275 prompts = 3.5% — inside the published range, and limbic read none of it before i0 |
| Chats containing explicit feedback | ~30% | [Naturally Occurring Feedback](https://arxiv.org/html/2407.10944) | the signal is common, not rare |
| Largest feedback category: repeat/rephrase | 37 of 101 instances | [Naturally Occurring Feedback](https://arxiv.org/html/2407.10944) | a user re-asking the same thing differently is the single most common correction shape — and carries no corrective words. Limbic is blind to it |
| One-pass LLM extraction is weak | category P 0.28 / R 0.38 (Mixtral) | [Naturally Occurring Feedback](https://arxiv.org/html/2407.10944) | a single LLM pass is *worse* than limbic's regex. Naive "let the model label it" is not bulletproof |
| Two-stage extract → validate | P 0.93; first pass kept only 53.9% | [How Coding Agents Fail Their Users](https://arxiv.org/html/2605.29442v1) | nearly half of first-pass LLM detections were false positives, killed by a second validation pass. Validation is the price of precision |
| Raw judge agreement inflates | κ deflation 33.8–41.3pp; "85% agreement" ≈ κ 0.48; position bias up to 0.192; test-retest >0.95 can coexist with severe bias | [Reliability without Validity](https://arxiv.org/html/2606.19544v1) | calibrate with Cohen's κ, shuffled item order, and repeat runs — percent agreement alone flatters |
| Text-only repair detection ceiling | F1 78.9 text-only vs 94.6 multimodal | ["Mm, Wat?"](https://arxiv.org/html/2510.24628) | a second modality closes the hard cases (short, minimally marked corrections). Limbic's second modality is not audio — it is behavioral events |
| Resolutions require explicit user correction | 91.49% of visible resolutions | [How Coding Agents Fail Their Users](https://arxiv.org/html/2605.29442v1) | corrections are where the doctrine lives — the thesis, independently measured |
| Top misalignment form: ignoring stated rules | 38.33% of episodes | [How Coding Agents Fail Their Users](https://arxiv.org/html/2605.29442v1) | the most-corrected class is "agent ignored an explicit rule." A ceiling warning for injection alone — and the argument for mechanization (v1) and the doctrine curator (i5) |
| Agent code surviving into commits | 44.3%; 30.9% deleted unmodified | [SWE-chat](https://arxiv.org/html/2604.20779v1) | deletion-without-modification is a correction nobody typed. Silent workarounds are the named blind spot of prompt-text detection |

## Signal inventory

What a Claude Code transcript already carries versus what limbic reads today.
Prevalence measured on this machine's real history (842 session files), 2026-08-04:

| Signal | Where it lives | limbic today | Character | Local prevalence |
|---|---|---|---|---|
| Corrective text cues | prompt text | regex v2 | high P, low R, fully auditable | 154 events (hardened) |
| Previous-assistant context | transcript | oracle only | needed for soft critique ("the toggle should not shift") | — |
| Repeat/rephrase | consecutive user prompts | **not read** | deterministic near-duplicate check; the largest published feedback category | 2 at threshold 0.5 (built with i0) |
| Mid-turn interruption (Esc) | `[Request interrupted by user]` markers | **not read** | deterministic; strong dissatisfaction proxy, not certain (redirects exist) | 44 ledgered (built with i0) |
| Tool permission denial | `tool_result` with `is_error` and the denial message | **not read** | deterministic; user refused the agent's intended action | 13 parsed and ledgered |
| Plan rejection | arrives as the same denial message | **not read** | not separable from tool denials by message text — folded into them | — |
| Agent self-confession | assistant text ("my mistake", "I was wrong") | **not read** | model output — own behavioral label, never a user correction, feeds no rule until proven | 8 ledgered (built with i0) |
| Mid-turn steering message | queued-message markers | **not read** | 0 parsed occurrences on this history; marker shape unconfirmed — dropped from i0 | 0 |
| Accept/praise | prompt text | regex | chain-closing signal | — |
| Code retention after agent edits | git history, not transcript | **out of scope** | the silent-workaround detector; needs git reading, not transcript reading | named debt, not planned here |
| Prosody | — | impossible | the multimodal F1 gain is unreachable; behavioral events substitute | — |

An interruption is not always a correction — a user may interrupt to redirect, not to
reject. The behavioral layer therefore feeds events into the ledger with their own
labels and lets scoring weight them, rather than masquerading as text corrections.

## The architecture the evidence supports

A cascade, cheap-and-certain before expensive-and-judged, every layer leaving an
auditable trail:

1. **Deterministic text layer** (exists): regex cues, precision-first, cue recorded.
2. **Behavioral layer** (new): interruptions, tool denials (plan rejections arrive
   as the same message) and agent self-confessions parsed from the transcript as
   first-class ledger events with their own labels. Deterministic, zero cost, zero
   model — and self-confessions, being model output, can never masquerade as user
   words or feed a rule until their precision is proven.
3. **Rephrase layer** (new): consecutive user prompts with high similarity and no
   accept between them — the repeat/rephrase category, detected deterministically.
4. **Context-LLM layer** (exists): regex-neutral prompts with context go to the
   oracle, batched, capped, cached, version-keyed.
5. **Validation layer** (new): every *positive* oracle label gets a second,
   independently-phrased refutation pass — "is this actually a correction of the
   agent's prior work? default no." Published result of this shape: precision 0.93
   with 53.9% first-pass survival. Positives only, so the cost is bounded by the
   corrective rate, not the prompt count.
6. **Abstention** (exists, keep): when unsure, neutral — in every instruction.

Calibration harness for the whole cascade, per the judge-reliability protocol:
Cohen's κ against the hand-labeled corpus (not percent agreement), item order
shuffled between runs (position bias), ≥3 repeat runs (consistency), per-label
precision/recall published in REPORT.md, instruction version in every cache key
(already the case).

## What this deliberately does not adopt

- **A fine-tuned local classifier** (SetFit-class, ~8 labels upward; small fine-tuned
  models consistently beat zero-shot large ones on classification — surfaced in
  [arXiv 2406.08660](https://arxiv.org/pdf/2406.08660), not deep-read). The labeled
  corpus (~hundreds of items, one annotator) is too small to fine-tune against
  honestly. Becomes a candidate under the dependency policy once the corpus grows
  past ~1k items with the calibration harness feeding it; the gate is beating the
  calibrated cascade on held-out κ.
- **Prosody / audio** — no audio exists in a CLI transcript.
- **Git-side retention signals** — the silent-workaround detector requires reading
  repository history, a different trust boundary than transcripts. Named debt,
  revisit after i4 live data shows what the transcript layers still miss.

## Sources

Every source above is annotated — summary, category, what limbic takes from it and
how deeply it was read — in [SOURCES.md](SOURCES.md), the project's one source
registry.
