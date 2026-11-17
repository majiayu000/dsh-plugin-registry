// Shared request mix for verification and workerd profiling.
export const PROFILE_WORKLOAD = [
  {}, { page: 2 }, { q: 'memory' }, { q: 'memory', page: 2 }, { q: '记忆' }, { q: 'agent' }, { q: 'a' }, { q: 'dsh' },
  { q: 'mcp server' }, { q: 'zzzzqx' }, { q: 'memory', locale: 'en' }, { q: 'agent', sort: 'stars' },
  { q: 'a', sort: 'new' }, { sort: 'stars' }, { sort: 'added', page: 3 }, { category: 'memory' },
  { category: 'tools', sort: 'forks' }, { manifest: 'not_validated' }, { q: 'memory', manifest: 'not_validated' },
  { listing: 'all' }, { listing: 'low_signal', q: 'a' }, { q: 'agent', page: 40 }, { source: 'curated' }, { language: 'TypeScript', q: 'tool' },
]

export const SORTS = ['relevance', 'stars', 'forks', 'new', 'added', 'manifest']

export function searchParams(options) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(options)) if (value !== undefined && value !== '') params.set(key, String(value))
  return params
}

/** Deterministic terms taken from the snapshot: substrings of names, owners and descriptions. */
export function sampledTerms(registry, count, seed = 106) {
  let state = seed >>> 0
  const random = () => ((state = Math.imul(state ^ (state >>> 15), 2246822507) + 0x9e3779b9 >>> 0) / 4294967296)
  const terms = []
  while (terms.length < count) {
    const plugin = registry.plugins[Math.floor(random() * registry.plugins.length)]
    const sources = [plugin.name, plugin.owner, plugin.description?.zh, plugin.description?.en, (plugin.topics || []).join(' ')].filter(Boolean)
    const text = String(sources[Math.floor(random() * sources.length)]).toLowerCase()
    const words = text.split(/\s+/).filter(Boolean)
    if (!words.length) continue
    const word = words[Math.floor(random() * words.length)]
    const length = 1 + Math.floor(random() * Math.min(6, word.length))
    const start = Math.floor(random() * (word.length - length + 1))
    terms.push(word.slice(start, start + length))
  }
  return terms
}
