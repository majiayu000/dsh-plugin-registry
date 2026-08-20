import { pluginRouteFromId } from '../../assets/plugin-route.js'

export async function handleLegacyPluginDetail(context) {
  const requestUrl = new URL(context.request.url)
  const route = pluginRouteFromId(requestUrl.searchParams.get('plugin'))
  if (!route) return context.next()

  const target = new URL(`/${route}`, requestUrl.origin)
  return new Response(null, {
    status: 308,
    headers: {
      location: target.href,
      'cache-control': 'public, max-age=3600',
    },
  })
}
