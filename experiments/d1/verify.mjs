import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { buildProjection, columns, readIdentities } from './build.mjs'
import { requestOptions, search } from './query.js'
import { queryIndex } from '../shared/query-index.js'
import { buildSearchDocument } from '../shared/build-search-index.mjs'
import worker from './worker.js'
import { planDelta, applyDeltaLocal } from './sync.mjs'

function adapter(db) {
  return { prepare(sql) { return { bind(...params) { return { async all() {
    return { results: db.prepare(sql).all(...params) }
  } } } } } }
}
function options(values) {
  return requestOptions(new URL('https://example.test/api/search?' + new URLSearchParams(values)))
}
let comparisons = 0
async function compare(db, index, values) {
  const input = options(values)
  const actual = await search(adapter(db), input)
  const expected = queryIndex(index, input)
  assert.deepEqual({ total: actual.total, ids: actual.items.map(item => item.id) }, expected, JSON.stringify(values))
  comparisons++
}

const fixture = { generatedAt: '2026-11-07T00:00:00Z', categories: { tools: { zh: '工具', en: 'Tools' }, memory: { zh: '记忆', en: 'Memory' } },
  plugins: Array.from({ length: 83 }, (_, i) => ({
    id: `${i < 60 ? 'same' : 'different'}/dsh-${i}`, owner: i < 60 ? 'same' : 'different', name: `dsh-${i}`,
    category: i % 2 ? 'tools' : 'memory', source: i % 3 ? 'discovered' : 'curated', language: i % 2 ? 'Rust' : 'JavaScript',
    description: i % 3 ? { en: 'memory tools café 😀 100% under_score', zh: '记忆工具😀' } : { zh: '中文回退' },
    icon: 'https://example.test/icon.svg', stars: i % 7, forks: i % 3 ? null : i % 4, pushedAt: i % 2 ? '2026-11-06' : null,
    topics: ['topic-a', 'memory', 'two\twords'], profile: 'web', trustLevel: 'manifest_verified',
    verification: i % 3 ? { manifest: i % 2 ? 'shape_validated' : 'not_validated' } : {},
  })) }
const audit = { pendingReview: [{ id: 'candidate/dsh-test', url: 'https://github.com/candidate/dsh-test', description: { en: 'memory', zh: '记忆' } }] }
const projection = buildProjection(fixture, audit)
assert.throws(() => buildProjection({ ...fixture, plugins: [{ ...fixture.plugins[0], description: { en: '\ud800' } }] }, {}), /unpaired UTF-16/)
const small = new DatabaseSync(':memory:')
small.exec(projection.sql)
for (const locale of ['en', 'zh']) for (const q of ['', 'memory', '记', '😀', '100%', 'under_', 'memory tools', 'memory memory tools', "' OR 1=1 --"])
  for (const sort of ['relevance', 'stars', 'forks', 'new', 'added', 'manifest'])
    for (const filters of [{}, { category: 'tools' }, { manifest: 'not_validated' }])
      for (const page of [1, 2, 9]) await compare(small, projection.index, { locale, q, sort, ...filters, page })
const missingPage = small.prepare('SELECT document FROM home_pages WHERE page=0').get().document
small.prepare('DELETE FROM home_pages WHERE page=0').run()
await assert.rejects(() => search(adapter(small), options({})), /Missing home page/)
small.prepare('INSERT INTO home_pages VALUES (0,?)').run(missingPage)
assert.deepEqual((await search(adapter(small), options({ page: 100000 }))).items, [])
const env = { DB: adapter(small) }
for (const suffix of ['?page=0', '?page=1.5', '?locale=xx', '?sort=invalid', '?q=' + 'a'.repeat(201)]) {
  assert.equal((await worker.fetch(new Request('https://example.test/api/search' + suffix), env)).status, 400)
}
assert.equal((await worker.fetch(new Request('https://example.test/api/search?version=old'), env)).status, 409)
assert.equal(await (await worker.fetch(new Request('https://example.test/api/search', { method: 'HEAD' }), env)).text(), '')
assert.equal((await worker.fetch(new Request('https://example.test/api/search', { method: 'POST' }), env)).status, 405)
// A no-op must not rotate the version or touch either content or FTS rows.
const noOp = planDelta(small, buildProjection(fixture, audit, readIdentities(small)))
assert.equal(noOp.changed, false)
const changesBefore = small.prepare('SELECT total_changes() AS n').get().n
applyDeltaLocal(small, noOp)
assert.equal(small.prepare('SELECT total_changes() AS n').get().n, changesBefore)

