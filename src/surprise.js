// Two-part surprise, Titans-shaped (arXiv:2501.00663): a momentary score from
// the correction chain, and a decaying trace of recent scores. The chain length
// n counts consecutive corrective prompts with no accept between them — the
// second correction on the same work is not twice the signal, it is "the first
// fix did not take", which is why the curve saturates instead of adding.

export function momentary (chain) {
  if (chain <= 0) return 0
  return 1 - Math.pow(0.5, chain)
}

export function ema (prev, value, alpha = 0.3) {
  if (prev == null) return value
  return alpha * value + (1 - alpha) * prev
}

const CORRECTIVE = new Set(['correction', 'fix_request', 'challenge'])

// Folds a session's labeled prompts into surprise-scored events.
// An accept resets the chain; a neutral prompt leaves it — the user moving on
// without praise is not evidence the fix landed.
export function scoreSession (labeled) {
  let chain = 0
  let trace = null
  return labeled.map(item => {
    if (CORRECTIVE.has(item.label)) chain++
    else if (item.label === 'accept') chain = 0
    const m = CORRECTIVE.has(item.label) ? momentary(chain) : 0
    trace = ema(trace, m)
    return { ...item, chain: CORRECTIVE.has(item.label) ? chain : 0, surprise: m, trace }
  })
}
