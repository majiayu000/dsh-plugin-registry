const PLUGIN_ID_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:#[A-Za-z0-9._/-]+)?$/

export function pluginRouteFromId(pluginId) {
  const normalizedId = String(pluginId || '').trim()
  if (!PLUGIN_ID_PATTERN.test(normalizedId)) return null

  const [repository, qualifier] = normalizedId.split('#', 2)
  const segments = repository.split('/').concat(qualifier ? qualifier.split('/') : [])
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return null
  return `plugins/${segments.map(segment => encodeURIComponent(segment)).join('/')}/`
}

export function pluginRoute(plugin) {
  const route = pluginRouteFromId(plugin?.id)
  if (!route) throw new Error(`Invalid plugin id: ${plugin?.id ?? ''}`)
  return route
}
