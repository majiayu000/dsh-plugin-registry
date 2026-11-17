import { BROWSE_PLUGIN_FIELDS } from '../../assets/browse-snapshot.js'
import { hasDshCandidateContext, normalizePendingPlugin } from '../../assets/candidate-relevance.js'
import { classifyLowSignal } from '../../assets/listing-quality.js'
import { applyDiversity, computeRankingScore } from '../../assets/registry-ranking.js'
import { compareQueryRows, QUERY_COLUMN as C } from './query-index.js'

function descriptionRange(plugin, locale, text) {
  const description = String(plugin.description && (plugin.description[locale] || plugin.description.zh || plugin.description.en) || '').toLowerCase()
  return [text.indexOf(description), description.length]
}

/** Build query-only records and separate display cards without writing artifacts. */
export function buildSearchDocument(registry, audit = {}) {
  const rankingAt = Date.parse(registry.generatedAt)
  if (!Number.isFinite(rankingAt)) throw new Error('Search ranking requires a valid registry.generatedAt')
  const publishedIds = new Set(registry.plugins.map(plugin => plugin.id.toLowerCase()))
  const pending = Array.isArray(audit.pendingReview)
    ? audit.pendingReview.filter(entry => entry && entry.id && entry.url && !publishedIds.has(entry.id.toLowerCase()) && hasDshCandidateContext(entry)).map(normalizePendingPlugin)
    : []
  const cards = {}
  const entries = [...registry.plugins, ...pending].map((plugin, position) => {
    const idLower = String(plugin.id || '').toLowerCase()
    const ownerLower = String(plugin.owner || '').toLowerCase()
    // Relevance tests whitespace-free terms with includes(), so repeating an
    // identical translation cannot affect its result. Store that text once.
    const description = [...new Set(Object.values(plugin.description || {}).map(value => value == null ? '' : String(value).toLowerCase()))].join(' ')
    const candidate = position >= registry.plugins.length
    cards[idLower] = {
      ...Object.fromEntries(BROWSE_PLUGIN_FIELDS.map(field => [field, plugin[field] ?? null])),
      ...(candidate ? { url: plugin.url } : {}),
    }
    // Layout is QUERY_COLUMN in functions/lib/query-index.js. Only query/rank
    // fields live here; display cards are fetched separately after pagination.
    return [
      plugin.id, plugin.owner, plugin.category, plugin.source, plugin.verification?.manifest, plugin.language,
      plugin.stars || 0, plugin.forks, plugin.pushedAt || '', plugin.addedAt || '', candidate,
      plugin.trustLevel === 'pending_review', computeRankingScore(plugin, { now: rankingAt }).score,
      idLower === plugin.id ? null : idLower,
      String(plugin.name || '').toLowerCase(),
      ownerLower === plugin.owner ? null : ownerLower,
      description, (plugin.topics || []).join(' ').toLowerCase(),
      [...descriptionRange(plugin, 'zh', description), ...descriptionRange(plugin, 'en', description)],
      `${plugin.language || ''} ${plugin.packageName || ''} ${plugin.profile || ''}`.toLowerCase(),
      // Whitespace-normalized, space-padded topic words: an exact topic-word
      // test becomes one includes(' term ') instead of a split per row.
      ` ${(plugin.topics || []).join(' ').toLowerCase().split(/\s+/).filter(Boolean).join(' ')} `,
    ]
  })
  const orders = Object.fromEntries(['relevance', 'stars', 'forks', 'new', 'added', 'manifest'].map(sort => [sort,
    entries.map((_, position) => position).sort((a, b) => compareQueryRows(entries[a], entries[b], sort)),
  ]))
  // Browser listing filter (#115): low-signal flags are derived from published
  // plugins only, so pending candidates are never low-signal.
  const lowSignalIds = classifyLowSignal(registry.plugins)
  const lowSignal = entries.map(entry => entry[C.candidate] || !lowSignalIds.has(entry[C.idLower] ?? entry[C.id]) ? 0 : 1)
  const inListing = { all: () => true, standard: position => !lowSignal[position], low_signal: position => lowSignal[position] === 1 }
  const homes = Object.fromEntries(Object.entries(inListing).map(([listing, keep]) => [listing,
    applyDiversity(orders.relevance.filter(position => !entries[position][C.candidate] && keep(position))
      .map(position => ({ owner: entries[position][C.owner], position }))).map(row => row.position)]))
  // Dense ranks replace request-time localeCompare: equal keys share a rank.
  // They are computed once here with the same comparators the browser uses.
  const denseRanks = (order, compare) => {
    const rank = new Array(entries.length)
    let current = 0
    order.forEach((position, i) => {
      if (i && compare(entries[order[i - 1]], entries[position]) !== 0) current++
      rank[position] = current
    })
    return rank
  }
  const ranks = Object.fromEntries(['stars', 'forks', 'new', 'added', 'manifest'].map(sort => [sort, denseRanks(orders[sort], (a, b) => compareQueryRows(a, b, sort))]))
  const idCompare = (a, b) => a[C.id].localeCompare(b[C.id])
  ranks.id = denseRanks(entries.map((_, position) => position).sort((a, b) => idCompare(entries[a], entries[b])), idCompare)
  // Descending stored ranking score; search blends relevance with this
  // monotonic quality factor, enabling an exact upper-bound stop.
  const quality = entries.map((_, position) => position).sort((a, b) => entries[b][C.score] - entries[a][C.score] || a - b)
  const postings = new Map()
  for (let position = 0; position < entries.length; position++) {
    const entry = entries[position]
    const category = registry.categories?.[entry[C.category]]
    const text = [entry[C.idLower] ?? entry[C.id], entry[C.ownerLower] ?? entry[C.owner],
      entry[C.description], entry[C.topics], entry[C.extra], entry[C.category], ...Object.values(category || {})].join(' ').toLowerCase()
    const grams = new Set()
    for (let start = 0; start < text.length; start++) {
      for (let width = 1; width <= 2 && start + width <= text.length; width++) {
        const gram = text.slice(start, start + width)
        if (!/\s/.test(gram)) grams.add(gram)
      }
    }
    for (const gram of grams) {
      if (!postings.has(gram)) postings.set(gram, [])
      postings.get(gram).push(position)
    }
  }
  // Delta-varint positions avoid a large array of JS numbers per fragment.
  // Decode just the selected list, not every list at startup.
  const grams = Object.fromEntries([...postings].map(([gram, positions]) => {
    const bytes = []
    let previous = 0
    for (const position of positions) {
      let delta = position - previous
      while (delta >= 128) { bytes.push((delta & 127) | 128); delta >>>= 7 }
      bytes.push(delta)
      previous = position
    }
    return [gram, Buffer.from(bytes).toString('base64')]
  }))
  return { index: { generatedAt: registry.generatedAt, rankingAt, categories: registry.categories || {}, entries, orders, home: homes.all, homes, lowSignal, ranks, quality, grams }, cards }
}
