import assert from 'node:assert/strict'
import test from 'node:test'
import { handleLegacyPluginDetail } from '../functions/lib/legacy-plugin-detail.js'

function legacyContext(url) {
  let continued = false
  return {
    context: {
      request: new Request(url),
      next() {
        continued = true
        return new Response('legacy page')
      },
    },
    wasContinued: () => continued,
  }
}

test('legacy plugin detail redirects directly to the static canonical route', async () => {
  const { context, wasContinued } = legacyContext('https://plugin.dshdesk.com/plugin-detail.html?plugin=Nwflower%2Fdsh-chat-import')
  const response = await handleLegacyPluginDetail(context)

  assert.equal(response.status, 308)
  assert.equal(response.headers.get('location'), 'https://plugin.dshdesk.com/plugins/Nwflower/dsh-chat-import/')
  assert.equal(response.headers.get('cache-control'), 'public, max-age=3600')
  assert.equal(wasContinued(), false)
})

test('qualified plugin ids use the same nested route as generated SEO pages', async () => {
  const { context } = legacyContext('https://plugin.dshdesk.com/plugin-detail?plugin=zhu1090093659%2Fdsh-web-ui%23packages%2Fdsh-web-ui-all')
  const response = await handleLegacyPluginDetail(context)

  assert.equal(response.headers.get('location'), 'https://plugin.dshdesk.com/plugins/zhu1090093659/dsh-web-ui/packages/dsh-web-ui-all/')
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
