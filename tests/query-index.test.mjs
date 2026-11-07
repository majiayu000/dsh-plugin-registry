import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSearchDocument } from '../experiments/shared/build-search-index.mjs'
import { queryIndex, QUERY_COLUMN } from '../experiments/shared/query-index.js'
import { hasDshCandidateContext, normalizePendingPlugin } from '../assets/candidate-relevance.js'
import { createPluginSearchIndex, filterPluginSearchIndex } from '../assets/registry-search.js'
import { computeRankingScore, rankPlugins } from '../assets/registry-ranking.js'

const GENERATED = '2026-11-07T00:00:00Z'
function plugin(id, overrides = {}) {
  const [owner, name] = id.split('/')
  return {
    id, name, owner, description: { en: 'English memory tools', zh: '中文记忆工具' }, category: 'memory',
    stars: 30, forks: 4, language: 'JavaScript', pushedAt: '2026-11-01T00:00:00Z', addedAt: '2026-10-25',
    source: 'discovered', trustLevel: 'manifest_verified', verification: { manifest: 'shape_validated', patch: 'exists' },
    verifiedCommit: 'a'.repeat(40), profile: 'web', packageName: name, topics: ['dsh-plugin', 'memory'],
    icon: 'https://example.org/icon.png', license: 'MIT', install: 'never put install in cards', ...overrides,
  }
}
function fixture() {
  return { generatedAt: GENERATED, categories: { memory: { en: 'Memory', zh: '记忆' }, tools: { en: 'Developer tools' }, extra: { zh: '仅中文分类' } }, plugins: [
    plugin('same/dsh-memory', { stars: 20, forks: 8 }),
    plugin('same/dsh-memory-extra', { stars: 20, forks: null, description: { en: 'English exclusive', zh: '独有中文' } }),
    plugin('same/dsh-third', { stars: 20, forks: 8, category: 'tools' }),
    plugin('same/dsh-fourth', { stars: 20, forks: 8, category: 'extra', language: 'Rust' }),
    plugin('same/dsh-fifth', { stars: 20, forks: 8, source: 'curated' }),
    plugin('different/ordinary', { name: 'hidden-name-only', topics: [], packageName: 'not-that-name', description: { zh: '中文回退' }, forks: 0, pushedAt: '', addedAt: null }),
    plugin('More/dsh-another', { description: { en: 'English fallback' }, language: 'Rust', stars: 0, pushedAt: '2026-11-05', addedAt: '2026-11-06' }),
    plugin('other/unchecked', { description: { en: 'memory other', zh: '记忆' }, verification: { manifest: 'not_validated', patch: 'not_checked' }, trustLevel: 'curated', source: 'curated', latestRelease: { tag: 'v1', publishedAt: GENERATED } }),
  ] }
}
const audit = { pendingReview: [
  { id: 'SAME/DSH-MEMORY', url: 'https://github.com/same/dsh-memory', description: { en: 'Duplicate published' } },
  { id: 'pending/dsh-candidate', url: 'https://github.com/pending/dsh-candidate', stars: '50', description: { en: 'memory pending', zh: '待审记忆' }, topics: ['dsh-plugin'], language: 'Rust', category: 'memory' },
  { id: 'pending/irrelevant', url: 'https://github.com/pending/irrelevant', description: { en: 'Unrelated' }, topics: ['dsh-plugin'] },
  { id: 'pending/dsh-no-url' },
  null,
] }

