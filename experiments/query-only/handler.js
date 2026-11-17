import { queryIndex } from '../shared/query-index.js'
import { searchCardShardFilename } from '../in-memory/card-shard.js'
import { handlePluginDetail } from '../../functions/lib/plugin-detail.js'

export const PAGE_SIZE = 30
const LISTINGS = ['standard', 'low_signal', 'all']
const SORTS = ['relevance', 'stars', 'forks', 'new', 'added', 'manifest']

/** Parse browser URL state; defaults match page-browse.js (listing=standard). */
export function searchOptions(url, build) {
  const value = key => (url.searchParams.get(key) || '').trim()
  const options = {
    q: value('q'), category: value('category') || 'all', source: value('source') || 'all',
    manifest: value('manifest') || 'all', language: value('language') || 'all',
    listing: value('listing') || 'standard', sort: value('sort') || 'relevance',
    locale: value('locale') || 'zh', page: Number(value('page') || 1), pageSize: PAGE_SIZE,
  }
  if (options.q.length > 200 || options.language.length > 100
    || !Number.isSafeInteger(options.page) || options.page < 1 || options.page > 100000
    || (options.category !== 'all' && !Object.hasOwn(build.categories, options.category))
    || !['all', 'curated', 'discovered'].includes(options.source)
    || !['all', 'shape_validated', 'not_checked', 'not_validated'].includes(options.manifest)
    || !LISTINGS.includes(options.listing) || !SORTS.includes(options.sort)
    || !['zh', 'en'].includes(options.locale)) return null
  return options
}

function json(value, status, head, extra = {}) {
  return new Response(head ? null : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
  })
}

async function cardShard(env, requestUrl, build, shard) {
  const response = await env.ASSETS.fetch(new URL(`/${build.cards}${shard}.json`, requestUrl))
  if (!response.ok) throw new Error(`Search card shard ${shard}: HTTP ${response.status}`)
  const document = await response.json()
  // Cards and query results must come from one content version.
  if (document?.version !== build.version) throw new Error(`Search card shard ${shard} has version ${document?.version}`)
  return document.plugins
}

/** GET/HEAD /api/search: one 30-result page; no response cache (measured uncached). */
export async function handleSearch(request, env, document) {
  const head = request.method === 'HEAD'
  if (request.method !== 'GET' && !head) return json({ error: 'Method not allowed' }, 405, head, { allow: 'GET, HEAD' })
  const { build, index } = document
  const url = new URL(request.url)
  const options = searchOptions(url, build)
  if (!options) return json({ error: 'Invalid search parameters' }, 400, head)
  if (url.searchParams.has('version') && url.searchParams.get('version') !== build.version) {
    return json({ error: 'Directory updated; restart pagination', version: build.version }, 409, head)
  }
  try {
    const result = queryIndex(index, options)
    const shards = [...new Set(result.ids.map(searchCardShardFilename))]
    const loaded = new Map(await Promise.all(shards.map(async shard => [shard, await cardShard(env, request.url, build, shard)])))
    const items = result.ids.map(id => {
      const card = loaded.get(searchCardShardFilename(id))?.[id.toLowerCase()]
      if (card?.id !== id) throw new Error(`Search result card ${id} is missing`)
      return card
    })
    const listing = build.listings[options.listing]
    return json({
      version: build.version, generatedAt: build.generatedAt, rankingAt: new Date(build.rankingAt).toISOString(),
      total: result.total, page: options.page, pageSize: PAGE_SIZE, items,
      ...(options.page === 1 ? { summary: listing.summary, facets: { categories: listing.categories, languages: listing.languages } } : {}),
    }, 200, head)
  } catch (error) {
    console.error('Search unavailable', error)
    return json({ error: 'Search temporarily unavailable' }, 503, head)
  }
}

const noCache = { match: async () => undefined, put: async () => {} }

/** Worker fetch handler shared by the eager and lazy entry points. */
export function createWorker(getDocument) {
  return {
    async fetch(request, env, ctx) {
      const { pathname } = new URL(request.url)
      if (pathname === '/api/search') return handleSearch(request, env, getDocument())
      // Install-detail lookup uses the unchanged production route over shards
      // written with the same content version (detail-build.json).
      if (pathname.startsWith('/api/plugins/')) {
        try {
          return await handlePluginDetail({ request, env, waitUntil: promise => ctx.waitUntil(promise) }, 'json', noCache)
        } catch (error) {
          console.error('Plugin detail unavailable', error)
          return json({ error: 'Plugin detail temporarily unavailable' }, 500, request.method === 'HEAD')
        }
      }
      return json({ error: 'Not found' }, 404, request.method === 'HEAD')
    },
  }
}
