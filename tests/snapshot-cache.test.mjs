import assert from 'node:assert/strict'
import test from 'node:test'

class MemoryCache {
  constructor() {
    this.store = new Map()
  }

  async put(request, response) {
    this.store.set(String(request), response.clone())
  }

  async match(request) {
    const hit = this.store.get(String(request))
    return hit ? hit.clone() : undefined
  }

  async delete(request) {
    return this.store.delete(String(request))
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const published = {
  id: 'acme/live-plugin',
  name: 'live-plugin',
  owner: 'acme',
  url: 'https://github.com/acme/live-plugin',
  description: { zh: '', en: '' },
  category: 'tools',
  topics: [],
  stars: 1,
  forks: 0,
  source: 'curated',
  trustLevel: 'curated',
  verification: { manifest: 'not_checked', patch: 'not_checked', installation: 'not_tested' },
}

const stalePending = {
  id: 'acme/dsh-stale-candidate',
  name: 'dsh-stale-candidate',
  url: 'https://github.com/acme/dsh-stale-candidate',
  topics: ['dsh'],
}

function installBrowserGlobals(fetchImpl) {
  const buckets = new Map()
  globalThis.window = globalThis
  globalThis.HR_DEFER_REGISTRY = true
  globalThis.document = {
    baseURI: 'https://plugin.dshdesk.com/',
    documentElement: { classList: { add() {}, remove() {}, toggle() {} } },
    querySelectorAll() { return [] },
    getElementById() { return null },
    body: { appendChild() {} },
  }
  globalThis.caches = {
    async open(name) {
      if (!buckets.has(name)) buckets.set(name, new MemoryCache())
      return buckets.get(name)
    },
  }
  globalThis.fetch = fetchImpl
}

test('a failed audit fetch cannot be served from an older cache entry', async () => {
  const nextVersion = '2026-08-17T00:00:00.000Z'
  installBrowserGlobals(async (input) => {
    const url = String(input)
    if (url.includes('registry-audit.json')) return new Response('missing', { status: 404 })
    if (url.includes('version.json')) return jsonResponse({ schemaVersion: 1, generatedAt: nextVersion })
    if (url.includes('plugins.json')) {
      return jsonResponse({ generatedAt: nextVersion, plugins: [published], categories: {}, stats: {} })
    }
    return new Response('not found', { status: 404 })
  })

  await import('../assets/plugins.js')
  const HR = globalThis.HR
  const cache = await caches.open('harness-registry-snapshot-v1')
  await cache.put('https://plugin.dshdesk.com/data/version.json', jsonResponse({
    schemaVersion: 1,
    generatedAt: '2026-08-16T00:00:00.000Z',
  }))
  await cache.put('https://plugin.dshdesk.com/data/plugins.json', jsonResponse({
    generatedAt: '2026-08-16T00:00:00.000Z',
    plugins: [published],
  }))
  await cache.put('https://plugin.dshdesk.com/data/registry-audit.json', jsonResponse({
    pendingReview: [stalePending],
  }))

  await HR.loadRegistry()
  assert.equal(HR.PENDING.length, 0)

  await HR.loadRegistry()
  assert.equal(HR.PENDING.length, 0)
})