// Reference the current browser functions and apply() sequence, with only the
// wall clock fixed to registry.generatedAt so quality scores remain comparable.
function reference(registry, pendingAudit, options = {}) {
  const now = Date.parse(registry.generatedAt)
  const locale = options.locale === 'en' || options.locale === 'en-US' ? 'en' : 'zh'
  const ids = new Set(registry.plugins.map(p => p.id.toLowerCase()))
  const pending = (pendingAudit.pendingReview || []).filter(p => p && p.id && p.url && !ids.has(p.id.toLowerCase()) && hasDshCandidateContext(p)).map(normalizePendingPlugin)
  const plugins = options.manifest === 'not_validated' ? registry.plugins.concat(pending) : registry.plugins
  const search = createPluginSearchIndex(plugins, p => {
    const description = p.description && (p.description[locale] || p.description.zh || p.description.en) || ''
    const category = registry.categories[p.category]
    const title = category ? category[locale] || category.zh || category.en || p.category : p.category
    return p.id + ' ' + description + ' ' + p.owner + ' ' + title + ' ' + (p.language || '') + ' ' + (p.topics || []).join(' ') + ' ' + (p.packageName || '') + ' ' + (p.profile || '')
  })
  for (const entry of search) entry.score = computeRankingScore(entry.plugin, { now }).score
  let rows = filterPluginSearchIndex(search, { query: options.q, category: options.category, source: options.source, manifest: options.manifest })
  if (options.language && options.language !== 'all') rows = rows.filter(p => p.language === options.language)
  const q = options.q || ''
  const sort = options.sort || 'relevance'
  if (!q && sort === 'relevance') rows = rankPlugins(rows, { now })
  else if (sort !== 'relevance' || !q) rows.sort((a, b) => {
    if (sort === 'forks') return b.forks - a.forks
    if (sort === 'new') return String(b.pushedAt || '').localeCompare(String(a.pushedAt || ''))
    if (sort === 'added') return String(b.addedAt || '').localeCompare(String(a.addedAt || ''))
    if (sort === 'manifest') {
      const delta = Number(b.verification?.manifest === 'shape_validated') - Number(a.verification?.manifest === 'shape_validated')
      if (delta) return delta
    }
    return (b.stars || 0) - (a.stars || 0)
  })
  return rows.map(p => p.id)
}

function all(index, options = {}) { return queryIndex(index, { ...options, pageSize: 100000 }).ids }

test('query documents contain fixed scores and separate install-free cards', () => {
  const registry = fixture()
  const { index, cards } = buildSearchDocument(registry, audit)
  assert.equal(index.rankingAt, Date.parse(GENERATED))
  assert.equal(index.entries.length, registry.plugins.length + 1)
  assert.equal(index.entries[0][QUERY_COLUMN.score], computeRankingScore(registry.plugins[0], { now: Date.parse(GENERATED) }).score)
  assert.equal(Object.hasOwn(cards['same/dsh-memory'], 'install'), false)
  assert.equal(cards['pending/dsh-candidate'].url, 'https://github.com/pending/dsh-candidate')
  assert.equal(cards['pending/dsh-candidate'].source, 'discovered')
  assert.equal(cards['pending/dsh-candidate'].forks, null)
  assert.equal(cards['pending/dsh-candidate'].verification.manifest, 'not_validated')
  assert.equal(typeof index.entries[0][QUERY_COLUMN.description], 'string')
  assert.throws(() => buildSearchDocument({ ...registry, generatedAt: null }, audit), /generatedAt/)
})

test('localized descriptions and category fallbacks match without making name an extra filter field', () => {
  const registry = fixture()
  const { index } = buildSearchDocument(registry, audit)
  for (const locale of ['en', 'zh', 'en-US']) {
    for (const q of ['exclusive', '独有中文', '中文回退', 'fallback', 'Developer', '仅中文分类', 'memory web', 'memory Rust', 'hidden-name-only', 'SAME/DSH-MEMORY', 'dsh-memory']) {
      assert.deepEqual(all(index, { q, locale }), reference(registry, audit, { q, locale }), `${locale}: ${q}`)
    }
  }
  assert.deepEqual(all(index, { q: 'hidden-name-only' }), [])
  assert.ok(!all(index, { q: 'exclusive', locale: 'zh' }).includes('same/dsh-memory-extra'))
  assert.ok(all(index, { q: 'exclusive', locale: 'en' }).includes('same/dsh-memory-extra'))
})

test('all sorts and filter combinations retain browser ordering, including stable ties after relevance', () => {
  const registry = fixture()
  const { index } = buildSearchDocument(registry, audit)
  for (const sort of ['relevance', 'stars', 'forks', 'new', 'added', 'manifest']) {
    for (const q of ['', 'memory', 'dsh', '   ', 'memory web']) {
      for (const filters of [{}, { category: 'memory' }, { source: 'curated' }, { language: 'Rust' }, { manifest: 'not_validated' }, { category: 'memory', source: 'discovered', manifest: 'shape_validated', language: 'JavaScript' }]) {
        const options = { sort, q, locale: 'en', ...filters }
        assert.deepEqual(all(index, options), reference(registry, audit, options), JSON.stringify(options))
      }
    }
  }
})

