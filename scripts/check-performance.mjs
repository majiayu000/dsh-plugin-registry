import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'
import { pluginPathSegments } from '../assets/plugin-route.js'

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
assert.ok(browseBrotli <= 1_100_000, `idle browse snapshot Brotli size ${browseBrotli} exceeds 1.1 MB`)

const sample = registry.plugins[0]
const detail = await readFile(join(distDir, 'plugins', ...pluginPathSegments(sample), 'index.html'), 'utf8')
assert.match(detail, /data-plugin-prerendered="true"/, 'plugin pages must expose content before JavaScript')
assert.ok(detail.includes(`id="plugin-name" data-dyn>${sample.name}<`), 'plugin page must contain its visible name')
assert.match(detail, /application\/ld\+json/, 'plugin pages must contain structured data')

const sitemapSize = (await stat(join(distDir, 'sitemap.xml'))).size
console.log(JSON.stringify({
  homepageBrotliBytes: homeBrotli,
  browseSnapshotBrotliBytes: browseBrotli,
  prerenderedRows: (home.match(/data-prerendered-row/g) || []).length,
  pluginPages: registry.plugins.length,
  sitemapBytes: sitemapSize,
}))
