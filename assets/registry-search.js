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
  const curatedOnly = Boolean(options.curatedOnly)

  return index.filter(function (entry) {
    const plugin = entry.plugin
    if (category !== 'all' && plugin.category !== category) return false
    if (curatedOnly && plugin.source !== 'curated') return false
    return !query || entry.text.includes(query)
  }).map(function (entry) {
    return entry.plugin
  })
}
