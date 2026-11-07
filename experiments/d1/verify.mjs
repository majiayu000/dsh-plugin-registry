import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { buildProjection } from './build.mjs'
import { requestOptions, search } from './query.js'
import { queryIndex } from '../../functions/lib/query-index.js'
import { buildSearchDocument } from '../../scripts/build-search-index.mjs'
import worker from './worker.js'

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
    stars: i % 7, forks: i % 3 ? null : i % 4, pushedAt: i % 2 ? '2026-11-06' : null,
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
const env = { DB: adapter(small) }
for (const suffix of ['?page=0', '?page=1.5', '?locale=xx', '?sort=invalid', '?q=' + 'a'.repeat(201)]) {
  assert.equal((await worker.fetch(new Request('https://example.test/api/search' + suffix), env)).status, 400)
}
assert.equal((await worker.fetch(new Request('https://example.test/api/search?version=old'), env)).status, 409)
assert.equal(await (await worker.fetch(new Request('https://example.test/api/search', { method: 'HEAD' }), env)).text(), '')
assert.equal((await worker.fetch(new Request('https://example.test/api/search', { method: 'POST' }), env)).status, 405)
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
