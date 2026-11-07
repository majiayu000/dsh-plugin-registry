import { requestOptions, search } from './query.js'

export default {
  async fetch(request, env) {
    const head = request.method === 'HEAD'
    const respond = (body, status) => new Response(head ? null : JSON.stringify(body), { status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
    if (!['GET', 'HEAD'].includes(request.method)) return respond({ error: 'Method not allowed' }, 405)
    const url = new URL(request.url)
    if (url.pathname !== '/api/search') return respond({ error: 'Not found' }, 404)
    const options = requestOptions(url)
    if (!options) return respond({ error: 'Invalid search parameters' }, 400)
    try {
      const { status = 200, ...body } = await search(env.DB, options)
      return respond(body, status)
    } catch (error) {
      console.error('D1 experiment query failed', error)
      return respond({ error: 'Search temporarily unavailable' }, 503)
    }
  },
}
