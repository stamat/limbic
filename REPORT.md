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
| + i0 detection cascade | 141 (11.1%) + 65 behavioral | **0.0%** both modes | validation refuted 33% of oracle positives; max chain 12→5; behavioral events (44 interrupts, 13 denials, 8 self-confessions) and rephrase detection ledgered; half-split yields 0 rules at minSize 3 — supply starves harder, i1+i3 carry it |
| + i1 embeddings | 141 (11.1%) | **0.0%** half-split | substrate live (nomic-embed-text via ollama, flat JSONL cache): 422 pairs nominated — ~330 beyond the lexical floor — 52 confirmed, 2 clusters proposed. The s9 gate went moot: the saga's members were refuted upstream by oracle v2 + validation, and whether that refutation was right is precisely i2's calibration question |
| + i3 double-confirmed pairs | 141 (11.1%) | half-split 0.0%; **online 4.3%** (6 of 138) | the first non-zero in the project's history. minSize 2 admitted only when embedding and oracle both confirm the pair; two pair-rules proposed (keyboard focusability, preview overflow). The 6 hits await the human wrong-rule audit, and the verdicts behind them were fully cached — fresh-cache consistency is what i2's repeat protocol measures |

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
  rate that is itself the strongest argument against auto-activation. The two rules
  that re-derived existing CLAUDE.md doctrine were among the rejected: a rule already
  kept by hand has nowhere to graduate to, which is exactly the dedup case the i5
  curator exists for.
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

Detection-specific research lives in its own report: [RESEARCH.md](RESEARCH.md).

1. **Embeddings are the missing substrate.** Short-text clustering literature is
   consistent: low word co-occurrence defeats token methods; LLM embeddings then
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

Detection comes first — every downstream stage starves without it; the research pass
behind i0 is [RESEARCH.md](RESEARCH.md).

| Stage | What | Gate |
|---|---|---|
| i0 | Detection hardening: behavioral events from the transcript (interruptions, tool denials, plan rejections, mid-turn steering), repeat/rephrase detector, validation pass on positive oracle labels | cascade precision ≥ regex's 86% at ≥2× regex recall on the hand corpus |
| i1 | Embedding substrate: ollama `nomic-embed-text` via localhost HTTP, cosine-candidate pairs, oracle confirms, linkage guards | s9 saga re-forms as one cluster; zero blobs on hand audit |
| i2 | Cascade calibration: score every layer against the hand-labeled corpus — Cohen's κ, shuffled item order, ≥3 repeat runs — tune instructions, publish per-label precision/recall here | κ-corrected precision ≥ 86% on held-out labels, biases measured |
| i3 | minSize 2 rules with double confirmation (embedding + oracle agree) | retrodict-online > 0 with zero wrong-rule audits |
| i4 | Live pilot: hooks installed (user's hand, printed config), 2 weeks of live ledger, prediction hit-rate measured. Deliberately weaker than ROADMAP's original v0.3 gate (4+ weeks A/B, ≥30% drop) — a first single-arm pilot; the A/B bar returns if it shows signal | correction rate on rule-covered classes drops; prediction hit-rate reported whatever it is |
| i5 | Doctrine curation: accepted rules propose themselves as lines in the user's CLAUDE.md/AGENTS.md, and the curator reads the file back — proposing additions, flagging lines the ledger contradicts, deduplicating rules the user already keeps — diff shown, human applies | a deduced rule lands in CLAUDE.md by user's hand |

## Roadmap stage status

| Original stage | Status |
|---|---|
| v0 harness | Done, gate passed after audit |
| v0.2 dream | Done; rule quality is the open front |
| v0.2 gate (retrodiction ≥10%) | **Not passed** — honest 0.0%; i1–i3 exist to change that |
| v0.3 live hooks | Built (`hooks/classify.js`, `hooks/inject.js`, `limbic install` prints config — never edits settings). Not installed, gate-pending |
| v0.4 prediction | Built opt-in (`hooks/predict.js`), zero live data, unproven |
| v1 mechanization | Skipped: one accepted rule is no supply; revisit after i3 |
| i0 detection hardening | Built and benchmarked (2026-08-04): behavioral layer, rephrase layer, validation layer live; tests green. The gate's κ half waits on i2 — precision against the hand corpus is measured there, not claimed here |
| i1 embedding substrate | Built (2026-08-04): `src/embed.js`, nominate-only, flat JSONL cache, one-failure degrade to oracle-only. Gate unfalsifiable as written — s9's membership dissolved under stricter detection; re-anchored to i2 calibration and i3 minSize-2. Found while gating: the v0 hand-audit corpus was never persisted to disk — i2 rebuilds it as a labeled file before it can score anything |
| i2 cascade calibration | **Measured (2026-08-04)**: deterministic cascade **κ 0.85, agreement 91%** on the 106-item corpus — per-label precision 0.87–1.00 corrective, recall: correction 1.00, fix_request 0.73, challenge 0.68 (soft critique is the measured ceiling). Oracle cascade κ 0.80–0.81 across 3 fresh-cache shuffled runs, inter-run κ 0.91–0.96: **consistent but adds no accuracy** — challenge-recall tuning or removal from replay is n1's call. Labels are Opus-reference annotations, independent of the Haiku oracle, provenance marked per item; overwrite any line and κ republishes |
| i3 minSize-2 double confirmation | Built and benchmarked (2026-08-04): online retrodiction **4.3%** (6/138) — first non-zero. Gate's second half, zero wrong-rule audits, awaits the user's audit of the 6 hits |
| i4 live pilot | Prepared: hooks tested (and resurrected — all three were silently dead on stdin), `limbic install` prints the block, `--predict` adds the opt-in Stop hook. The pilot clock starts when the user pastes the block |
| i5 doctrine curator | Built (2026-08-04): `limbic curate` — accepted rules read against the user's CLAUDE.md, coverage judged by embedding+oracle, additions and retire-candidates printed, file never written. First live run proposed the one accepted rule; the gate (a rule landing by the user's hand) is the user's move |