const edited = structuredClone(fixture)
edited.plugins[0].icon = 'https://example.test/new-icon.svg'
const cardOnly = buildProjection(edited, audit, readIdentities(small))
const cardPlan = planDelta(small, cardOnly)
assert.equal(cardPlan.stats.textChanges, 0)
assert.equal(cardPlan.stats.updated, 1)
applyDeltaLocal(small, cardPlan)
assert.equal(small.prepare('SELECT total_changes() AS n').get().n - changesBefore, 2)
assert.throws(() => applyDeltaLocal(small, cardPlan), /Stale delta base/)

// Failure after mutation must roll back content, index and version together.
const broken = structuredClone(cardPlan)
broken.baseVersion = cardOnly.meta.version
broken.upserts[0][Object.keys(columns).indexOf('card')] = 'would change'
broken.upserts[0][Object.keys(columns).indexOf('text_zh')] = 'rollbackfts sentinel'
broken.upserts.push([...broken.upserts[0]])
broken.upserts[1][Object.keys(columns).indexOf('owner')] = '\ud800'
assert.throws(() => applyDeltaLocal(small, broken), /unpaired UTF-16/)
assert.notEqual(small.prepare('SELECT card FROM plugins WHERE pos=?').get(broken.upserts[0][0]).card, 'would change')
assert.equal(small.prepare("SELECT count(*) AS n FROM search_terms WHERE search_terms MATCH '\"rol\" AND \"fts\"'").get().n, 0)

// Add/delete/reorder and change localized search text, including NUL and quotes.
edited.plugins.shift()
edited.plugins[0].description = { zh: '前\0后abc 记忆工具', en: 'memorytools "quoted" café 😀abc' }
edited.plugins.push({ ...edited.plugins[0], id: 'new/added', owner: 'new', name: 'new' })
const changed = buildProjection(edited, {}, readIdentities(small))
const delta = planDelta(small, changed)
applyDeltaLocal(small, delta)
for (const locale of ['en', 'zh']) for (const q of ['memory', '记忆', '记忆工', '后abc', '\0后abc', '"quo', '😀ab', 'café', 'new'])
  for (const sort of ['relevance', 'stars', 'new']) await compare(small, changed.index, { locale, q, sort })
assert.equal(planDelta(small, buildProjection(edited, {}, readIdentities(small))).changed, false)
small.exec("INSERT INTO search_terms(search_terms,rank) VALUES('integrity-check',1)")
console.log(JSON.stringify({ delta: delta.stats, noOpWrites: 0, cardOnlyWrites: 2, rollback: 'verified', staleBase: 'rejected' }))
// New highest-ranked/source-first rows must not move existing identities.
const identitiesBefore = readIdentities(small)
const lifecycle = structuredClone(edited)
lifecycle.plugins.unshift({ ...lifecycle.plugins[0], id: 'new/first', owner: 'new', stars: 100000 })
const first = buildProjection(lifecycle, {}, identitiesBefore)
for (const [id, pos] of identitiesBefore) assert.equal(first.identities.get(id), pos)
assert.throws(() => planDelta(small, buildProjection(lifecycle, {})), /preserve existing/)
applyDeltaLocal(small, planDelta(small, first))
await compare(small, first.index, {})
await compare(small, first.index, { q: 'memory', sort: 'stars' })
// Move a published identity to pending and back without reallocating its pos.
const promoted = lifecycle.plugins.pop()
const pendingAudit = { pendingReview: [{ ...promoted, url: 'https://github.com/' + promoted.id }] }
const demoted = buildProjection(lifecycle, pendingAudit, readIdentities(small))
assert.equal(demoted.identities.get(promoted.id.toLowerCase()), first.identities.get(promoted.id.toLowerCase()))
applyDeltaLocal(small, planDelta(small, demoted))
await compare(small, demoted.index, { manifest: 'not_validated' })
lifecycle.plugins.push(promoted)
const restored = buildProjection(lifecycle, {}, readIdentities(small))
applyDeltaLocal(small, planDelta(small, restored))
await compare(small, restored.index, {})
lifecycle.categories.tools.zh = '工具分类变化'
const categoryEdit = buildProjection(lifecycle, {}, readIdentities(small))
const categoryDelta = planDelta(small, categoryEdit)
assert.ok(categoryDelta.stats.textChanges > 0)
applyDeltaLocal(small, categoryDelta)
await compare(small, categoryEdit.index, { q: '分类变化' })
small.exec("INSERT INTO search_terms(search_terms,rank) VALUES('integrity-check',1)")
// Simulate an atomic publication between the metadata and card reads.
const concurrent = buildProjection({ ...lifecycle, generatedAt: '2026-11-07T02:00:00Z' }, {}, readIdentities(small))
const concurrentPlan = planDelta(small, concurrent)
// Abort at the final metadata write, after plugins, FTS, blocks and pages changed.
const state = () => ['plugins', 'rank_blocks', 'home_pages', 'build'].map(table => small.prepare(`SELECT * FROM ${table} ORDER BY 1`).all())
const beforeFinalWrite = state()
const failing = structuredClone(concurrentPlan)
failing.upserts = [[...categoryEdit.rows[0]]]
failing.upserts[0][Object.keys(columns).indexOf('text_en')] = 'rollbackfts sentinel'
failing.derived.home_pages.upserts = [[0, '[]']]
small.exec("CREATE TEMP TRIGGER reject_meta BEFORE UPDATE ON build BEGIN SELECT RAISE(ABORT,'injected publish failure'); END;")
assert.throws(() => applyDeltaLocal(small, failing), /injected publish failure/)
assert.deepEqual(state(), beforeFinalWrite)
assert.equal(small.prepare("SELECT count(*) AS n FROM search_terms WHERE search_terms MATCH '\"rol\" AND \"fts\"'").get().n, 0)
small.exec("DROP TRIGGER reject_meta; INSERT INTO search_terms(search_terms,rank) VALUES('integrity-check',1);")
console.log(JSON.stringify({ finalMetadataFailure: 'all four tables and FTS rolled back' }))
const backing = adapter(small)
let reads = 0
const changing = { prepare(sql) { return { bind(...args) { return { async all() {
  if (++reads === 3) applyDeltaLocal(small, concurrentPlan)
  return backing.prepare(sql).bind(...args).all()
} } } } } }
const raced = await search(changing, options({}))
assert.equal(raced.status, 409)
assert.equal(raced.version, concurrent.meta.version)
assert.equal(raced.items, undefined)
console.log(JSON.stringify({ concurrentPublication: '409, no mixed items' }))
small.close()
console.log(JSON.stringify({ fixtureComparisons: comparisons, result: 'exact match' }))

