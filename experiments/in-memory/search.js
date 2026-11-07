import { queryIndex } from '../shared/query-index.js'
import { searchCardShardFilename } from './card-shard.js'

function optionsFrom(url) {
  const value = key => (url.searchParams.get(key) || '').trim()
  const options = {
    q: value('q'), category: value('category') || 'all',
    source: value('source') || 'all', manifest: value('manifest') || 'all',
    language: value('language') || 'all', sort: value('sort') || 'relevance',
    locale: value('locale') || 'zh', page: Number(value('page') || 1), pageSize: 30,
  }
  if (options.q.length > 200 || options.category.length > 100 || options.language.length > 100
    || !Number.isSafeInteger(options.page) || options.page < 1 || options.page > 100000
    || !['all', 'curated', 'discovered'].includes(options.source)
    || !['all', 'shape_validated', 'not_checked', 'not_validated'].includes(options.manifest)
    || !['relevance', 'stars', 'forks', 'new', 'added', 'manifest'].includes(options.sort)
    || !['zh', 'en'].includes(options.locale)) return null
  return options
}

async function asset(context, path) {
  const response = await context.env.ASSETS.fetch(new URL(`/data/${path}`, context.request.url))
  if (!response.ok) throw new Error(`Search asset unavailable: HTTP ${response.status}`)
  return response.json()
}

export async function handleSearch(context, document, cache = caches.default) {
  const { request } = context
  const head = request.method === 'HEAD'
  const respond = (value, status = 200, extra = {}) => new Response(head ? null : JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
  })
  if (request.method !== 'GET' && !head) return respond({ error: 'Method not allowed' }, 405, { allow: 'GET, HEAD' })
  const url = new URL(request.url)
  const options = optionsFrom(url)
  if (!options) return respond({ error: 'Invalid search parameters' }, 400)

  try {
    const build = document.build
    if (url.searchParams.has('version') && url.searchParams.get('version') !== build.version) {
      return respond({ error: 'Directory updated; restart pagination', version: build.version }, 409)
    }
    const keyUrl = new URL('/api/search', url)
    for (const [key, value] of Object.entries(options)) keyUrl.searchParams.set(key, String(value))
    keyUrl.searchParams.set('version', build.version)
    const key = new Request(keyUrl)
    const cached = await cache.match(key)
    if (cached) return head ? new Response(null, cached) : cached

    const result = queryIndex(document.index, options)
    const shards = [...new Set(result.ids.map(searchCardShardFilename))]
    const documents = new Map(await Promise.all(shards.map(async shard => [shard, await asset(context, `${build.cards}${shard}.json`)])))
    const items = result.ids.map(id => {
      const card = documents.get(searchCardShardFilename(id))?.plugins?.[id.toLowerCase()]
      if (card?.id?.toLowerCase() !== id.toLowerCase()) throw new Error('Search result card is missing')
      return card
    })
    const response = respond({
      version: build.version, generatedAt: build.generatedAt,
      total: result.total, page: options.page, pageSize: options.pageSize, items,
      categories: build.categories, summary: build.summary, facets: build.facets,
    }, 200, { 'cache-control': 'public, max-age=0, s-maxage=300' })
    // A HEAD miss must cache the complete representation, not an empty body.
    if (!head) context.waitUntil(cache.put(key, response.clone()).catch(error => console.error('Search response cache failed', error)))
    return response
  } catch (error) {
    console.error('Search unavailable', error)
    return respond({ error: 'Search temporarily unavailable' }, 503)
  }
}
