import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSearchDocument } from '../scripts/build-search-index.mjs'
import { handleSearch } from '../functions/lib/search.js'
import { searchCardShardFilename } from '../assets/plugin-route.js'

let sequence = 0
function fixture(count = 65) {
  const version = `search-test-${++sequence}`
  const registry = {
    generatedAt: '2026-11-07T00:00:00Z', categories: { tools: { zh: '工具', en: 'Tools' } },
    plugins: Array.from({ length: count }, (_, i) => ({
      id: `owner${i}/plugin`, name: `Plugin ${i}`, owner: `owner${i}`, category: 'tools',
      description: { zh: '工具', en: 'Tool' }, source: 'discovered', trustLevel: 'manifest_verified',
      stars: i, forks: 0, profile: 'web', verification: { manifest: 'shape_validated', patch: 'exists' },
    })),
  }
  const { index, cards } = buildSearchDocument(registry, { pendingReview: [] })
  const files = new Map()
  const state = { document: { index, build: { version, cards: `${version}/`, generatedAt: registry.generatedAt, categories: registry.categories, summary: { count }, facets: {} } } }
  for (const [id, card] of Object.entries(cards)) {
    const path = `/data/${version}/${searchCardShardFilename(id)}.json`
    if (!files.has(path)) files.set(path, { plugins: {} })
    files.get(path).plugins[id] = card
  }
  const responses = new Map()
  const calls = []
  const cache = { match: async key => responses.get(key.url)?.clone(), put: async (key, value) => responses.set(key.url, value) }
  const waits = []
  async function request(query = '', method = 'GET') {
    const response = await handleSearch({
      request: new Request(`https://example.com/api/search${query}`, { method }),
      env: { ASSETS: { fetch: async url => {
        const path = new URL(url).pathname
        calls.push(path)
        return files.has(path) ? Response.json(files.get(path)) : new Response('missing', { status: 404 })
      } } },
      waitUntil: promise => waits.push(promise),
    }, state.document, cache)
    await Promise.all(waits)
    return response
  }
  return { version, files, calls, responses, request, state }
}

test('search returns bounded pages in full-result order and reuses the loaded index', async () => {
  const f = fixture()
  const first = await (await f.request('?sort=stars')).json()
  assert.equal(first.total, 65)
  assert.equal(first.items.length, 30)
  assert.equal(first.items[0].id, 'owner64/plugin')
  const second = await (await f.request(`?sort=stars&page=2&version=${f.version}`)).json()
  assert.equal(second.items.length, 30)
  assert.equal(second.items[0].id, 'owner34/plugin')
  assert.equal(new Set([...first.items, ...second.items].map(p => p.id)).size, 60)
  assert.ok(f.calls.every(path => path.startsWith(`/data/${f.version}/`)), 'only selected cards are fetched')
  assert.equal((await (await f.request('?sort=stars&page=3')).json()).items.length, 5)
})

test('search validates request parameters before any asset access', async () => {
  const f = fixture()
  for (const query of ['?page=0', '?page=1.5', '?sort=unknown', '?locale=xx', '?q=' + 'x'.repeat(201)]) {
    assert.equal((await f.request(query)).status, 400)
  }
  assert.equal((await f.request('', 'POST')).status, 405)
  assert.deepEqual(f.calls, [])
})

test('a changed content version cannot mix pages or return an old cached result', async () => {
  const f = fixture()
  await f.request('')
  const before = f.calls.length
  const stale = await f.request('?page=2&version=old')
  assert.equal(stale.status, 409)
  assert.equal((await stale.json()).version, f.version)
  assert.equal(f.calls.length, before)
  const next = fixture(1)
  f.state.document = next.state.document
  f.files.clear()
  for (const [path, document] of next.files) f.files.set(path, document)
  const updated = await (await f.request('')).json()
  assert.equal(updated.version, next.version)
  assert.equal(updated.total, 1)
  assert.equal(updated.items.length, 1)
})

test('missing result cards fail clearly without publishing a partial page', async () => {
  const f = fixture()
  const path = `/data/${f.version}/${searchCardShardFilename('owner64/plugin')}.json`
  const missing = f.files.get(path)
  f.files.delete(path)
  assert.equal((await f.request('?sort=stars')).status, 503)
  assert.equal(f.responses.size, 0)
  f.files.set(path, missing)
  assert.equal((await f.request('?sort=stars')).status, 200)
})

test('HEAD responses have no body and cannot poison the GET cache', async () => {
  const f = fixture()
  assert.equal(await (await f.request('', 'HEAD')).text(), '')
  assert.equal((await (await f.request('')).json()).total, 65)
  assert.equal(await (await f.request('', 'HEAD')).text(), '')
})
