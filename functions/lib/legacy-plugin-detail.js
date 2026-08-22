import { findPluginById } from '../../assets/plugin-detail.js'
import { pluginRouteFromId } from '../../assets/plugin-route.js'

async function canonicalPluginId(context, requestedId) {
  if (!context.env?.ASSETS?.fetch) throw new Error('Unable to load the plugin registry: ASSETS binding is unavailable.')
  const registryUrl = new URL('/data/plugins.json', context.request.url)
  const response = await context.env.ASSETS.fetch(registryUrl)
  if (!response.ok) throw new Error(`Unable to load the plugin registry: HTTP ${response.status}.`)

  const registry = await response.json().catch(() => {
    throw new Error('Unable to load the plugin registry: response is not valid JSON.')
  })
  if (!Array.isArray(registry?.plugins)) throw new Error('Unable to load the plugin registry: plugins must be an array.')
  return findPluginById(registry.plugins, requestedId)?.id || requestedId
}

export async function handleLegacyPluginDetail(context) {
  const requestUrl = new URL(context.request.url)
  const requestedId = requestUrl.searchParams.get('plugin')
  if (!pluginRouteFromId(requestedId)) return context.next()

  const canonicalId = await canonicalPluginId(context, requestedId)
  const route = pluginRouteFromId(canonicalId)
  if (!route) throw new Error(`Unable to redirect legacy plugin id: invalid canonical id ${canonicalId}.`)

  const target = new URL(`/${route}`, requestUrl.origin)
  return new Response(null, {
    status: 308,
    headers: {
      location: target.href,
      'cache-control': 'public, max-age=3600',
    },
  })
}