const registry = JSON.parse(await readFile('public/data/plugins.json', 'utf8'))
const realAudit = JSON.parse(await readFile('public/data/registry-audit.json', 'utf8'))
const { index } = buildSearchDocument(registry, realAudit)
const full = new DatabaseSync('.generated/d1/local.sqlite', { readOnly: true })
const before = comparisons
for (const locale of ['en', 'zh']) for (const q of ['', 'memory', '记忆', 'agent', 'a', 'dsh', 'terminal tool', '不存在zz'])
  for (const sort of ['relevance', 'stars', 'forks', 'new', 'added', 'manifest'])
    for (const page of [1, 3]) await compare(full, index, { locale, q, sort, page })
for (const filters of [{ category: 'ui' }, { category: 'tool' }, { language: 'JavaScript' }, { source: 'curated' }, { manifest: 'not_validated' }]) {
  for (const q of ['', 'memory']) for (const page of [1, 3]) await compare(full, index, { ...filters, q, page })
}
await compare(full, index, { q: 'a '.repeat(99) + 'a' })
const timeOnly = buildProjection({ ...registry, generatedAt: new Date(Date.parse(registry.generatedAt) + 7200000).toISOString() }, realAudit, readIdentities(full))
const timeDelta = planDelta(full, timeOnly)
assert.equal(timeDelta.stats.updated, 0)
assert.equal(timeDelta.stats.inserted, 0)
assert.equal(timeDelta.stats.deleted, 0)
assert.equal(timeDelta.stats.textChanges, 0)
assert.ok(timeDelta.stats.rankBlockWrites <= Math.ceil(index.entries.length / 256))
assert.ok(timeDelta.stats.homePageWrites <= Math.ceil(registry.plugins.length / 30))
console.log(JSON.stringify({ timeOnly: timeDelta.stats, stablePluginRows: index.entries.length }))
full.close()
console.log(JSON.stringify({ snapshotComparisons: comparisons - before, entries: index.entries.length, result: 'exact match' }))

// FTS5's default tokenizer is not a drop-in replacement for substring search.
const fts = new DatabaseSync(':memory:')
fts.exec("CREATE VIRTUAL TABLE words USING fts5(text); INSERT INTO words VALUES ('memorytools'),('记忆工具');")
for (const term of ['memory', '记忆']) {
  const wholeWord = fts.prepare('SELECT count(*) AS n FROM words WHERE words MATCH ?').get(term).n
  const substring = fts.prepare('SELECT count(*) AS n FROM words WHERE instr(text,?)>0').get(term).n
  assert.equal(wholeWord, 0); assert.equal(substring, 1)
  console.log(JSON.stringify({ ftsProbe: term, wholeWord, substring }))
}
fts.close()
