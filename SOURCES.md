# Sources

Every external source the project leans on, in one place: what it says, and what
limbic takes from it. Inline citations in README/ROADMAP/REPORT/RESEARCH point here.

Each entry is marked by how well it was read, honestly: **[read]** fetched and
mined for the numbers quoted; **[day-one pass]** read during the day-one research
sprint, annotation reflects what REPORT.md took from it; **[surfaced]** found in
search, snippet-level only — held as a pointer, never as a claim.

## Coding-agent field studies

The closest thing to limbic's exact domain: real developers correcting real agents.

- **[How Coding Agents Fail Their Users](https://arxiv.org/html/2605.29442v1)** [read]
  20,574 sessions, 1,639 repos. Seven-form misalignment taxonomy — top form is the
  agent ignoring explicit stated rules (38.33%); 91.49% of visible resolutions
  require explicit user correction. Detection is a two-stage LLM pipeline: extract,
  then a post-validation pass that kept only 53.9% of first-pass detections, landing
  precision 0.93.
  **Why it matters:** the validation pass became `oracle.validate` verbatim — and
  the top-misalignment-form finding is both injection's ceiling warning and the
  argument for v1 mechanization and the i5 curator.
- **[SWE-chat: Coding Agent Interactions From Real Users in the Wild](https://arxiv.org/html/2604.20779v1)** [read]
  Real-user coding sessions: pushback after 39% of turns, hard interruptions
  3.3–6.0% of turns, 44.3% of agent code survives into commits, 30.9% deleted
  unmodified. Agents ask for clarification in only 1.1–2.6% of turns.
  **Why it matters:** limbic's measured 3.5% interrupt rate lands inside their
  range — independent validation of the behavioral layer. Deletion-without-
  modification is the correction nobody types: the named blind spot of
  transcript-only detection.

## Feedback mining

- **[Naturally Occurring Feedback is Common, Extractable and Useful](https://arxiv.org/html/2407.10944)** [read]
  ~30% of chats carry explicit feedback. Five-category taxonomy; repeat/rephrase is
  the largest category (37 of 101 hand-labeled instances). Their one-pass Mixtral
  extraction scored category precision 0.28 / recall 0.38 — against human agreement
  of κ 0.65.
  **Why it matters:** the rephrase detector exists because of the taxonomy's top
  category, and the weak one-pass numbers are the proof that "just ask the model"
  is not a detection strategy.
- **[User Feedback in Human-LLM Dialogues: A Lens to Understand Users But Noisy as a Learning Signal](https://arxiv.org/abs/2507.23158)** [read, abstract only]
  WildChat/LMSYS feedback harvesting: informative for understanding users, noisy as
  a training signal; feedback content helps on short tasks, mixed on complex ones.
  **Why it matters:** supports the propose gate — raw harvested corrections are too
  noisy to act on without a human filter.

## Repair and dialogue

- **["Mm, Wat?" Detecting Other-initiated Repair Requests in Dialogue](https://arxiv.org/html/2510.24628)** [read]
  Multimodal OIR detection in Dutch dialogue: F1 94.6 with text+prosody+context,
  78.9 text-only. Hardest cases: short, minimally marked repair initiations.
  **Why it matters:** names limbic's problem in conversation-analysis vocabulary,
  puts a ceiling on text-only detection, and justifies the behavioral layer as the
  CLI's substitute for prosody. Its hardest case is limbic's too — the bare "no".
- **[Exploration of Human Repair Initiation in Task-oriented Dialogue](https://aclanthology.org/2024.sigdial-1.51.pdf)** [surfaced]
  Linguistic-feature approach to repair initiation detection.
- **[An analysis of dialogue repair in virtual assistants](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2024.1356847/full)** [surfaced]
  Assistants fail to recognize user repair initiation; repair-strategy preference
  hierarchy.

## LLM-as-judge reliability

- **[Reliability without Validity: LLM-as-a-Judge Across Agreement, Consistency, and Bias](https://arxiv.org/html/2606.19544v1)** [read]
  21 judges, 3 benchmarks. Raw agreement overstates by 33.8–41.3 points of κ
  ("85% agreement" ≈ κ 0.48); position bias spans 0.002–0.192; test-retest >0.95
  can coexist with severe bias; judge rankings shift across benchmarks. Proposes a
  minimum validation protocol: κ as headline, AB+BA order runs, ≥3 repeats, ≥2
  benchmarks.
  **Why it matters:** i2's calibration harness is this protocol, shrunk to fit —
  κ not percent, shuffled batches, repeat runs.
- **[CalibraEval: mitigating selection bias in LLMs-as-judges](https://arxiv.org/pdf/2410.15393)** [surfaced]
- **[Rating Roulette: self-inconsistency in LLM-as-a-judge frameworks](https://arxiv.org/html/2510.27106v1)** [surfaced]

## Memory architectures

- **[Titans: Learning to Memorize at Test Time](https://arxiv.org/abs/2501.00663)** [day-one pass]
  Surprise-gated memory with chained-and-decaying surprise.
  **Why it matters:** the shape of limbic's `1 − 0.5ⁿ` chain scoring, stolen
  honestly and credited in README.
- **[Evo-Memory](https://arxiv.org/pdf/2511.20857)** [day-one pass]
  Unbounded memory growth degrades retrieval; generic advice is a failure mode.
  **Why it matters:** the bounded inbox (10 proposals max), rule decay, and the
  generic-vocabulary guard all trace here.
- **[RPMS](https://arxiv.org/abs/2603.17831)** [day-one pass]
  Rules-first arbitration: inject rules always, episodes only state-filtered, or
  memory hurts.
  **Why it matters:** `inject.js` injects accepted rules only, episodes never.
- **[Reflexion](https://arxiv.org/abs/2303.11366)** [day-one pass]
  In-episode verbal self-reflection on task failures.
  **Why it matters:** prior art for learning from failure; limbic's corner is
  cross-session and human-gated instead.
- **[Letta: stateful agents, three-tier memory, RecoveryBench](https://www.zenml.io/llmops-database/building-stateful-ai-agents-with-in-context-learning-and-memory-management)** [day-one pass]
  Core/recall/archival memory tiers; RecoveryBench shows agents reasoning worse
  from polluted context.
  **Why it matters:** limbic's tiering maps rules/ledger/refused-transcripts, and
  pollution is the argument for a hard injection budget.
- **[State of AI agent memory 2026 (mem0)](https://mem0.ai/blog/state-of-ai-agent-memory-2026)** [day-one pass]
  Ecosystem survey; procedural memory as markdown is the convergent answer.
  **Why it matters:** sharpened the endgame — feed the CLAUDE.md the user already
  maintains rather than build a parallel store.
- **[Context management vs memory management](https://atlan.com/know/ai-agent/ai-agent-context/context-management-vs-memory-management-ai-agents/)** [day-one pass]
  The distinction between what enters context and what persists.
- **[NuPIC anomaly likelihood](https://github.com/numenta/nupic-legacy)** [day-one pass]
  Anomaly scores read against the stream's own history, never raw.
  **Why it matters:** the personal baseline in `stats.js` — and NuPIC's death by
  platform-outliving-research is CONTRIBUTING's "not a framework" cautionary tale.

## Clustering and classification

- **[Human-interpretable clustering of short text using LLMs](https://royalsocietypublishing.org/doi/10.1098/rsos.241692)** [day-one pass]
  Short texts defeat token methods (low co-occurrence); LLM embeddings + classic
  clustering recommended, LLM-as-judge for validation not primary grouping.
  **Why it matters:** i1's blueprint — embeddings nominate, oracle confirms,
  linkage guards.
- **[Text clustering with LLM embeddings](https://dev.to/aimodels-fyi/text-clustering-with-llm-embeddings-3nma)** [day-one pass]
  Blog-tier survey of the same shape.
- **[BERTopic with local LLM labeling via Ollama](https://medium.com/data-science-collective/bertopic-with-local-llm-labeling-llama-cpp-ollama-a-practical-guide-45314e80d723)** [day-one pass]
  Local embedding + labeling pipeline, ollama-served.
  **Why it matters:** evidence the localhost-HTTP embedding route is a beaten path.
- **[Fine-tuned small LLMs outperform zero-shot generative models in text classification](https://arxiv.org/pdf/2406.08660)** [surfaced]
  **Why it matters:** the case for a future SetFit-class local classifier — gated
  on the labeled corpus outgrowing the calibrated oracle.
- **[SetFit: efficient few-shot learning without prompts](https://wandb.ai/gladiator/SetFit/reports/SetFit-Efficient-Few-Shot-Learning-Without-Prompts--VmlldzozMDUyMzk2)** [surfaced]
  Few-shot classifier usable from ~8 labels per class.

## Prior art tools

- **[grudge](https://github.com/eddieparc/grudge)** [day-one pass]
  Hand-written lesson files retrieved by area; propose-inbox and `mechanized`
  lifecycle.
  **Why it matters:** the rules inbox and accept/reject flow are grudge's, automated.
- **[claude-subconscious](https://github.com/letta-ai/claude-subconscious)** [day-one pass]
  Background Letta agent whispering context into sessions.
  **Why it matters:** hook architecture patterns; the non-blocking stop-hook rule.
- **[claude-mem](https://github.com/thedotmack/claude-mem)** [day-one pass]
  Whole-session compression into searchable memory.
  **Why it matters:** the transcript-store job limbic refuses — README sends people
  there for recall.
- **[Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)** [read]
  `/api/embeddings` over localhost HTTP, plain JSON, no client library.
  **Why it matters:** i1's zero-package embedding route, verified.
- **[sqlite-vec](https://github.com/asg017/sqlite-vec)** [read] · **[LanceDB](https://github.com/lancedb/lancedb)** [read]
  Embedded vector search options, npm/C-extension and columnar-format class.
  **Why it matters:** the dependency-policy comparison that settled "file yes,
  index no" at ledger scale — candidates again only if the ledger outgrows exact
  cosine, which its bounds forbid.
