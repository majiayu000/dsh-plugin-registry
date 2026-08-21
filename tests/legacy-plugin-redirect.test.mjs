import assert from 'node:assert/strict'
import test from 'node:test'
import { handleLegacyPluginDetail } from '../functions/lib/legacy-plugin-detail.js'

const PLUGINS = [
  { id: 'Nwflower/dsh-chat-import' },
  { id: 'zhu1090093659/dsh-web-ui#packages/dsh-web-ui-all' },
  { id: 'acme/repo#~weird~name' },
]

function legacyContext(url, { plugins = PLUGINS, registryStatus = 200 } = {}) {
  let continued = false
  const assetRequests = []
  return {
    context: {
      request: new Request(url),
      env: {
        ASSETS: {
          fetch(input) {
            assetRequests.push(String(input))
            return new Response(JSON.stringify({ plugins }), {
              status: registryStatus,
              headers: { 'content-type': 'application/json' },
            })
          },
        },
      },
      next() {
        continued = true
        return new Response('legacy page')
      },
    },
    assetRequests,
    wasContinued: () => continued,
  }
}

test('legacy plugin detail redirects directly to the static canonical route', async () => {
  const { context, assetRequests, wasContinued } = legacyContext('https://plugin.dshdesk.com/plugin-detail.html?plugin=Nwflower%2Fdsh-chat-import')
  const response = await handleLegacyPluginDetail(context)

  assert.equal(response.status, 308)
  assert.equal(response.headers.get('location'), 'https://plugin.dshdesk.com/plugins/Nwflower/dsh-chat-import/')
  assert.equal(response.headers.get('cache-control'), 'public, max-age=3600')
  assert.deepEqual(assetRequests, ['https://plugin.dshdesk.com/data/plugins.json'])
  assert.equal(wasContinued(), false)
})

test('qualified plugin ids use the same nested route as generated SEO pages', async () => {
  const { context } = legacyContext('https://plugin.dshdesk.com/plugin-detail?plugin=zhu1090093659%2Fdsh-web-ui%23packages%2Fdsh-web-ui-all')
  const response = await handleLegacyPluginDetail(context)

  assert.equal(response.headers.get('location'), 'https://plugin.dshdesk.com/plugins/zhu1090093659/dsh-web-ui/packages/dsh-web-ui-all/')
})

test('legacy plugin detail resolves canonical registry casing before redirecting', async () => {
  const { context } = legacyContext('https://plugin.dshdesk.com/plugin-detail?plugin=nwflower%2FDSH-CHAT-IMPORT')
  const response = await handleLegacyPluginDetail(context)

  assert.equal(response.headers.get('location'), 'https://plugin.dshdesk.com/plugins/Nwflower/dsh-chat-import/')
})

test('registry-valid qualifier characters are encoded without rejecting the redirect', async () => {
  const { context } = legacyContext('https://plugin.dshdesk.com/plugin-detail?plugin=acme%2Frepo%23~weird~name')
  const response = await handleLegacyPluginDetail(context)

  assert.equal(response.headers.get('location'), 'https://plugin.dshdesk.com/plugins/acme/repo/~weird~name/')
})

test('missing or malformed plugin ids keep the legacy page behavior', async () => {
  for (const url of [
    'https://plugin.dshdesk.com/plugin-detail',
    'https://plugin.dshdesk.com/plugin-detail?plugin=../secrets',
    'https://plugin.dshdesk.com/plugin-detail?plugin=owner%2Frepo%23..%2Fsecret',
  ]) {
    const { context, wasContinued } = legacyContext(url)
    const response = await handleLegacyPluginDetail(context)
    assert.equal(await response.text(), 'legacy page')
    assert.equal(wasContinued(), true)
  }
})

test('a missing registry asset fails clearly instead of caching an unverified redirect', async () => {
  const { context } = legacyContext('https://plugin.dshdesk.com/plugin-detail?plugin=acme%2Frepo', { registryStatus: 503 })

  await assert.rejects(handleLegacyPluginDetail(context), /Unable to load the plugin registry: HTTP 503/)
})
