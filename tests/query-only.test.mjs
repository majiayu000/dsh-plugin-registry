import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSearchDocument } from '../experiments/shared/build-search-index.mjs'
import { queryIndex, QUERY_COLUMN as C } from '../experiments/shared/query-index.js'
import { asciiJson, buildQueryArtifact } from '../experiments/query-only/build.mjs'
import { createWorker } from '../experiments/query-only/handler.js'
import { createOracle } from '../experiments/query-only/oracle.mjs'
import { relevanceScore } from '../assets/registry-search.js'
import { pluginRoute } from '../assets/plugin-route.js'

const GENERATED = '2026-11-07T00:00:00Z'
const SORTS = ['relevance', 'stars', 'forks', 'new', 'added', 'manifest']

function plugin(id, overrides = {}) {
  const [owner, name] = id.split('/')
  return {
    id, name, owner, description: { en: `agent memory ${name}`, zh: `记忆 ${name}` }, category: 'memory',
    stars: 3, forks: 1, language: 'JavaScript', pushedAt: '2026-11-01T00:00:00Z', addedAt: null,
    source: 'discovered', trustLevel: 'manifest_verified', verification: { manifest: 'shape_validated', patch: 'exists' },
    verifiedCommit: null, profile: 'web', packageName: name, topics: ['dsh-plugin'], icon: null, license: 'MIT', ...overrides,
  }
}

// 60 zero-signal listings from one owner (bulk publisher), duplicate copies,
// curated exemptions and varied scores so every listing and sort differs.
function registry() {
  const plugins = []
  for (let i = 0; i < 60; i++) plugins.push(plugin(`bulk/dsh-${i}`, { stars: 0, forks: 0, pushedAt: `2026-10-${String(1 + i % 28).padStart(2, '0')}T00:00:00Z` }))
  for (let i = 0; i < 90; i++) {
    plugins.push(plugin(`owner${i % 9}/Agent-${i}`, {
      stars: (i * 37) % 23, forks: i % 4, category: i % 3 ? 'memory' : 'tools', language: i % 5 ? 'JavaScript' : 'Rust',
      topics: i % 2 ? ['dsh-plugin', 'agent'] : ['agent-tools', 'two\twords'], addedAt: i % 7 ? null : `2026-10-${String(1 + i % 20).padStart(2, '0')}`,
      verification: { manifest: i % 6 ? 'shape_validated' : 'not_checked', patch: 'exists' }, source: i % 10 ? 'discovered' : 'curated',
      verifiedCommit: i % 4 ? 'b'.repeat(40) : null, pushedAt: `2026-0${1 + i % 9}-15T00:00:00Z`,
    }))
  }
  plugins.push(plugin('copy/one', { description: { en: 'same copy' }, name: 'dup', stars: 0 }))
  plugins.push(plugin('copy/two', { description: { en: 'same copy' }, name: 'dup', stars: 5 }))
  return { generatedAt: GENERATED, categories: { memory: { en: 'Memory', zh: '记忆' }, tools: { en: 'Tools', zh: '工具' } }, plugins }
}
const audit = { pendingReview: [
  { id: 'pending/dsh-agent', url: 'https://github.com/pending/dsh-agent', description: { en: 'agent pending' }, topics: ['dsh-plugin'], stars: 9 },
] }

test('listing filter and every sort match the browser order on whole results and bounded pages', () => {
  const data = registry()
  const { index } = buildSearchDocument(data, audit)
  const reference = createOracle(data, audit)
  assert.ok(index.lowSignal.filter(Boolean).length >= 61, 'bulk publisher and duplicate copy are low-signal')
  for (const listing of ['standard', 'low_signal', 'all']) {
    for (const sort of SORTS) {
      for (const q of ['', 'a', 'agent', 'dsh', '记忆', 'two', 'agent-tools', 'agent memory', 'zz']) {
        for (const filters of [{}, { category: 'memory' }, { manifest: 'not_validated' }, { language: 'Rust', source: 'discovered' }]) {
          const options = { q, sort, listing, locale: 'en', ...filters }
          const expected = reference(options)
          const whole = queryIndex(index, { ...options, pageSize: 100000 })
          assert.deepEqual(whole.ids, expected, JSON.stringify(options))
          for (let page = 1; page <= Math.ceil(expected.length / 7) + 1; page++) {
            const result = queryIndex(index, { ...options, page, pageSize: 7 })
            assert.equal(result.total, expected.length)
            assert.deepEqual(result.ids, expected.slice((page - 1) * 7, page * 7), JSON.stringify({ ...options, page }))
          }
        }
      }
    }
  }
})

test('omitting listing keeps the earlier all-entries semantics used by the D1 comparison', () => {
  const data = registry()
  const { index } = buildSearchDocument(data, audit)
  assert.deepEqual(queryIndex(index, { q: 'a', pageSize: 1000 }), queryIndex(index, { q: 'a', listing: 'all', pageSize: 1000 }))
  assert.deepEqual(index.home, index.homes.all)
  assert.ok(index.homes.standard.length < index.homes.all.length)
})

