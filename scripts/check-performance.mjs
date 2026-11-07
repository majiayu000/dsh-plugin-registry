import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'
import { preview } from 'vite'
import { chromium } from '@playwright/test'
import { renderPluginPage } from './render-plugin-page.mjs'
import { pluginShardFilename } from '../assets/plugin-route.js'

const distDir = resolve(process.argv[2] || 'dist')
const [home, dashboard, registry] = await Promise.all([
  readFile(join(distDir, 'index.html'), 'utf8'),
  readFile(join(distDir, 'dashboard.html'), 'utf8'),
  readFile(resolve('public/data/plugins.json'), 'utf8').then(JSON.parse),
])

assert.match(home, /data-registry-prerendered="true"/, 'homepage must be statically rendered')
assert.ok((home.match(/data-prerendered-row/g) || []).length >= 8, 'homepage must contain useful rows before JavaScript')
assert.doesNotMatch(home, /id="st-(?:count|stars|author|auto)">—</, 'homepage statistics must not be loading placeholders')
assert.doesNotMatch(home, /fonts\.(?:googleapis|gstatic)\.com/, 'first paint must not depend on third-party fonts')
assert.match(dashboard, /data-registry-prerendered="true"/, 'dashboard must be statically rendered')
assert.doesNotMatch(dashboard, /id="k-(?:stars|count|author|auto)">—</, 'dashboard statistics must not be loading placeholders')

const browseMatch = home.match(/data-registry-src="data\/(browse-[0-9a-f]{12}\.json)"/)
assert.ok(browseMatch, 'homepage must reference a content-addressed browse snapshot')
const browse = await readFile(join(distDir, 'data', browseMatch[1]))
const browseBrotli = brotliCompressSync(browse, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
const homeBrotli = brotliCompressSync(Buffer.from(home), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
assert.ok(homeBrotli <= 60_000, `homepage Brotli size ${homeBrotli} exceeds 60 KB`)
// The complete search document is fetched on interaction. Budget the files
// actually requested by the production homepage, rather than its deferred data.
const server = await preview({ build: { outDir: distDir }, preview: { host: '127.0.0.1', port: 0 } })
const origin = `http://127.0.0.1:${server.httpServer.address().port}`
let browser
const idleMeasurements = []
try {
  browser = await chromium.launch()
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, locale: 'en-US' })
    await page.addInitScript(generatedAt => { Date.now = () => Date.parse(generatedAt) + 2 * 86400000 }, registry.generatedAt)
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    const requests = []
    const bodies = []
    page.on('request', request => requests.push(new URL(request.url()).pathname))
    const collectBody = response => {
      if (new URL(response.url()).origin === origin) bodies.push(response.body().then(body => ({ body }), error => ({ error })))
    }
    page.on('response', collectBody)
    await page.goto(origin)
    await page.waitForFunction(() => Boolean(window.HR?.startRegistryLoad))
    // Cross the former idle-callback deadline: an unoperated page stays small.
    await page.waitForTimeout(2500)
    assert.equal(await page.locator('[data-prerendered-row]').count(), 8)
    assert.equal(await page.locator('[data-freshness]').first().textContent(), 'Data updated 2d ago')
    assert.ok(await page.locator('[data-freshness]').first().evaluate(node => node.classList.contains('stale')))
    assert.ok(!requests.some(path => path.startsWith('/data/')), 'idle homepage must not fetch registry data')
    page.off('response', collectBody)
    const idleBytes = (await Promise.all(bodies)).reduce((sum, result) => {
      if (result.error) throw result.error
      return sum + brotliCompressSync(result.body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
    }, 0)
    assert.ok(idleBytes <= 1_100_000, `idle homepage Brotli payload ${idleBytes} exceeds 1.1 MB`)
    // An explicit interaction still loads the complete dataset and retains all
    // fields used by filtering, search, ranking, and installation-detail lookup.
    const searchId = registry.plugins[0].id
    await page.locator('#q').fill(searchId)
    await page.waitForFunction(count => window.HR?.PUBLISHED.length === count && document.documentElement.dataset.registryHydration === 'ready', registry.plugins.length)
    assert.equal(await page.locator('#list .prow-name a').first().textContent(), registry.plugins[0].name)
    assert.equal(requests.filter(path => /\/data\/browse-[a-f0-9]+\.json$/.test(path)).length, 1)
    await page.locator('#q').fill('memory')
    await page.waitForURL(/q=memory/)
    assert.equal(requests.filter(path => /\/data\/browse-[a-f0-9]+\.json$/.test(path)).length, 1, 'reuse the loaded search document')
    idleMeasurements.push({ viewport: viewport.width, estimatedFirstPartyIdleBrotliBytes: idleBytes, loadedPlugins: registry.plugins.length })
    await page.close()
  }
  const page = await browser.newPage({ locale: 'en-US' })
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  let failNextBrowse = true
  await page.route('**/data/browse-*.json', route => {
    if (failNextBrowse) { failNextBrowse = false; return route.fulfill({ status: 503, body: 'temporarily unavailable' }) }
    return route.continue()
  })
  await page.goto(origin)
  await page.waitForFunction(() => Boolean(window.HR?.startRegistryLoad))
  await page.locator('#load-more').click()
  await page.waitForFunction(() => document.documentElement.dataset.registryHydration === 'failed')
  assert.equal(await page.locator('[data-prerendered-row]').count(), 8, 'failed loading preserves the readable first page')
  await page.locator('#load-more').click()
  await page.waitForFunction(() => document.documentElement.dataset.registryHydration === 'ready')
  assert.ok(await page.locator('#list .prow').count() > 8, 'load more retries the failed download')
  await page.goto(`${origin}/?category=memory&sort=stars`)
  await page.waitForFunction(() => document.documentElement.dataset.registryHydration === 'ready')
  assert.equal(await page.locator('#sort').inputValue(), 'stars')
  const expected = registry.plugins.filter(plugin => plugin.category === 'memory').sort((a, b) => (b.stars || 0) - (a.stars || 0))[0]
  assert.equal(await page.locator('#list .prow-name a').first().textContent(), expected.name, 'linked filters load immediately and retain sorting')
  await page.close()
} finally {
  await browser?.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}

const sample = registry.plugins[0]
const shard = JSON.parse(await readFile(join(distDir, 'data/plugin-shards', pluginShardFilename(sample.id) + '.json'), 'utf8'))
const detail = renderPluginPage(await readFile(join(distDir, 'plugin-detail.html'), 'utf8'), sample, shard.homepage, shard.documents[sample.id.toLowerCase()])
assert.match(detail, /data-plugin-prerendered="true"/, 'plugin pages must expose content before JavaScript')
assert.ok(detail.includes(`id="plugin-name" data-dyn>${sample.name}<`), 'plugin page must contain its visible name')
assert.match(detail, /application\/ld\+json/, 'plugin pages must contain structured data')

const sitemapSize = (await stat(join(distDir, 'sitemap.xml'))).size
console.log(JSON.stringify({
  homepageBrotliBytes: homeBrotli,
  deferredBrowseSnapshotBrotliBytes: browseBrotli,
  idleMeasurements,
  prerenderedRows: (home.match(/data-prerendered-row/g) || []).length,
  pluginPages: registry.plugins.length,
  sitemapBytes: sitemapSize,
}))
