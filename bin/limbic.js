#!/usr/bin/env node
import { join } from 'node:path'
import { homedir } from 'node:os'
import { replay } from '../src/replay.js'
import { readLedger, defaultLedgerPath } from '../src/ledger.js'
import { aggregate, render } from '../src/stats.js'

const HELP = `limbic — an agent's memory gate

usage:
  limbic replay [--projects DIR] [--project SLUG] [--ledger FILE]
      Rebuild the ledger from Claude Code session history.
      Defaults: --projects ~/.claude/projects, --ledger ~/.limbic/ledger.jsonl

  limbic stats [--ledger FILE]
      Correction rates, surprise baseline, per-session sparklines.

  limbic dream [--ledger FILE] [--llm] [--min N]
      Cluster corrective events into proposed rules in ~/.limbic/rules/.
      Proposed, never activated: accept or reject each one yourself.
      --llm phrases rules via \`claude -p\` (subscription auth); without it,
      or on any failure, rules carry an editable template statement.

  limbic rules [--all]
      List proposed rules (--all includes accepted and rejected).

  limbic accept <file> | reject <file>
      Promote or suppress a proposed rule. Rejected clusters stay suppressed.

  limbic retrodict [--ledger FILE] [--llm] [--online] [--min N]
      The thesis benchmark: rules from the first half of history scored
      against corrections in the second. --online scores every event against
      only what came before it. --min 2 admits pair-clusters, but only when
      embedding and oracle both confirm the pair. Honest either way.

  limbic calibrate [--sample] [--llm] [--repeats N] [--corpus FILE]
      --sample pulls a stratified corpus from history into
      ~/.limbic/corpus/labels.jsonl for hand-labeling (fill "human" in).
      Without --sample, scores the cascade against your labels: Cohen's κ,
      per-label precision/recall; --llm adds N repeat runs on fresh caches
      with shuffled order — inter-run κ is the consistency number.

  limbic install [--predict]
      Print the hooks block for ~/.claude/settings.json — never edits it.
      --predict includes the opt-in Stop hook (one Haiku call per turn).

Everything runs locally; only --llm ever calls a model. --llm accepts
--max-calls N (default 60) — the per-run cap on claude invocations.`

