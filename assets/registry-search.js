export function createPluginSearchIndex(plugins, searchableText) {
  return plugins.map(function (plugin) {
    return {
      plugin,
      text: String(searchableText(plugin)).toLowerCase(),
    }
  })
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
  }).map(function (entry) {
    return entry.plugin
  })
}