test('pending candidates are opt-in and preserve the existing identity normalization and published dedup', () => {
  const registry = fixture()
  const { index, cards } = buildSearchDocument(registry, audit)
  assert.ok(!all(index).some(id => id.startsWith('pending/')))
  const ids = all(index, { manifest: 'not_validated' })
  assert.ok(ids.includes('pending/dsh-candidate'))
  assert.ok(!ids.includes('pending/irrelevant'))
  assert.ok(!ids.includes('SAME/DSH-MEMORY'))
  assert.equal(cards['pending/dsh-candidate'].name, 'dsh-candidate')
  assert.equal(normalizePendingPlugin({ id: 'original/dsh-name', owner: 'override' }).name, 'original/dsh-name')
})

test('diversity is applied to the complete result set before 30-row pagination', () => {
  const registry = fixture()
  registry.plugins = Array.from({ length: 97 }, (_, i) => plugin(`${i < 80 ? 'same' : `owner${i}`}/dsh-${i}`, { stars: 1000 - i }))
  const { index } = buildSearchDocument(registry)
  const expected = rankPlugins(registry.plugins, { now: Date.parse(GENERATED) }).map(p => p.id)
  const pages = [1, 2, 3, 4].map(page => queryIndex(index, { page }))
  assert.deepEqual(pages.map(page => page.ids.length), [30, 30, 30, 7])
  assert.ok(pages.every(page => page.total === 97))
  assert.deepEqual(pages.flatMap(page => page.ids), expected)
  assert.equal(new Set(pages.flatMap(page => page.ids)).size, 97)
  assert.deepEqual(queryIndex(index, { page: 5 }), { total: 97, ids: [] })
  assert.deepEqual(queryIndex(index, { q: 'unfindable', page: 2 }), { total: 0, ids: [] })
})

test('JSON round-trip and later wall clocks do not change ranking or mutate shared index', () => {
  const registry = fixture()
  const { index } = buildSearchDocument(registry, audit)
  const serialized = JSON.stringify(index)
  const decoded = JSON.parse(serialized)
  const previous = Date.now
  try {
    Date.now = () => Date.parse('2035-01-01')
    assert.deepEqual(all(decoded), reference(registry, audit))
    for (const sort of ['stars', 'forks', 'new', 'added', 'manifest', 'relevance']) all(decoded, { q: 'memory', sort })
  } finally { Date.now = previous }
  assert.equal(JSON.stringify(index), serialized)
  assert.equal(JSON.stringify(decoded), serialized)
})

test('fragment candidates retain substring, Unicode, locale and multiple-term semantics', () => {
  const registry = fixture()
  registry.plugins.push(plugin('emoji/工具', { description: { en: '😀 café __proto__', zh: '😀你好工具' } }))
  const { index } = buildSearchDocument(registry, audit)
  for (const locale of ['en', 'zh']) {
    for (const q of ['a', '记', 'em', '忆工', '😀', '\ud83d', 'café', '__proto__', 'tools memory', '记忆 JavaScript', 'zzneverfound', '  MeMoRy  ']) {
      assert.deepEqual(all(index, { q, locale }), reference(registry, audit, { q, locale }), `${locale}: ${q}`)
    }
  }
  let reads = 0
  index.entries = new Proxy(index.entries, { get(target, key) {
    if (/^\d+$/.test(String(key))) reads++
    return Reflect.get(target, key)
  } })
  assert.equal(queryIndex(index, { q: '😀' }).total, 1)
  assert.equal(reads, 1, 'rare fragments do not scan unrelated records')
})

test('bounded ranking preserves every page of broad matches and stable explicit-sort ties', () => {
  const registry = fixture()
  registry.plugins = Array.from({ length: 173 }, (_, i) => plugin(`owner${i % 7}/dsh-${i}`, {
    stars: i % 9, forks: i % 3, description: { en: i % 2 ? 'agent tool' : 'agent memory', zh: '工具记忆' },
  }))
  const { index } = buildSearchDocument(registry)
  for (const q of ['a', 'dsh', 'agent', '记']) {
    for (const sort of ['relevance', 'stars', 'forks', 'new', 'added', 'manifest']) {
      const options = { q, sort, locale: 'en' }
      const expected = reference(registry, {}, options)
      const pages = Array.from({ length: 7 }, (_, i) => queryIndex(index, { ...options, page: i + 1 }))
      assert.ok(pages.every(page => page.total === expected.length))
      assert.deepEqual(pages.flatMap(page => page.ids), expected, JSON.stringify(options))
    }
  }
})
