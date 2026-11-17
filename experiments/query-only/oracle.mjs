// Reference ordering: the current browser apply() sequence in
// assets/page-browse.js using the browser's own modules, with only the
// wall clock fixed to the ranking time (registry.generatedAt).
import { hasDshCandidateContext, normalizePendingPlugin } from '../../assets/candidate-relevance.js'
import { partitionListing } from '../../assets/listing-quality.js'
import { createPluginSearchIndex, filterPluginSearchIndex } from '../../assets/registry-search.js'
import { computeRankingScore, rankPlugins } from '../../assets/registry-ranking.js'

export function createOracle(registry, audit = {}) {
  const now = Date.parse(registry.generatedAt)
  const ids = new Set(registry.plugins.map(p => p.id.toLowerCase()))
  const pending = (audit.pendingReview || []).filter(p => p && p.id && p.url && !ids.has(p.id.toLowerCase()) && hasDshCandidateContext(p)).map(normalizePendingPlugin)
  const { reasons } = partitionListing(registry.plugins)
  const isLowSignal = plugin => reasons.has(String(plugin.id || '').toLowerCase())
  const indexes = new Map()
  function searchIndex(locale, plugins, key) {
    if (!indexes.has(key)) {
      const index = createPluginSearchIndex(plugins, p => {
        const description = p.description && (p.description[locale] || p.description.zh || p.description.en) || ''
        const category = registry.categories[p.category]
        const title = category ? category[locale] || category.zh || category.en || p.category : p.category
        return p.id + ' ' + description + ' ' + p.owner + ' ' + title + ' ' + (p.language || '') + ' ' + (p.topics || []).join(' ') + ' ' + (p.packageName || '') + ' ' + (p.profile || '')
      })
      for (const entry of index) entry.score = computeRankingScore(entry.plugin, { now }).score
      indexes.set(key, index)
    }
    return indexes.get(key)
  }
  return function reference(options = {}) {
    const locale = options.locale === 'en' || options.locale === 'en-US' ? 'en' : 'zh'
    const withPending = options.manifest === 'not_validated'
    const search = searchIndex(locale, withPending ? registry.plugins.concat(pending) : registry.plugins, `${locale}:${withPending}`)
    let rows = filterPluginSearchIndex(search, { query: options.q, category: options.category, source: options.source, manifest: options.manifest })
    if (options.language && options.language !== 'all') rows = rows.filter(p => p.language === options.language)
    const listing = options.listing || 'standard'
    if (listing === 'low_signal') rows = rows.filter(isLowSignal)
    else if (listing === 'standard') rows = rows.filter(p => !isLowSignal(p))
    const q = options.q || ''
    const sort = options.sort || 'relevance'
    if (!q && sort === 'relevance') rows = rankPlugins(rows, { now })
    else if (sort !== 'relevance' || !q) rows.sort((a, b) => {
      if (sort === 'forks') return b.forks - a.forks
      if (sort === 'new') return String(b.pushedAt || '').localeCompare(String(a.pushedAt || ''))
      if (sort === 'added') return String(b.addedAt || '').localeCompare(String(a.addedAt || ''))
      if (sort === 'manifest') {
        const delta = Number(b.verification?.manifest === 'shape_validated') - Number(a.verification?.manifest === 'shape_validated')
        if (delta) return delta
      }
      return (b.stars || 0) - (a.stars || 0)
    })
    return rows.map(p => p.id)
  }
}
