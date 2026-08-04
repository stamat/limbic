import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

// One directory, status in frontmatter — not status-per-directory — so a
// rule's whole history is one file's git-friendly diff, and a rejected rule
// keeps existing: rejection must be remembered or the next dream re-proposes
// the same cluster forever.
export function rulesDir () {
  return join(homedir(), '.limbic', 'rules')
}

export function parseRule (raw, file) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return null
  const meta = {}
  for (const line of m[1].split('\n')) {
    const [k, ...rest] = line.split(':')
    if (k && rest.length) meta[k.trim()] = rest.join(':').trim()
  }
  return { file, meta, body: m[2].trim() }
}

export async function listRules (dir = rulesDir()) {
  let files
  try {
    files = await readdir(dir)
  } catch {
    return []
  }
  const out = []
  for (const f of files) {
    if (!f.endsWith('.md')) continue
    const rule = parseRule(await readFile(join(dir, f), 'utf8'), f)
    if (rule) out.push(rule)
  }
  return out
}

export async function setStatus (file, status, dir = rulesDir()) {
  const path = join(dir, file)
  const raw = await readFile(path, 'utf8')
  const updated = raw.replace(/^(---[\s\S]*?)status: *[a-z]+/m, `$1status: ${status}`)
  if (updated === raw && !/status:/.test(raw)) {
    throw new Error(`${file} has no status field to update`)
  }
  await writeFile(path, updated)
  return parseRule(updated, file)
}

export async function writeRule (rule, dir = rulesDir()) {
  await mkdir(dir, { recursive: true })
  const file = `${rule.signature}.md`
  const evidence = rule.events
    .map(e => `- (${e.project.replace(/^-Users-[^-]+-/, '')}) ${e.text.replace(/\n/g, ' ')}`)
    .join('\n')
  const content = `---
status: proposed
date: ${new Date().toISOString().slice(0, 10)}
size: ${rule.size}
labels: ${rule.labels.join(', ')}
projects: ${rule.projects.length}
signature: ${rule.signature}
---

## Proposed rule

${rule.statement}

## Evidence (${rule.size} events)

${evidence}
`
  await writeFile(join(dir, file), content)
  return file
}
