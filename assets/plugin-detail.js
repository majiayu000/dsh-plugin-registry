export function findPluginById(plugins, requestedId) {
  const normalizedId = String(requestedId || '').trim().toLowerCase()
  if (!normalizedId || !Array.isArray(plugins)) return null
  return plugins.find(plugin => String(plugin?.id || '').toLowerCase() === normalizedId) || null
}

export function readPluginDocument(document, requestedId) {
  const element = document.getElementById('plugin-data')
  if (!element) throw new Error('Missing embedded plugin data')
  const data = JSON.parse(element.textContent)
  if (!data?.plugin || !findPluginById([data.plugin], requestedId)) {
    throw new Error('Invalid embedded plugin data')
  }
  return data
}
