import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { classifyLowSignal, LISTING_QUALITY_CONFIG, partitionListing } from '../assets/listing-quality.js'
import { prerenderRegistryHome } from '../scripts/prerender-pages.mjs'

let sequence = 0
function plugin(overrides = {}) {
  sequence += 1
  const owner = overrides.owner || 'solo'
  const name = overrides.name || `plugin-${sequence}`
  return {
    id: `${owner}/${name}`, name, owner, url: `https://github.com/${owner}/${name}`,
    description: { zh: `描述 ${sequence}`, en: `Description ${sequence}` }, category: 'tools',
    stars: 0, forks: 0, latestRelease: null, source: 'discovered', trustLevel: 'manifest_verified',
    verification: { manifest: 'shape_validated', patch: 'exists', installation: 'not_tested' },
    verifiedCommit: String(sequence).padStart(40, '0'),
    ...overrides,
  }
}

function bulk(owner, count, overrides = {}) {
  return Array.from({ length: count }, () => plugin({ owner, ...overrides }))
}

const reasonsOf = (plugins, id, config) => classifyLowSignal(plugins, config).get(id.toLowerCase())

test('bulk publisher threshold is inclusive and lives in the shared config', () => {
  const limit = LISTING_QUALITY_CONFIG.bulkPublisherMinListings
  const below = bulk('few', limit - 1)
  const at = bulk('many', limit)
  const reasons = classifyLowSignal([...below, ...at])
  assert.equal(below.filter(entry => reasons.has(entry.id.toLowerCase())).length, 0)
  assert.equal(at.filter(entry => reasons.get(entry.id.toLowerCase())?.includes('bulk_publisher')).length, limit)
  // A caller-supplied config overrides the default threshold.
  assert.equal(classifyLowSignal(below, { bulkPublisherMinListings: 2 }).size, limit - 1)
})

test('owner counts are case-insensitive', () => {
  const limit = LISTING_QUALITY_CONFIG.bulkPublisherMinListings
  const entries = [...bulk('Mixed', limit - 1), plugin({ owner: 'mixed' })]
  assert.equal(classifyLowSignal(entries).size, limit)
})

test('any individual adoption or review signal keeps a bulk entry in the default list', () => {
  const limit = LISTING_QUALITY_CONFIG.bulkPublisherMinListings
  const filler = bulk('farm', limit)
  const keep = [
    plugin({ owner: 'farm', stars: 1 }),
    plugin({ owner: 'farm', forks: 1 }),
    plugin({ owner: 'farm', latestRelease: { tag: 'v1.0.0', publishedAt: '2026-11-01T00:00:00Z' } }),
    plugin({ owner: 'farm', source: 'curated', trustLevel: 'curated' }),
    plugin({ owner: 'farm', origin: 'issue' }),
    plugin({ owner: 'farm', special: true }),
  ]
  const reasons = classifyLowSignal([...filler, ...keep])
  assert.equal(reasons.size, filler.length)
  keep.forEach(entry => assert.equal(reasons.has(entry.id.toLowerCase()), false, entry.id))
})

test('repositories at the same verified commit keep only the strongest listing', () => {
  const commit = 'a'.repeat(40)
  const original = plugin({ owner: 'origin', stars: 30, verifiedCommit: commit })
  const mirror = plugin({ owner: 'mirror', stars: 2, verifiedCommit: commit })
  const entries = [mirror, original]
  assert.deepEqual(reasonsOf(entries, mirror.id), ['duplicate'])
  assert.equal(reasonsOf(entries, original.id), undefined)
})

