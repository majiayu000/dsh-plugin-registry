import assert from 'node:assert/strict'
import test from 'node:test'
import { handlePluginDetail } from '../functions/lib/plugin-detail.js'

const plugin = { id: 'Acme/repo#包/core', name: 'Test Plugin', owner: 'Acme', url: 'https://github.com/Acme/repo', stars: 1, install: 'dsh plugin add test', description: { en: '</script><script>alert(1)</script>' } }
const document = { schemaVersion: 1, generatedAt: '2026-09-08T00:00:00Z', categories: {}, plugin, related: [] }
const template = '<html><head><title>Plugin</title></head><body><h1 id="plugin-name"></h1></body></html>'
function fixture(path = '/plugins/Acme/repo/%E5%8C%85/core/', { method = 'GET', missing = false, assetStatus = 200 } = {}) {
  const fetched = []
  const writes = []
  const cached = new Map()
  const cache = {
    match: async key => cached.get(key.url)?.clone(),
    put: async (key, response) => { cached.set(key.url, response.clone()); writes.push(key.url) },
  }
  const context = {
    request: new Request('https://example.com' + path, { method }),
    env: { CF_PAGES_COMMIT_SHA: 'deployment-a', ASSETS: { fetch: async input => {
      const path = new URL(input).pathname
      fetched.push(path)
      if (path === '/plugin-detail.html') return new Response(template)
      if (path === '/404.html') return new Response('<h1>Not found</h1>')
      return new Response(JSON.stringify({ homepage: 'https://example.com/', documents: missing ? {} : { [plugin.id.toLowerCase()]: document } }), { status: assetStatus })
    } } },
    waitUntil: promise => writes.push(promise),
  }
  return { context, cache, fetched, writes, cached }
}

test('dynamic HTML contains crawlable content and only fetches a shard and template', async () => {
  const f = fixture()
  const response = await handlePluginDetail(f.context, 'html', f.cache)
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /<h1 id="plugin-name">Test Plugin<\/h1>/)
  assert.match(html, /rel="canonical"/)
  assert.match(html, /application\/ld\+json/)
  assert.match(html, /\\u003c\/script>/)
  assert.match(response.headers.get('cache-control'), /s-maxage=300/)
  assert.equal(f.fetched.length, 2)
  assert.ok(f.fetched.some(path => /^\/data\/plugin-shards\/[a-f0-9]{2}\.json$/.test(path)))
  const warm = await handlePluginDetail(f.context, 'html', f.cache)
  assert.equal(await warm.text(), html)
  assert.equal(f.fetched.length, 2)
})

test('JSON uses the same record, supports HEAD, and does not fetch the page template', async () => {
  const f = fixture('/api/plugins/Acme/repo/%E5%8C%85/core/')
  const response = await handlePluginDetail(f.context, 'json', f.cache)
  assert.deepEqual(await response.json(), document)
  assert.equal(f.fetched.length, 1)
  f.context.request = new Request(f.context.request.url, { method: 'HEAD' })
  const head = await handlePluginDetail(f.context, 'json', f.cache)
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assert.equal(f.fetched.length, 1)
})

test('a missing plugin is 404 and is never cached', async () => {
  for (const format of ['html', 'json']) {
    const f = fixture(format === 'html' ? '/plugins/acme/missing/' : '/api/plugins/acme/missing/', { missing: true })
    const response = await handlePluginDetail(f.context, format, f.cache)
    assert.equal(response.status, 404)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(f.cached.size, 0)
  }
})

test('asset failure is an error rather than a false not-found response', async () => {
  const f = fixture(undefined, { assetStatus: 503 })
  await assert.rejects(handlePluginDetail(f.context, 'html', f.cache), /503/)
  assert.equal(f.cached.size, 0)
})

test('canonical casing and trailing slash redirect; malformed paths never load assets', async () => {
  const f = fixture('/plugins/acme/repo/%E5%8C%85/core')
  const response = await handlePluginDetail(f.context, 'html', f.cache)
  assert.equal(response.status, 308)
  assert.equal(response.headers.get('location'), 'https://example.com/plugins/Acme/repo/%E5%8C%85/core/')
  for (const path of ['/plugins/acme/repo/%ZZ/', '/plugins/acme/repo/a%2Fb/']) {
    const invalid = fixture(path)
    const response = await handlePluginDetail(invalid.context, 'html', invalid.cache)
    assert.equal(response.status, 400)
    assert.equal(invalid.fetched.length, 0)
  }
  const post = fixture(undefined, { method: 'POST' })
  assert.equal((await handlePluginDetail(post.context, 'html', post.cache)).status, 405)
  assert.equal(post.fetched.length, 0)
})


test('a new deployment cannot reuse old cached HTML or data', async () => {
  const f = fixture()
  await handlePluginDetail(f.context, 'html', f.cache)
  assert.equal(f.fetched.length, 2)
  f.context.env.CF_PAGES_COMMIT_SHA = 'deployment-b'
  await handlePluginDetail(f.context, 'html', f.cache)
  assert.equal(f.fetched.length, 4)
  assert.equal(f.cached.size, 2)
})

test('a cold HEAD stores a complete representation for the following GET', async () => {
  const f = fixture(undefined, { method: 'HEAD' })
  assert.equal(await (await handlePluginDetail(f.context, 'html', f.cache)).text(), '')
  f.context.request = new Request(f.context.request.url)
  assert.match(await (await handlePluginDetail(f.context, 'html', f.cache)).text(), /Test Plugin/)
  assert.equal(f.fetched.length, 2)
})

test('malformed shard JSON and records fail clearly and are not cached', async () => {
  for (const body of ['{', '{}', JSON.stringify({homepage:'https://example.com/',documents:[]}),
    JSON.stringify({ homepage:'https://example.com/', documents: { [plugin.id.toLowerCase()]: { plugin: { id:'wrong/plugin' } } } })]) {
    const f = fixture('/api/plugins/Acme/repo/%E5%8C%85/core/')
    f.context.env.ASSETS.fetch = async () => new Response(body)
    await assert.rejects(handlePluginDetail(f.context, 'json', f.cache))
    assert.equal(f.cached.size, 0)
  }
})
