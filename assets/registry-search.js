export function createPluginSearchIndex(plugins, searchableText) {
  return plugins.map(function (plugin) {
    return {
      plugin,
      text: String(searchableText(plugin)).toLowerCase(),
      id: String(plugin.id || '').toLowerCase(),
      name: String(plugin.name || '').toLowerCase(),
      owner: String(plugin.owner || '').toLowerCase(),
      description: Object.values(plugin.description || {}).join(' ').toLowerCase(),
      topics: (plugin.topics || []).join(' ').toLowerCase(),
    }
  })
}

function relevanceScore(entry, terms) {
  return terms.reduce(function (score, term) {
    if (entry.id === term || entry.name === term) return score + 120
    if (entry.name.startsWith(term)) score += 70
    else if (entry.name.includes(term)) score += 45
    if (entry.id.startsWith(term)) score += 35
    else if (entry.id.includes(term)) score += 24
    if (entry.topics.split(/\s+/).includes(term)) score += 20
    else if (entry.topics.includes(term)) score += 12
    if (entry.owner.includes(term)) score += 10
    if (entry.description.includes(term)) score += 8
    return score
  }, 0)
}

function defaultTier(plugin) {
  return plugin.trustLevel === 'pending_review' ? 1 : 0
}

export function compareDefaultPluginOrder(a, b) {
  return defaultTier(a) - defaultTier(b)
    || (b.stars || 0) - (a.stars || 0)
    || String(a.id || '').localeCompare(String(b.id || ''))
}

export function filterPluginSearchIndex(index, options = {}) {
  const category = options.category || 'all'
  const query = String(options.query || '').trim().toLowerCase()
  const queryTerms = query.split(/\s+/).filter(Boolean)
  const curatedOnly = Boolean(options.curatedOnly)
  const source = options.source || 'all'
  const manifest = options.manifest || 'all'

  return index.filter(function (entry) {
    const plugin = entry.plugin
    if (category !== 'all' && plugin.category !== category) return false
    if (curatedOnly && plugin.source !== 'curated') return false
    if (source !== 'all' && plugin.source !== source) return false
    if (manifest !== 'all' && (!plugin.verification || plugin.verification.manifest !== manifest)) return false
    return !queryTerms.length || queryTerms.every(function (term) { return entry.text.includes(term) })
  }).sort(function (a, b) {
    if (!queryTerms.length) return 0
    return relevanceScore(b, queryTerms) - relevanceScore(a, queryTerms)
      || (b.plugin.stars || 0) - (a.plugin.stars || 0)
      || a.plugin.id.localeCompare(b.plugin.id)
  }).map(function (entry) {
    return entry.plugin
  })
}
