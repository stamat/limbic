# limbic — day-one report

One day, 2026-08-04: v0 harness through v0.4 machinery, five benchmark runs, three
audits, one accepted rule. This report says what worked, what failed and why, and what
the research says to do about it — numbers first, story second.

## The numbers ladder

| Run | Corrective | Retrodiction | What changed |
|---|---|---|---|
| Regex v1 | 14 (1.2%) | — | first measurement; audit found precision 86%, recall 36% |
| Regex v2 (audited cues) | 42 (3.5%) | 0.0% | `challenge` label, wrapper stripping, question guard |
| + oracle, capped | 106 (8.8%) | 7.5% | turn-context classification, semantic pairs |
| + oracle, uncapped | 201 (16.5%) | 20.8% | **inflated** — union-find blob, imperative glue |
| + audit hardening | 154 (12.6%) | **0.0%** half-split, **0.0%** online | average-linkage, generic guard, design-question fix |

The 20.8% → 0.0% collapse is the day's most important result: every point of it was a
measurement artifact, and the pipeline now refuses to flatter itself. The cost surfaced
immediately after: hardening also dismembered the one genuinely real cluster (the
9-event pseudo-element saga), leaving 2 weak clusters at minSize 3 — but **27 at
minSize 2**. The correction landscape is wide and shallow: real mistakes repeat as
pairs, rarely as triples.

## What worked

- **The audit loop.** Every number was hand-audited before being believed, and every
  audit found a real defect: IDE wrappers reaching the classifier, diagnostic questions
  labeled corrective, a chain metric measuring session heat instead of escalation,
  union-find snowballing, instruction-versioning missing from the cache key. Five bugs
  no test anticipated, all found by reading real output.
- **Doctrine convergence.** The dream pass independently re-derived two rules the
  author already keeps in CLAUDE.md ("read docs end to end", "ask whether it should
  exist"). The thesis mechanism — corrections carry doctrine — is demonstrated even
  while the benchmark number is not.
- **The oracle boundary.** One module owns every LLM touch: batched, capped, cached
  (26,201 cache hits on the online run — the cache is what made five benchmark runs
  affordable), version-keyed, recursion-guarded, degrades to deterministic. Zero
  incidents.
- **The propose gate as measured filter.** Human accepted 1 of 7 rules — an acceptance
  rate that is itself the strongest argument against auto-activation.
- **Plain files everywhere.** Every artifact — ledger, rules, cache — is readable with
  `cat` and diffable; every audit in this report was a grep.

## What failed, with root causes

- **Lexical similarity is the floor everything cracked on.** Jaccard over stopworded
  tokens cannot see that "menu previews suffer the same issues navbar did" repeats the
  navbar corrections. The oracle patched pairs, but pair-judgment plus graph merging
  is brittle: loose → blobs, strict → dust. Root cause: no continuous similarity
  substrate under the discrete judgments.
- **Half-split retrodiction was structurally blind** to burst-local repetition — and
  then online retrodiction scored 0.0% anyway, killing the burst hypothesis in its
  strong form: under the hardened pipeline there is no cluster formed early that
  covers a later correction. At minSize 2 the signal exists; the pipeline cannot yet
  distinguish it from noise.
- **LLM label drift.** Haiku labeled design questions ("was it better to…") as
  challenges until instructed otherwise; per-item precision ~75-80%, below the
  regex's 86%. Instruction tuning helped; calibration against the hand-labeled corpus
  was never run systematically — named debt.
- **Rule supply starves everything downstream.** v1 mechanization was skipped, not
  attempted: with one accepted rule, building `mechanize` is scaffolding. The
  bottleneck is deduction quality, and it is upstream of every roadmap stage.
- **Prediction (v0.4) is built but unproven** — the hooks exist, opt-in, but no live
  session data has flowed through them. Hit-rate is unmeasured; nothing in this
  report claims it works.

## What the research says ([sources below](#sources))

1. **Embeddings are the missing substrate.** Short-text clustering literature is
   unambiguous: low word co-occurrence defeats token methods; LLM embeddings then
   conventional clustering is the recommended shape, with LLM-as-judge kept for
   validation, not primary grouping. Fits limbic as: optional local embeddings via
   ollama's HTTP API (localhost fetch, no package dependency, degrades honestly to
   the oracle when absent), cosine candidates → oracle confirms → average-linkage
   stays as the guard. Vector storage is committed: vectors persist as a flat
   `~/.limbic/cache/embeddings.jsonl` beside the oracle cache, and the former
   "not a vector database" refusal is dropped from CONTRIBUTING — the dependency
   policy (earned, ask-first) is what governs how the store is built, not whether it
   exists.
