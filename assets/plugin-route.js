const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

export function pluginPathSegmentsFromId(pluginId) {
  const normalizedId = String(pluginId ?? '').trim()
  const qualifierSeparator = normalizedId.indexOf('#')
  const repository = qualifierSeparator === -1 ? normalizedId : normalizedId.slice(0, qualifierSeparator)
  const qualifier = qualifierSeparator === -1 ? '' : normalizedId.slice(qualifierSeparator + 1)
  if (!REPOSITORY_PATTERN.test(repository)) return null
  if (qualifierSeparator !== -1 && (!qualifier || qualifier.includes('#'))) return null

  const segments = repository.split('/').concat(qualifier ? qualifier.split('/') : [])
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return null
  return segments
}

export function pluginRouteFromId(pluginId) {
  const segments = pluginPathSegmentsFromId(pluginId)
  return segments ? `plugins/${segments.map(segment => encodeURIComponent(segment)).join('/')}/` : null
}

export function pluginPathSegments(plugin) {
  const segments = pluginPathSegmentsFromId(plugin?.id)
  if (!segments) throw new Error(`Invalid plugin id: ${plugin?.id ?? ''}`)
  return segments
}

export function pluginRoute(plugin) {
  const route = pluginRouteFromId(plugin?.id)
  if (!route) throw new Error(`Invalid plugin id: ${plugin?.id ?? ''}`)
  return route
}
