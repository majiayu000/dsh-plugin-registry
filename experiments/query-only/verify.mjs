// Full-snapshot semantic check: query-only pages vs the browser apply() order.
// node experiments/query-only/verify.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { buildSearchDocument } from '../shared/build-search-index.mjs'
import { queryIndex } from '../shared/query-index.js'
import { createOracle } from './oracle.mjs'
import { PROFILE_WORKLOAD, SORTS, sampledTerms } from './workload.mjs'

const root = resolve(import.meta.dirname, '../..')
const [registry, audit] = await Promise.all(['public/data/plugins.json', 'public/data/registry-audit.json']
  .map(path => readFile(join(root, path), 'utf8').then(JSON.parse)))
const { index } = buildSearchDocument(registry, audit)
const reference = createOracle(registry, audit)
const PAGE = 30
let wholeResults = 0, pages = 0

function check(options) {
  const expected = reference(options)
  const whole = queryIndex(index, { listing: 'standard', ...options, page: 1, pageSize: 1_000_000 })
  assert.equal(whole.total, expected.length, JSON.stringify(options))
  assert.deepEqual(whole.ids, expected, JSON.stringify(options))
  wholeResults++
  const last = Math.max(1, Math.ceil(expected.length / PAGE))
  // Bounded pages exercise the early-stop paths; whole lists do not.
  for (const page of new Set([1, 2, 3, Math.ceil(last / 2), last, last + 1])) {
    const result = queryIndex(index, { listing: 'standard', ...options, page, pageSize: PAGE })
    assert.equal(result.total, expected.length)
    assert.deepEqual(result.ids, expected.slice((page - 1) * PAGE, page * PAGE), JSON.stringify({ ...options, page }))
    pages++
  }
}

const started = performance.now()
for (const options of PROFILE_WORKLOAD) { const { page, ...rest } = options; check(rest) }
for (const q of ['', 'memory', 'a', 'dsh', 'agent', '记忆', 'mcp server', 'zzzzqx']) {
  for (const sort of SORTS) for (const listing of ['standard', 'all', 'low_signal']) check({ q, sort, listing })
}
for (const filters of [{ category: 'memory' }, { category: 'ui', source: 'curated' }, { manifest: 'not_validated' }, { manifest: 'shape_validated', language: 'Python' }, { language: 'TypeScript' }]) {
  for (const q of ['', 'a', 'plugin']) for (const sort of ['relevance', 'stars', 'new']) check({ q, sort, ...filters })
}
const terms = sampledTerms(registry, 120)
terms.forEach((term, i) => check({ q: i % 5 === 4 ? `${term} ${terms[i - 1]}` : term, sort: SORTS[i % SORTS.length], locale: i % 2 ? 'en' : 'zh', listing: ['standard', 'all', 'low_signal'][i % 3] }))
console.log(JSON.stringify({
  entries: index.entries.length, wholeResultComparisons: wholeResults, pageComparisons: pages,
  rankingAt: new Date(index.rankingAt).toISOString(), result: 'exact match', seconds: Math.round((performance.now() - started) / 1000),
}))