2. **Injection discipline decides whether memory helps at all.** Letta's RecoveryBench
   shows agents reasoning measurably worse from polluted context; indiscriminate
   memory injection dilutes attention. Limbic's design already agrees (accepted rules
   only, RPMS rules-first) — the improvement is a hard injection budget: top-k rules
   by project relevance, never the whole file, and a token cap stated in the hook.
3. **Tiering matches what exists.** Letta's core/recall/archival maps onto limbic as
   rules (always) / ledger (queried) / transcripts (never stored — refused). No new
   machinery needed; the refusal was correct.
4. **Procedural memory as markdown is the ecosystem's convergent answer** — CLAUDE.md
   files are exactly this. Limbic's endgame sharpens: not a parallel memory store but
   a *pipeline that feeds the CLAUDE.md the user already maintains* — deduced rules
   graduating into the file that already wins.

## Improvement roadmap (supersedes ROADMAP.md forward sections)

| Stage | What | Gate |
|---|---|---|
| i1 | Embedding substrate: ollama `nomic-embed-text` via localhost HTTP, cosine-candidate pairs, oracle confirms, linkage guards | s9 saga re-forms as one cluster; zero blobs on hand audit |
| i2 | Classifier calibration: score oracle labels against the hand-labeled corpus, tune instruction, publish precision/recall in this report | oracle precision ≥ regex's 86% on held-out labels |
| i3 | minSize 2 rules with double confirmation (embedding + oracle agree) | retrodict-online > 0 with zero wrong-rule audits |
| i4 | Live pilot: hooks installed (user's hand, printed config), 2 weeks of live ledger, prediction hit-rate measured | correction rate on rule-covered classes drops; prediction hit-rate reported whatever it is |
| i5 | CLAUDE.md graduation: accepted rules propose themselves as lines in the user's own doctrine file, diff shown, human applies | a deduced rule lands in CLAUDE.md by user's hand |

## Roadmap stage status

| Original stage | Status |
|---|---|
| v0 harness | Done, gate passed after audit |
| v0.2 dream | Done; rule quality is the open front |
| v0.2 gate (retrodiction ≥10%) | **Not passed** — honest 0.0%; i1–i3 exist to change that |
| v0.3 live hooks | Built (`hooks/classify.js`, `hooks/inject.js`, `limbic install` prints config — never edits settings). Not installed, gate-pending |
| v0.4 prediction | Built opt-in (`hooks/predict.js`), zero live data, unproven |
| v1 mechanization | Skipped: one accepted rule is no supply; revisit after i3 |

## Sources

- [Human-interpretable clustering of short text using LLMs](https://royalsocietypublishing.org/doi/10.1098/rsos.241692) — Royal Society Open Science
- [Text clustering with LLM embeddings](https://dev.to/aimodels-fyi/text-clustering-with-llm-embeddings-3nma)
- [BERTopic with local LLM labeling via Ollama](https://medium.com/data-science-collective/bertopic-with-local-llm-labeling-llama-cpp-ollama-a-practical-guide-45314e80d723)
- [Letta: stateful agents, three-tier memory, RecoveryBench](https://www.zenml.io/llmops-database/building-stateful-ai-agents-with-in-context-learning-and-memory-management)
- [Context management vs memory management](https://atlan.com/know/ai-agent/ai-agent-context/context-management-vs-memory-management-ai-agents/)
- [State of AI agent memory 2026 (mem0)](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- [Titans: surprise-gated memory](https://arxiv.org/abs/2501.00663) · [Reflexion](https://arxiv.org/abs/2303.11366) · [Evo-Memory](https://arxiv.org/pdf/2511.20857) · [RPMS](https://arxiv.org/abs/2603.17831)