test('a curated listing is canonical over a discovered twin, even with equal signals', () => {
  const commit = 'b'.repeat(40)
  const renamed = plugin({ owner: 'dev', name: 'new-name', stars: 500, verifiedCommit: commit })
  const curated = plugin({ owner: 'dev', name: 'old-name', stars: 500, verifiedCommit: commit, source: 'curated', trustLevel: 'curated' })
  assert.deepEqual(reasonsOf([renamed, curated], renamed.id), ['duplicate'])
  assert.equal(reasonsOf([renamed, curated], curated.id), undefined)
  // Two exempt listings are never hidden.
  const curatedTwin = { ...renamed, source: 'curated', trustLevel: 'curated' }
  assert.equal(classifyLowSignal([curatedTwin, curated]).size, 0)
})

test('copies with the same name and description are duplicates; empty descriptions are not grouped', () => {
  const description = { zh: '开机动画', en: 'Boot animation' }
  const popular = plugin({ owner: 'one', name: 'dsh-boot', description, stars: 300 })
  const copy = plugin({ owner: 'two', name: 'DSH-Boot', description, stars: 4 })
  assert.deepEqual(reasonsOf([popular, copy], copy.id), ['duplicate'])

  const blank = { zh: '', en: '' }
  const first = plugin({ owner: 'one', name: 'dsh-memory', description: blank, stars: 9 })
  const second = plugin({ owner: 'two', name: 'dsh-memory', description: blank })
  assert.equal(classifyLowSignal([first, second]).size, 0)

  const sameNameOnly = plugin({ owner: 'three', name: 'dsh-boot', description: { zh: '别的功能', en: 'Other' } })
  assert.equal(reasonsOf([popular, sameNameOnly], sameNameOnly.id), undefined)
})

test('partitioning never drops a listing', () => {
  const limit = LISTING_QUALITY_CONFIG.bulkPublisherMinListings
  const entries = [...bulk('farm', limit), plugin({ stars: 7 }), plugin()]
  const { standard, lowSignal } = partitionListing(entries)
  assert.equal(standard.length + lowSignal.length, entries.length)
  assert.deepEqual(new Set([...standard, ...lowSignal]), new Set(entries))
  assert.equal(lowSignal.length, limit)
})

test('homepage prerender counts the default list and states what it hides', () => {
  const limit = LISTING_QUALITY_CONFIG.bulkPublisherMinListings
  const plugins = [...bulk('farm', limit), plugin({ owner: 'acme', name: 'terminal', stars: 12 })]
  const template = `<!doctype html><html lang="zh-CN"><head></head><body>
    <span class="freshness" data-freshness hidden></span>
    <b id="st-count">—</b><b id="st-stars">—</b><b id="st-author">—</b><b id="st-auto">—</b><p id="st-scope"></p>
    <div id="chips"></div><span id="list-note"></span><select id="language"></select>
    <div id="list"></div></body></html>`
  const page = prerenderRegistryHome(template, {
    schemaVersion: 2, generatedAt: '2026-11-12T00:00:00.000Z', categories: { tools: { zh: '工具', en: 'Tools' } },
    stats: { published: plugins.length }, plugins,
  }, 'data/browse-deadbeef0000.json', 'https://example.com/')
  assert.match(page, /id="st-count">1</)
  assert.match(page, /id="st-author">1</)
  assert.match(page, new RegExp(`id="st-scope">默认列表：共 ${plugins.length} 个可安装条目，隐藏 ${limit} 个低信号条目<`))
  assert.match(page, /id="list-note">1 个结果</)
  assert.match(page, /href="plugins\/acme\/terminal\/"/)
  assert.doesNotMatch(page, /plugins\/farm\//)
})

test('the browse page exposes the low-signal filter and a reachable full list', async () => {
  const html = await readFile('index.html', 'utf8')
  assert.match(html, /<select class="sel" id="listing"[^>]*>\s*<option value="standard">[^<]+<\/option>\s*<option value="all">[^<]+<\/option>\s*<option value="low_signal">/)
  assert.match(html, /id="st-scope"/)
  const browse = await readFile('assets/page-browse.js', 'utf8')
  assert.match(browse, /params\.get\('listing'\) \|\| 'standard'/)
  assert.match(browse, /data-show-all-listings/)
})