function flag (args, name, fallback) {
  const i = args.indexOf(name)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

const [cmd, ...args] = process.argv.slice(2)

async function makeOracle () {
  if (!args.includes('--llm')) return null
  const { Oracle } = await import('../src/oracle.js')
  return new Oracle({ maxCalls: Number(flag(args, '--max-calls', 60)) })
}

// The embedder rides along with --llm: embeddings only nominate pairs, the
// oracle confirms them — vectors without an oracle would have no one to ask.
// A dead or missing ollama costs one failed call and the run degrades to
// oracle-only, stated in the report line.
async function makeEmbedder () {
  if (!args.includes('--llm')) return null
  const { Embedder } = await import('../src/embed.js')
  return new Embedder()
}

function oracleReport (oracle, embedder) {
  if (oracle) console.log(`oracle: ${oracle.calls} calls, ${oracle.cacheHits} cache hits`)
  if (embedder) {
    console.log(embedder.available
      ? `embeddings: ${embedder.calls} calls, ${embedder.cacheHits} cache hits`
      : 'embeddings: ollama unavailable — degraded to oracle-only')
  }
}

if (cmd === 'replay') {
  const oracle = await makeOracle()
  const summary = await replay({
    projectsDir: flag(args, '--projects', join(homedir(), '.claude', 'projects')),
    ledgerPath: flag(args, '--ledger', defaultLedgerPath()),
    project: flag(args, '--project', null),
    oracle
  })
  console.log(`files ${summary.files}  sessions ${summary.sessions}  prompts ${summary.prompts}  records ${summary.records}  bad lines ${summary.badLines}`)
  console.log(`rephrases ${summary.rephrases}  interrupts ${summary.interrupts}  denials ${summary.denials}  self-corrections ${summary.selfCorrections}  oracle upgrades ${summary.oracleUpgrades}  refuted ${summary.oracleRefuted}`)
  oracleReport(oracle)
} else if (cmd === 'stats') {
  const records = await readLedger(flag(args, '--ledger', defaultLedgerPath()))
  if (!records.length) {
    console.error('ledger is empty — run `limbic replay` first')
    process.exit(1)
  }
  console.log(render(aggregate(records)))
} else if (cmd === 'dream') {
  const { dream } = await import('../src/dream.js')
  const oracle = await makeOracle()
  const embedder = await makeEmbedder()
  const records = await readLedger(flag(args, '--ledger', defaultLedgerPath()))
  const summary = await dream({
    records,
    useLlm: args.includes('--llm'),
    oracle,
    embedder,
    minSize: Number(flag(args, '--min', 3))
  })
  console.log(`corrective ${summary.corrective}  clusters ${summary.clusters}  (pairs asked ${summary.asked}, confirmed ${summary.confirmed})  proposed ${summary.proposed}  already known ${summary.skippedKnown}`)
  oracleReport(oracle, embedder)
  if (summary.proposed) console.log('review with: limbic rules')
} else if (cmd === 'rules') {
  const { listRules } = await import('../src/rules.js')
  const all = await listRules()
  const shown = args.includes('--all') ? all : all.filter(r => r.meta.status === 'proposed')
  if (!shown.length) {
    console.log(args.includes('--all') ? 'no rules yet — run `limbic dream`' : 'no proposed rules')
  }
  for (const r of shown) {
    const head = r.body.split('\n').find(l => l && !l.startsWith('#')) ?? ''
    console.log(`[${r.meta.status}] ${r.file}  (${r.meta.size} events)\n    ${head.slice(0, 120)}`)
  }
} else if (cmd === 'accept' || cmd === 'reject') {
  const { setStatus } = await import('../src/rules.js')
  const file = args[0]
  if (!file) {
    console.error(`usage: limbic ${cmd} <file>`)
    process.exit(1)
  }
  await setStatus(file, cmd === 'accept' ? 'accepted' : 'rejected')
  console.log(`${file} → ${cmd}ed`)
} else if (cmd === 'retrodict') {
  const { retrodict, retrodictOnline } = await import('../src/retrodict.js')
  const oracle = await makeOracle()
  const embedder = await makeEmbedder()
  const records = await readLedger(flag(args, '--ledger', defaultLedgerPath()))
  const minSize = Number(flag(args, '--min', 3))
  if (args.includes('--online')) {
    const r = await retrodictOnline(records, { oracle, embedder, minSize })
    console.log(`online: ${r.scored} scored of ${r.events} corrective; preventable ${r.preventable} (${(r.rate * 100).toFixed(1)}%)`)
    for (const h of r.hits) console.log(`  ~ [${h.signature}] ${h.text}`)
  } else {
    const r = await retrodict(records, { oracle, embedder, minSize })
    console.log(`past ${r.pastEvents} events → ${r.rules} rules; future ${r.futureEvents} events, preventable ${r.preventable} (${(r.rate * 100).toFixed(1)}%)`)
    for (const h of r.hits) console.log(`  ~ [${h.signature}] ${h.text}`)
  }
  oracleReport(oracle, embedder)
} else if (cmd === 'calibrate') {
  const { sampleCorpus, readCorpus, cascadeLabels, score, kappa, shuffled, freshCachePath, defaultCorpusPath } = await import('../src/calibrate.js')
  const corpusPath = flag(args, '--corpus', defaultCorpusPath())
  if (args.includes('--sample')) {
    const { added, total } = await sampleCorpus({
      projectsDir: flag(args, '--projects', join(homedir(), '.claude', 'projects')),
      corpusPath
    })
    console.log(`sampled ${added} new items — corpus now ${total}`)
    console.log(`fill in "human" by editing ${corpusPath}`)
    console.log('labels: correction | fix_request | challenge | rephrase | accept | neutral')
  } else {
    const all = await readCorpus(corpusPath)
    const corpus = all.filter(c => c.human)
    if (!corpus.length) {
      console.error(`no labeled items in ${corpusPath} — run \`limbic calibrate --sample\`, label by hand, retry`)
      process.exit(1)
    }
    console.log(`corpus: ${corpus.length} labeled of ${all.length} sampled`)
    const detLabels = await cascadeLabels(corpus, null)
    const det = await score(corpus, (_, i) => detLabels[i])
    const line = (name, s) => console.log(`${name}: κ ${s.kappa.toFixed(2)}  agreement ${(s.agreement * 100).toFixed(0)}%  n ${s.n}`)
    line('deterministic cascade', det)
    for (const [l, m] of Object.entries(det.perLabel)) {
      console.log(`  ${l.padEnd(12)} precision ${m.precision === null ? '—' : m.precision.toFixed(2)}  recall ${m.recall === null ? '—' : m.recall.toFixed(2)}  n ${m.n}`)
    }
    if (args.includes('--llm')) {
      // The reliability protocol: each repeat gets a fresh cache (a cached
      // verdict fakes perfect consistency) and a different item order (position
      // bias survives high test-retest). κ between runs is the honest
      // consistency number; κ vs human is the honest accuracy number.
      const { Oracle } = await import('../src/oracle.js')
      const repeats = Number(flag(args, '--repeats', 3))
      const runs = []
      for (let r = 1; r <= repeats; r++) {
        const oracle = new Oracle({ maxCalls: Number(flag(args, '--max-calls', 60)), cachePath: freshCachePath(r) })
        const order = shuffled(corpus.map((_, i) => i), r * 7919)
        const items = order.map(i => corpus[i])
        const labels = await cascadeLabels(items, oracle)
        const byId = new Map(items.map((it, k) => [it.id, labels[k]]))
        runs.push(corpus.map(c => byId.get(c.id)))
        const s = await score(corpus, (c) => byId.get(c.id))
        line(`oracle cascade run ${r} (${oracle.calls} calls)`, s)
      }
      for (let a = 0; a < runs.length; a++) {
        for (let b = a + 1; b < runs.length; b++) {
          console.log(`  inter-run κ ${a + 1}↔${b + 1}: ${kappa(runs[a], runs[b]).toFixed(2)} (order shuffled — disagreement here is inconsistency or position bias)`)
        }
      }
    }
    if (det.wrong.length) {
      console.log('worst confusions (deterministic):')
      for (const w of det.wrong.slice(0, 5)) console.log(`  human=${w.human} got=${w.got}  "${w.text}"`)
    }
  }
} else if (cmd === 'install') {
  // Print-only, deliberately: limbic never edits your settings.json — a
  // memory tool that modifies its host's configuration crosses the same
  // boundary the propose gate exists to guard. Paste the block yourself.
  const { fileURLToPath } = await import('node:url')
  const { dirname: dn, join: jn } = await import('node:path')
  const root = dn(dn(fileURLToPath(import.meta.url)))
  const hooks = {
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: `node "${jn(root, 'hooks', 'classify.js')}"`, timeout: 5 }] }],
    SessionStart: [{ hooks: [{ type: 'command', command: `node "${jn(root, 'hooks', 'inject.js')}"`, timeout: 5 }] }]
  }
  if (args.includes('--predict')) {
    hooks.Stop = [{ hooks: [{ type: 'command', command: `node "${jn(root, 'hooks', 'predict.js')}"`, timeout: 90 }] }]
  }
  console.log('add to ~/.claude/settings.json under "hooks":\n')
  console.log(JSON.stringify(hooks, null, 2))
  if (!args.includes('--predict')) {
    console.log('\nopt-in prediction (one Haiku call per turn): limbic install --predict')
  }
} else {
  console.log(HELP)
  process.exit(cmd ? 1 : 0)
}
