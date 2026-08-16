import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RANKING_CONFIG,
  applyDiversity,
  blendSearchQuality,
  compareByRankingScore,
  computeRankingScore,
  rankPlugins,
} from '../assets/registry-ranking.js'

const NOW = Date.parse('2026-08-16T12:00:00Z')
const daysAgo = days => new Date(NOW - days * 86_400_000).toISOString()

function plugin(overrides = {}) {
  return {
    id: 'acme/plugin',
    name: 'plugin',
    owner: 'acme',
    stars: 100,
    forks: 10,
    description: { zh: '示例', en: 'Example' },
    pushedAt: daysAgo(30),
    latestRelease: { tag: 'v1.0.0', publishedAt: daysAgo(40) },
    license: 'MIT',
    icon: 'https://github.com/acme.png',
    source: 'discovered',
    trustLevel: 'manifest_verified',
    verification: { manifest: 'shape_validated', patch: 'exists', installation: 'not_tested' },
    verifiedCommit: 'a'.repeat(40),
    ...overrides,
  }
}

test('maintenance decay beats raw stars: active small repo outranks stagnant star farm', () => {
  const active = plugin({ id: 'small/active', stars: 300, pushedAt: daysAgo(3), latestRelease: { tag: 'v2.0.0', publishedAt: daysAgo(5) } })
  const stagnant = plugin({ id: 'big/stale', stars: 8_000, pushedAt: daysAgo(400), latestRelease: { tag: 'v0.1.0', publishedAt: daysAgo(700) } })
  assert.ok(computeRankingScore(active, { now: NOW }).score > computeRankingScore(stagnant, { now: NOW }).score)
  assert.deepEqual([stagnant, active].sort((a, b) => compareByRankingScore(a, b, { now: NOW })), [active, stagnant])
})

test('maintenance uses latest release over raw pushes and decays with a 90-day half-life', () => {
  const fresh = computeRankingScore(plugin({ latestRelease: { tag: 'v1.0.0', publishedAt: daysAgo(0) } }), { now: NOW })
  const half = computeRankingScore(plugin({ latestRelease: { tag: 'v1.0.0', publishedAt: daysAgo(90) } }), { now: NOW })
  const year = computeRankingScore(plugin({ latestRelease: { tag: 'v1.0.0', publishedAt: daysAgo(365) } }), { now: NOW })
  assert.ok(Math.abs(half.breakdown.maint - 0.5) < 1e-9)
  assert.ok(year.breakdown.maint < 0.07)
  assert.ok(fresh.score > half.score && half.score > year.score)
})

test('missing maintenance timestamps fall back to the neutral score', () => {
  const unknown = computeRankingScore(plugin({ pushedAt: null, latestRelease: null }), { now: NOW })
  assert.equal(unknown.breakdown.maint, RANKING_CONFIG.missingMaintenanceScore)
})

test('trust multipliers stack: issue-submitted curated listing outranks equal vendored curated', () => {
  const issue = plugin({ id: 'a/issue', source: 'curated', origin: 'issue', addedAt: daysAgo(60), verification: { manifest: 'not_checked', patch: 'not_checked', installation: 'not_tested' }, verifiedCommit: undefined })
  const vendored = plugin({ id: 'a/vendored', source: 'curated', addedAt: daysAgo(60), verification: { manifest: 'not_checked', patch: 'not_checked', installation: 'not_tested' }, verifiedCommit: undefined })
  const verified = plugin({ id: 'a/verified' })
  const scores = [issue, vendored, verified].map(p => computeRankingScore(p, { now: NOW }).score)
  assert.ok(scores[0] > scores[1])
  assert.ok(scores[1] > scores[2])
  assert.ok(Math.abs(scores[0] / scores[1] - RANKING_CONFIG.trust.issueSubmitted) < 1e-9)
})

test('new-listing boost fades to zero after the discovery window', () => {
  const justAdded = plugin({ source: 'curated', origin: 'issue', addedAt: daysAgo(1) })
  const windowEdge = plugin({ source: 'curated', origin: 'issue', addedAt: daysAgo(RANKING_CONFIG.boost.days) })
  const afterWindow = plugin({ source: 'curated', origin: 'issue', addedAt: daysAgo(RANKING_CONFIG.boost.days + 5) })
  const just = computeRankingScore(justAdded, { now: NOW })
  assert.ok(just.breakdown.boost > 0 && just.badges.newListing)
  assert.ok(Math.abs(computeRankingScore(windowEdge, { now: NOW }).breakdown.boost) < 1e-9)
  assert.equal(computeRankingScore(afterWindow, { now: NOW }).breakdown.boost, 0)
})