## Second iteration (2026-08-04, afternoon) — what worked, and does it work

What worked, with the why attached:

- **Research before code, again.** The detection sprint ([RESEARCH.md](RESEARCH.md))
  paid for itself twice: the validation pass came straight from a published
  pipeline's 53.9% first-pass survival rate, and the behavioral layer's 3.5%
  interrupt rate landed inside SWE-chat's published 3.3–6.0% — the design was
  externally corroborated before it ran.
- **Tests as resurrection.** The first hook test ever written found all three
  hooks dead on arrival (stdin read that node's promises API refuses, swallowed by
  the catch). An untested "built" was a fiction; the test made it true.
- **The validation pass bites.** 33% of oracle positives refuted on real history;
  max chain 12 → 5. Detection got sharper and admitted it found less.
- **Double confirmation broke the zero.** Requiring embedding AND oracle on
  pair-clusters took online retrodiction from 0.0% to 4.3% — the first non-zero —
  without readmitting the blobs that inflated 20.8%.
- **Calibration replaced belief with κ.** Deterministic cascade κ 0.85/91% on a
  106-item corpus; the oracle layer proved consistent (inter-run κ 0.91–0.96) and
  flat (κ 0.80–0.81) — an honest "adds nothing yet" no amount of architecture
  enthusiasm survives. The corpus also convicted the rephrase detector's only two
  firings as verbatim retries after infra errors; fixed same day, κ 0.82 → 0.85.
- **The curator closed the loop shape.** Accepted rule → proposed CLAUDE.md line,
  print-only. The endgame (feed the file the user already maintains) now has a
  working end.

**Does it work?** Three answers, separately honest. As a *measurement instrument*:
yes, proven — κ 0.85 detection, auditable cues end to end, benchmarks that refuse
flattery. As a *deduction engine*: mechanically yes, thinly in practice — rule
supply is real but small (1 accepted, 2 double-confirmed pairs proposed), and the
4.3% rests on cached verdicts and awaits the wrong-rule audit. As a *memory that
prevents corrections*: unproven — nothing has been injected into a live session
yet; that is n2, and it starts with a paste. The strongest evidence remains
convergence: the dream pass re-deriving doctrine the user already keeps, and the
curator recognizing it.

Forward stages and exploration areas: [ROADMAP.md](ROADMAP.md).

## Sources

Annotated and categorized — summary, relevance, and how deeply each was read — in
[SOURCES.md](SOURCES.md), the project's one source registry.
