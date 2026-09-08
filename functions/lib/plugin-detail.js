import { pluginPathSegmentsFromId, pluginRoute, pluginShardFilename } from '../../assets/plugin-route.js'
import { renderPluginPage } from '../../scripts/render-plugin-page.mjs'

const headers = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
}

async function asset(context, path) {
  const response = await context.env.ASSETS.fetch(new URL(path, context.request.url))
  if (!response.ok) throw new Error(`Plugin detail asset ${path}: HTTP ${response.status}`)
  return response
}

export async function handlePluginDetail(context, format, cache = caches.default) {
  const { request } = context
  const head = request.method === 'HEAD'
  const respond = (body, status, extra = {}) => new Response(head ? null : body, {
    status, headers: { ...headers, 'cache-control': 'no-store', ...extra },
  })
  if (request.method !== 'GET' && !head) return respond('Method not allowed', 405, { allow: 'GET, HEAD' })
  const url = new URL(request.url)
  const prefix = format === 'json' ? '/api/plugins/' : '/plugins/'
  let parts
  try {
    parts = url.pathname.slice(prefix.length).replace(/\/$/, '').split('/').map(decodeURIComponent)
  } catch {
    return respond('Malformed plugin path', 400)
  }
  const [owner, repo, ...qualifier] = parts
  const id = `${owner}/${repo}${qualifier.length ? '#' + qualifier.join('/') : ''}`
  const valid = pluginPathSegmentsFromId(id)
  if (!url.pathname.startsWith(prefix) || !valid || valid.length !== parts.length || valid.some((part, i) => part !== parts[i])) {
    return respond('Malformed plugin path', 400)
  }
  // Ignore query parameters: these representations depend only on the plugin path.
  url.search = ''
  const build = await (await asset(context, '/data/detail-build.json')).json()
  if (typeof build?.version !== 'string' || !build.version) throw new Error('Invalid plugin detail build version')
  url.searchParams.set('__deployment', build.version)
  const key = new Request(url, { method: 'GET' })
  const hit = await cache.match(key)
  if (hit) return head ? new Response(null, hit) : hit

  const shard = await (await asset(context, `/data/plugin-shards/${pluginShardFilename(id)}.json`)).json()
  if (!shard?.documents || typeof shard.documents !== 'object' || Array.isArray(shard.documents) || typeof shard.homepage !== 'string') {
    throw new Error('Invalid plugin detail shard')
  }
  const data = Object.hasOwn(shard.documents, id.toLowerCase()) ? shard.documents[id.toLowerCase()] : null
  if (!data) {
    if (format === 'json') return respond(JSON.stringify({ error: 'Plugin not found' }), 404, { 'content-type': 'application/json; charset=utf-8' })
    return respond(await (await asset(context, '/404.html')).text(), 404, { 'content-type': 'text/html; charset=utf-8' })
  }
  if (data.plugin?.id?.toLowerCase() !== id.toLowerCase()) throw new Error('Invalid plugin detail record')
  const canonicalPath = '/' + pluginRoute(data.plugin)
  if (format === 'html' && url.pathname !== canonicalPath) {
    return respond(null, 308, { location: new URL(canonicalPath, url).href })
  }
  const body = format === 'json' ? JSON.stringify(data) : renderPluginPage(
    await (await asset(context, '/plugin-detail.html')).text(), data.plugin, shard.homepage, data,
  )
  const response = new Response(body, {
    headers: {
      ...headers,
      'content-type': format === 'json' ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300',
    },
  })
  context.waitUntil(cache.put(key, response.clone()).catch(error => console.error('Plugin detail cache write failed', error)))
  return head ? new Response(null, response) : response
}