test('stored relevance inputs score exactly like the browser relevanceScore', () => {
  const data = registry()
  const { index } = buildSearchDocument(data, audit)
  const legacy = { ...index, entries: index.entries.map(entry => entry.slice(0, C.topicWords)) }
  for (const q of ['agent', 'a', 'two', 'words', 'agent-tools', 'dsh-plugin', 'bulk/dsh-1', 'dsh-1 agent']) {
    for (const sort of SORTS) {
      const options = { q, sort, listing: 'all', pageSize: 5, page: 2 }
      assert.deepEqual(queryIndex(index, options), queryIndex(legacy, options), JSON.stringify(options))
    }
  }
  // The exact topic word test sees tab-separated words like split(/\s+/).
  const row = index.entries.find(entry => entry[C.topics].includes('\t'))
  assert.equal(row[C.topicWords], ' agent-tools two words ')
  assert.equal(relevanceScore({ id: 'x', name: 'y', owner: 'z', description: '', topics: row[C.topics] }, ['words']), 20)
})

function serve(artifact) {
  const files = new Map([...artifact.files].filter(([path]) => path.startsWith('public/')).map(([path, body]) => [path.slice('public'.length), body]))
  const document = JSON.parse(artifact.files.get('query-document.txt'))
  const worker = createWorker(() => document)
  const calls = []
  const env = { ASSETS: { fetch: async url => {
    const path = new URL(url).pathname
    calls.push(path)
    return files.has(path) ? new Response(files.get(path), { headers: { 'content-type': 'application/json' } }) : new Response('missing', { status: 404 })
  } } }
  const ctx = { waitUntil() {} }
  return { files, calls, document, request: (path, method = 'GET') => worker.fetch(new Request(`https://example.com${path}`, { method }), env, ctx) }
}

test('query-only artifact shares one content version across query document, cards and install detail', async () => {
  const data = registry()
  const artifact = buildQueryArtifact(data, audit)
  assert.match(artifact.version, /^[0-9a-f]{20}$/)
  assert.ok(/^[\x00-\x7f]*$/.test(artifact.files.get('query-document.txt')), 'bundled document is ASCII')
  assert.deepEqual(JSON.parse(asciiJson({ text: '记忆 😀 é' })), { text: '记忆 😀 é' })
  const cardShards = [...artifact.files].filter(([path]) => path.includes('search-cards/'))
  assert.ok(cardShards.every(([path, body]) => path.includes(`/${artifact.version}/`) && JSON.parse(body).version === artifact.version))
  assert.equal(JSON.parse(artifact.files.get('public/data/detail-build.json')).version, artifact.version)
  const changed = registry()
  changed.plugins[70].icon = 'https://avatars.githubusercontent.com/u/1'
  assert.notEqual(buildQueryArtifact(changed, audit).version, artifact.version, 'a card-only change yields a new version')
  assert.equal(buildQueryArtifact(registry(), audit).version, artifact.version, 'same input, same version')
})

test('endpoint pages 30 cards in browser order and serves matching install detail', async () => {
  const data = registry()
  const server = serve(buildQueryArtifact(data, audit))
  const reference = createOracle(data, audit)
  const first = await (await server.request('/api/search?q=agent&listing=all')).json()
  const expected = reference({ q: 'agent', listing: 'all' })
  assert.equal(first.total, expected.length)
  assert.deepEqual(first.items.map(item => item.id), expected.slice(0, 30))
  assert.ok(first.facets.categories.memory > 0 && first.summary.count === data.plugins.length)
  const second = await (await server.request(`/api/search?q=agent&listing=all&page=2&version=${first.version}`)).json()
  assert.deepEqual(second.items.map(item => item.id), expected.slice(30, 60))
  assert.equal(second.facets, undefined)
  const standard = await (await server.request('/api/search')).json()
  assert.deepEqual(standard.items.map(item => item.id), reference({}).slice(0, 30))
  assert.ok(!standard.items.some(item => item.owner === 'bulk'))
  const pending = await (await server.request('/api/search?manifest=not_validated&q=pending')).json()
  assert.equal(pending.items[0].url, 'https://github.com/pending/dsh-agent')

  const item = first.items.find(card => data.plugins.some(p => p.id === card.id))
  const detail = await server.request(`/api/${pluginRoute(item)}`)
  assert.equal(detail.status, 200)
  assert.deepEqual((await detail.json()).plugin, data.plugins.find(p => p.id === item.id))
  assert.equal((await server.request('/api/plugins/missing/plugin/')).status, 404)
})

test('endpoint rejects stale versions, invalid input, and cards from another version', async () => {
  const data = registry()
  const server = serve(buildQueryArtifact(data, audit))
  assert.equal((await server.request('/api/search?q=agent&version=old')).status, 409)
  for (const query of ['listing=hidden', 'category=nope', 'sort=random', 'page=0', 'locale=fr', `q=${'x'.repeat(201)}`]) {
    assert.equal((await server.request(`/api/search?${query}`)).status, 400, query)
  }
  assert.equal(server.calls.length, 0, 'invalid requests read no assets')
  const head = await server.request('/api/search?q=agent', 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assert.equal((await server.request('/api/search', 'POST')).status, 405)

  const [path, body] = [...server.files].find(([p]) => p.includes('search-cards/'))
  server.files.set(path, JSON.stringify({ ...JSON.parse(body), version: 'other' }))
  const mixed = await Promise.all(['', '?sort=stars', '?q=a&listing=all', '?listing=all&page=2'].map(q => server.request(`/api/search${q}`)))
  assert.ok(mixed.some(response => response.status === 503), 'a mixed-version card shard fails instead of mixing content')
  server.files.delete(path)
  const statuses = await Promise.all(['', '?sort=stars', '?q=a&listing=all', '?listing=all&page=2'].map(async q => (await server.request(`/api/search${q}`)).status))
  assert.ok(statuses.includes(503), 'a missing card shard fails without a partial page')
})