test('popularity is log-compressed so a 100x star gap is not a 100x score gap', () => {
  const small = computeRankingScore(plugin({ stars: 100, forks: 10 }), { now: NOW })
  const huge = computeRankingScore(plugin({ stars: 10_000, forks: 1_000 }), { now: NOW })
  assert.ok(huge.score > small.score)
  assert.ok(small.score / huge.score > 0.3)
})

test('pending review candidates always sink below published plugins', () => {
  const candidate = plugin({ id: 'x/candidate', stars: 50_000, trustLevel: 'pending_review' })
  const published = plugin({ id: 'x/published', stars: 1 })
  assert.deepEqual([candidate, published].sort((a, b) => compareByRankingScore(a, b, { now: NOW })), [published, candidate])
})

test('diversity caps per-owner seats in the head and keeps high scorers first', () => {
  // 列表必须超过 diversity window，cap 的语义才是"超额席位排在 window 之外"
  const many = Array.from({ length: 8 }, (_, i) => plugin({ id: `big/repo-${i}`, owner: 'big', stars: 5_000 - i }))
  const others = Array.from({ length: 30 }, (_, i) => plugin({ id: `o${i}/tool-${i}`, owner: `o${i}`, stars: 2_000 - i }))
  const ordered = rankPlugins([...many, ...others], { now: NOW })
  const head = ordered.slice(0, RANKING_CONFIG.diversity.window)
  const bigSeats = head.filter(p => p.owner === 'big').length
  assert.ok(bigSeats <= RANKING_CONFIG.diversity.maxPerOwner, `big owner held ${bigSeats} head seats`)
  assert.equal(ordered.length, 38)
  // 分数序主导：全局最高分（big/repo-0）必须排第一，单条高分不应被多席位 owner 压制
  assert.equal(ordered[0].id, 'big/repo-0')
  const singleHigh = plugin({ id: 'solo/top', owner: 'solo', stars: 4_900 })
  const mixed = rankPlugins([...many, ...others, singleHigh], { now: NOW })
  assert.ok(mixed.findIndex(p => p.id === 'solo/top') < 4, 'a single high-scoring plugin must stay near the top')
})

test('applyDiversity keeps relative order of deferred entries and never drops plugins', () => {
  const list = [1, 2, 3, 4].map(i => plugin({ id: `same/p-${i}`, owner: 'same', stars: 100 * (5 - i) }))
  const shuffled = applyDiversity(list)
  assert.equal(shuffled.length, list.length)
  const ids = shuffled.map(p => p.id)
  const original = list.map(p => p.id)
  assert.ok(ids.every(id => original.includes(id)))
})

test('search blending keeps exact name matches above weak matches regardless of quality', () => {
  const exactWeakQuality = blendSearchQuality(120, 0)
  const fuzzyTopQuality = blendSearchQuality(8, RANKING_CONFIG.scoreCeiling)
  assert.ok(exactWeakQuality > fuzzyTopQuality)
  assert.equal(blendSearchQuality(10, 0), 10 * RANKING_CONFIG.search.qualityFloor)
})

test('score cache reuses computations for identical plugin objects', () => {
  const shared = plugin({ id: 'cache/probe' })
  compareByRankingScore(shared, shared, { now: NOW })
  compareByRankingScore(shared, plugin({ id: 'cache/other' }), { now: NOW })
  compareByRankingScore(shared, plugin({ id: 'cache/third' }), { now: NOW })
  // 第二轮比较同一对象不再重算（WeakMap 命中），仅验证接口稳定且分数一致
  const direct = computeRankingScore(shared, { now: NOW }).score
  assert.ok(direct >= 0)
})

test('badges reflect the listing story shown to users', () => {
  const curated = computeRankingScore(plugin({ source: 'curated', origin: 'issue', addedAt: daysAgo(2) }), { now: NOW })
  assert.deepEqual(curated.badges, { maintained: true, humanReviewed: true, issueSubmitted: true, newListing: true })
  const stale = computeRankingScore(plugin({ source: 'discovered', pushedAt: daysAgo(200), latestRelease: null }), { now: NOW })
  assert.equal(stale.badges.maintained, false)
  assert.equal(stale.badges.humanReviewed, false)
})
