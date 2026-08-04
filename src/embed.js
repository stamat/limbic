import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

// The embedding substrate i1 exists for: vectors nominate the semantic pairs
// lexical overlap cannot see ("menu previews suffer the same issues navbar
// did" shares no tokens with the navbar corrections it repeats). Nominate
// only — the oracle stays the confirmer, the linkage guard stays the merger.
//
// Vectors ride ollama's localhost HTTP API: no package, no key, no cloud.
// Storage is a flat JSONL cache beside the oracle's, readable with cat —
// vector storage without a vector database; at a bounded ledger's scale,
// exact cosine needs no index. Degrade honestly: the first failed call marks
// ollama absent and every later ask returns null, so callers keep the
// oracle-only path. Never a crash, never a silent lie.

const MODEL = 'nomic-embed-text'
const URL = 'http://localhost:11434/api/embeddings'
const EMBED_V = 1

// The cosine above which two corrections are worth a cached oracle question —
// the embedding-side FLOOR. Nomination only, never a merge by itself; i2's
// calibration owns tuning it.
export const EMB_FLOOR = 0.7

export function defaultEmbedCachePath () {
  return join(homedir(), '.limbic', 'cache', 'embeddings.jsonl')
}

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 24)

export function cosine (a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export class Embedder {
  constructor ({ cachePath = defaultEmbedCachePath(), fetchFn = null, model = MODEL } = {}) {
    this.cachePath = cachePath
    this.model = model
    this.fetch = fetchFn ?? (async (text) => {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text })
      })
      if (!res.ok) throw new Error(`ollama ${res.status}`)
      const { embedding } = await res.json()
      return embedding
    })
    this.available = true
    this.cache = null
    this.cacheHits = 0
    this.calls = 0
  }

  async loadCache () {
    this.cache = new Map()
    try {
      const raw = await readFile(this.cachePath, 'utf8')
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        try {
          const { key, vector } = JSON.parse(line)
          this.cache.set(key, vector)
        } catch {}
      }
    } catch {}
  }

  // texts → vectors or null per text. One failed call flips available off for
  // the rest of the run: a dead ollama must cost one timeout, not one per text.
  async embed (texts) {
    if (this.cache === null) await this.loadCache()
    const out = new Array(texts.length).fill(null)
    for (let i = 0; i < texts.length; i++) {
      if (!this.available) break
      const key = `e${EMBED_V}:${this.model}:` + hash(texts[i])
      if (this.cache.has(key)) {
        out[i] = this.cache.get(key)
        this.cacheHits++
        continue
      }
      try {
        this.calls++
        const vector = await this.fetch(texts[i])
        if (!Array.isArray(vector) || !vector.length) throw new Error('bad vector')
        out[i] = vector
        this.cache.set(key, vector)
        await mkdir(dirname(this.cachePath), { recursive: true })
        await appendFile(this.cachePath, JSON.stringify({ key, vector }) + '\n')
      } catch {
        this.available = false
      }
    }
    return out
  }
}
