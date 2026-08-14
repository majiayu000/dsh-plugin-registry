export function findPluginById(plugins, requestedId) {
  const normalizedId = String(requestedId || '').trim().toLowerCase()
  if (!normalizedId || !Array.isArray(plugins)) return null
  return plugins.find(plugin => String(plugin?.id || '').toLowerCase() === normalizedId) || null
}
