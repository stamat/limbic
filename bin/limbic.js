#!/usr/bin/env node
import { join } from 'node:path'
import { homedir } from 'node:os'
import { replay } from '../src/replay.js'
import { readLedger, readHistory, defaultLedgerPath } from '../src/ledger.js'
import { aggregate, render } from '../src/stats.js'

const HELP = `limbic — an agent's memory gate

usage:
  limbic replay [--projects DIR] [--project SLUG] [--ledger FILE]
      Rebuild the ledger from Claude Code session history.
      Defaults: --projects ~/.claude/projects, --ledger ~/.limbic/ledger.jsonl

  limbic stats [--ledger FILE] [--llm]
      Correction rates, surprise baseline, per-session sparklines, and each
      month's share of accepts with no correction since the last accept.
      Reads the replay and live ledgers both unless --ledger names one.
      --llm matches repeats by meaning (embeddings nominate, the oracle
      confirms, cached); without it, by shared words only.

  limbic dream [--ledger FILE] [--llm] [--min N] [--claude-md FILE]
      Cluster corrections and missed steps into proposed rules in
      ~/.limbic/rules/, and propose each "remember …" directive as its own.
      Proposed, never activated: accept or reject each one yourself.
      Reads the replay and live ledgers both unless --ledger names one.
      --llm phrases rules via \`claude -p\` (subscription auth) in the words of
      your CLAUDE.md, and files a rule it already states as covered; without
      it, or on any failure, rules carry an editable template statement.

  limbic rules [--all]
      List proposed rules (--all includes accepted, rejected, covered and
      graduated).

  limbic accept <file> | reject <file>
      Promote or suppress a proposed rule. Rejected clusters stay suppressed.

  limbic efficacy [--ledger FILE] [--llm]
      For each accepted rule: lessons like its evidence per 1000 prompts,
      before the day it was accepted and after, and what to do with it —
      keep, graduate, revise or check. --llm matches lessons by meaning, as
      stats does; without it, by shared words only.

  limbic commits [--projects DIR]
      Every commit message the agent wrote, checked against the Commits
      section (one line, no Conventional Commits prefix, lowercase), split
      by whether the session got the remind hook's reminder, was held out,
      or neither. Reads the transcripts; no model.

  limbic eval [--rule FILE] [--runs N] [--model M] [--max-calls N]
      The offline test: for each accepted rule, the tasks that came right
      before its corrections are put to \`claude -p\` with the rule and
      without it, N times each (default 2), and Haiku judges whether the
      mistake came back. No tools, no repository: it tests whether the rule
      is understood and applied, not the live sessions. Spends plan budget,
      capped by --max-calls (default 60, the agent and the judge each count).

  limbic graduate <file> [--claude-md FILE]
      Stop injecting a rule that now lives in your CLAUDE.md. Refuses until a
      line there states it: paste it first, limbic never edits the file.

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

  limbic curate [--claude-md FILE] [--llm]
      Read accepted rules against the CLAUDE.md you already maintain and
      print a proposal: additions it lacks, rules it already covers by hand.
      Prints only — the file is yours to edit.

  limbic install [--predict] [--remind]
      Print the hooks block for ~/.claude/settings.json — never edits it.
      --predict includes the opt-in Stop hook (one Haiku call per turn).
      --remind includes a PreToolUse hook that repeats your CLAUDE.md
      "Commits" section before the session's first git commit — copy it
      for other headings and commands.

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

// Replay's rebuild alone loses every session Claude Code already deleted; the
// live ledger is the only copy of those, so readers default to both.
function history () {
  return args.includes('--ledger') ? readLedger(flag(args, '--ledger')) : readHistory()
}

// The doctrine is optional context: missing, the rules are phrased without it
// and the run says so, never fails.
async function readDoctrine () {
  const { readFile } = await import('node:fs/promises')
  const path = flag(args, '--claude-md', join(homedir(), '.claude', 'CLAUDE.md'))
  try {
    return await readFile(path, 'utf8')
  } catch {
    console.log(`doctrine: cannot read ${path} — rules phrased without it`)
    return null
  }
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
  console.log(`files ${summary.files}  sessions ${summary.sessions}  prompts ${summary.prompts}  records ${summary.records}  kept ${summary.kept} (transcripts gone)  bad lines ${summary.badLines}`)
  console.log(`rephrases ${summary.rephrases}  interrupts ${summary.interrupts}  denials ${summary.denials}  self-corrections ${summary.selfCorrections}  oracle upgrades ${summary.oracleUpgrades}  refuted ${summary.oracleRefuted}`)
  oracleReport(oracle)
} else if (cmd === 'stats') {
  const records = await history()
  if (!records.length) {
    console.error('ledger is empty — run `limbic replay` first')
    process.exit(1)
  }
  const { repeats } = await import('../src/stats.js')
  const oracle = await makeOracle()
  const embedder = await makeEmbedder()
  const agg = aggregate(records)
  agg.repeats = await repeats(records, { oracle, embedder })
  console.log(render(agg))
  if (!oracle) console.log('\n(no --llm: repeats matched by shared words only — a paraphrase is missed)')
  oracleReport(oracle, embedder)
} else if (cmd === 'dream') {
  const { dream } = await import('../src/dream.js')
  const oracle = await makeOracle()
  const embedder = await makeEmbedder()
  const records = await history()
  const doctrine = args.includes('--llm') ? await readDoctrine() : null
  const summary = await dream({
    records,
    useLlm: args.includes('--llm'),
    oracle,
    embedder,
    doctrine,
    minSize: Number(flag(args, '--min', 3))
  })
  console.log(`lessons ${summary.lessons}  directives ${summary.directives}  clusters ${summary.clusters}  (pairs asked ${summary.asked}, confirmed ${summary.confirmed})  proposed ${summary.proposed}  covered ${summary.covered}  already known ${summary.skippedKnown}`)
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
} else if (cmd === 'efficacy') {
  const { listRules } = await import('../src/rules.js')
  const { efficacy } = await import('../src/efficacy.js')
  const rules = (await listRules()).filter(r => r.meta.status === 'accepted')
  if (!rules.length) {
    console.error('no accepted rules — review proposals with `limbic rules` first')
    process.exit(1)
  }
  const { pooled } = await import('../src/efficacy.js')
  const oracle = await makeOracle()
  const embedder = await makeEmbedder()
  const results = await efficacy(await history(), rules, { oracle, embedder })
  const all = pooled(results)
  const share = (m, n) => n ? `${(100 * m / n).toFixed(1)}%` : '—'
  console.log(`all rules pooled: missed in ${share(all.missed, all.given)} of ${all.given} session-rules given, ${share(all.heldMissed, all.held)} of ${all.held} held out — p ${all.p.toFixed(3)}${all.p < 0.05 ? ', the rules work' : ', no evidence yet'}\n`)
  for (const e of results) {
    const w = s => `${s.per1000.toFixed(1)}/1000 (${s.hits} of ${s.prompts})`
    console.log(`${e.action.padEnd(9)} ${e.file}  since ${e.since}  ${e.verdict}\n    before ${w(e.before)}  after ${w(e.after)}  given ${e.given} sessions, missed in ${e.missed}  held out ${e.held}, missed in ${e.heldMissed}`)
    for (const m of e.misses.slice(0, 2)) console.log(`    ✗ ${m.replace(/\s+/g, ' ').slice(0, 100)}`)
  }
  console.log('\ngraduate: paste the rule into your CLAUDE.md, then `limbic graduate <file>`')
  console.log('revise: edit the statement, or `limbic reject <file>` — the ✗ lines are sessions that had the rule and missed it')
  console.log('check: fewer than 5 lessons before acceptance matched its evidence — too few to judge by date; read it, keep or reject')
  if (!oracle) console.log('(no --llm: lessons matched by shared words only — a paraphrase is missed)')
  oracleReport(oracle, embedder)
} else if (cmd === 'commits') {
  const { scanCommits, byReminder } = await import('../src/commits.js')
  const { fisherLess } = await import('../src/efficacy.js')
  const commits = await scanCommits(flag(args, '--projects', join(homedir(), '.claude', 'projects')))
  const groups = byReminder(commits, await history())
  const line = (name, cs) => {
    const bad = cs.filter(c => c.violations.length).length
    console.log(`${name.padEnd(30)} ${cs.length ? `${(100 * (cs.length - bad) / cs.length).toFixed(0)}% follow the Commits section` : '—'}  (${cs.length - bad} of ${cs.length})`)
  }
  line('reminded', groups.given)
  line('held out (no reminder)', groups.held)
  line('before remind, or not reached', groups.none)
  const g = groups.given
  const h = groups.held
  const gBad = g.filter(c => c.violations.length).length
  const hBad = h.filter(c => c.violations.length).length
  if (g.length && h.length) {
    const p = fisherLess(gBad, g.length - gBad, hBad, h.length - hBad)
    console.log(`\nfewer violations with the reminder: p ${p.toFixed(3)}${p < 0.05 ? ' — the reminder works' : ' — no evidence yet'}`)
  }
  const unread = commits.filter(c => c.violations === null).length
  if (unread) console.log(`${unread} commits with a message the command does not show (-F, an editor) — not counted`)
  const recent = commits.filter(c => c.violations?.length).slice(-5)
  if (recent.length) {
    console.log('\nrecent violations:')
    for (const c of recent) console.log(`  ✗ ${c.violations.join(', ')}: ${c.message.split('\n')[0].slice(0, 80)}`)
  }
} else if (cmd === 'eval') {
  const { listRules } = await import('../src/rules.js')
  const { cases, evaluate } = await import('../src/eval.js')
  const { fisherLess } = await import('../src/efficacy.js')
  const only = flag(args, '--rule', null)
  const rules = (await listRules()).filter(r => r.meta.status === 'accepted' && (!only || r.file === only))
  if (!rules.length) {
    console.error(only ? `no accepted rule ${only}` : 'no accepted rules — review proposals with `limbic rules` first')
    process.exit(1)
  }
  const records = await history()
  let budget = Number(flag(args, '--max-calls', 60))
  const total = { with: { yes: 0, no: 0 }, without: { yes: 0, no: 0 } }
  for (const rule of rules) {
    const found = cases(rule, records)
    if (!found.length || budget < 2) {
      console.log(`skip      ${rule.file}  ${found.length ? 'call budget spent' : 'no evidence matched a task in the ledger'}`)
      continue
    }
    const r = await evaluate(rule, found, { runs: Number(flag(args, '--runs', 2)), model: flag(args, '--model', null), maxCalls: budget })
    budget -= r.calls
    const rate = t => (t.yes + t.no) ? `${t.yes} of ${t.yes + t.no}` : '—'
    console.log(`${(r.p < 0.05 ? 'works' : 'unclear').padEnd(9)} ${rule.file}  ${r.cases} cases\n    mistake repeated: with the rule ${rate(r.tally.with)}, without ${rate(r.tally.without)}  (na ${r.tally.with.na + r.tally.without.na})  p ${r.p.toFixed(3)}`)
    for (const side of ['with', 'without']) for (const k of ['yes', 'no']) total[side][k] += r.tally[side][k]
  }
  const w = total.with
  const o = total.without
  if ((w.yes + w.no) && (o.yes + o.no)) {
    const p = fisherLess(w.yes, w.no, o.yes, o.no)
    console.log(`\nall rules: mistake repeated with the rules ${w.yes} of ${w.yes + w.no}, without ${o.yes} of ${o.yes + o.no} — p ${p.toFixed(3)}${p < 0.05 ? ', the rules work offline' : ', no evidence yet'}`)
  }
  console.log(`calls left: ${budget}`)
} else if (cmd === 'graduate') {
  const { listRules, setStatus } = await import('../src/rules.js')
  const { doctrineHolds } = await import('../src/efficacy.js')
  const { doctrineLines } = await import('../src/curate.js')
  const file = args[0]
  const rule = (await listRules()).find(r => r.file === file)
  if (!rule || rule.meta.status !== 'accepted') {
    console.error(`usage: limbic graduate <file> — an accepted rule (see \`limbic rules --all\`)`)
    process.exit(1)
  }
  const doctrine = await readDoctrine()
  const statement = rule.body.split('## Evidence')[0].replace('## Proposed rule', '').trim()
  if (!doctrine || !doctrineHolds(statement, doctrineLines(doctrine))) {
    console.error(`no line in your CLAUDE.md states this rule yet — paste it, then graduate:\n\n- ${statement}`)
    process.exit(1)
  }
  await setStatus(file, 'graduated')
  console.log(`${file} → graduated: your CLAUDE.md carries it, sessions no longer get it from limbic`)
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
    console.log('labels: correction | fix_request | challenge | rephrase | missed_step | directive | accept | neutral')
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
} else if (cmd === 'curate') {
  const { readFile } = await import('node:fs/promises')
  const { listRules } = await import('../src/rules.js')
  const { curate } = await import('../src/curate.js')
  const doctrinePath = flag(args, '--claude-md', join(homedir(), '.claude', 'CLAUDE.md'))
  const accepted = (await listRules()).filter(r => r.meta.status === 'accepted')
  if (!accepted.length) {
    console.error('no accepted rules to curate — review proposals with `limbic rules` first')
    process.exit(1)
  }
  let doctrine
  try {
    doctrine = await readFile(doctrinePath, 'utf8')
  } catch {
    console.error(`cannot read ${doctrinePath} — pass your doctrine file with --claude-md`)
    process.exit(1)
  }
  const oracle = await makeOracle()
  const embedder = await makeEmbedder()
  const rules = accepted.map(r => ({
    file: r.file,
    size: Number(r.meta.size ?? 0),
    statement: r.body.split('## Evidence')[0].replace('## Proposed rule', '').trim()
  }))
  const { additions, covered, doctrineLines } = await curate({ rules, doctrine, oracle, embedder })
  console.log(`doctrine: ${doctrinePath} (${doctrineLines} candidate lines)  accepted rules: ${rules.length}\n`)
  if (covered.length) {
    console.log('already covered by your hand — `limbic graduate <file>` stops injecting it:')
    for (const c of covered) console.log(`  ~ ${c.rule.file}: ${c.rule.statement.slice(0, 70)}\n    ≈ "${c.line.slice(0, 70)}" (cos ${c.cos.toFixed(2)})`)
    console.log('')
  }
  if (additions.length) {
    console.log('proposed additions — paste where they belong, reword freely:\n')
    for (const a of additions) console.log(`- ${a.statement} _(deduced from ${a.size} corrections, ${a.file})_`)
    console.log('')
  }
  if (!embedder || !oracle) console.log('(no --llm: coverage unchecked, every rule proposed — the human judges)')
  console.log('limbic never edits your doctrine — the last hand is yours.')
  oracleReport(oracle, embedder)
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
  if (args.includes('--remind')) {
    hooks.PreToolUse = [{
      matcher: 'Bash',
      hooks: [{ type: 'command', if: 'Bash(git commit *)', command: `node "${jn(root, 'hooks', 'remind.js')}" Commits --commit`, timeout: 5 }]
    }]
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
