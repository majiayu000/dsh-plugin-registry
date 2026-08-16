/*
 * 真实数据排序对比：加载 public/data/plugins.json，跑"纯 stars 旧排序"与"智能推荐新排序"，
 * 打印对照报告，并断言数据无关的不变量（不写死任何插件名，数据每 2 小时刷新后依然有效）。
 * 调整 RANKING_CONFIG 或排序/多样性逻辑后必须跑：bun run check:ranking
 */
import { readFile } from 'node:fs/promises'
import { RANKING_CONFIG, computeRankingScore, rankPlugins } from '../assets/registry-ranking.js'

const registry = JSON.parse(await readFile(new URL('../public/data/plugins.json', import.meta.url), 'utf8'))
const plugins = registry.plugins
const now = Date.now()

const byStars = [...plugins].sort((a, b) => b.stars - a.stars || a.id.localeCompare(b.id))
const byScore = [...plugins].sort((a, b) => computeRankingScore(b, { now }).score - computeRankingScore(a, { now }).score)
const ranked = rankPlugins(plugins, { now })
const rankOf = id => ranked.findIndex(p => p.id === id) + 1
const starRankOf = id => byStars.findIndex(p => p.id === id) + 1

const failures = []
const check = (ok, message) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + message)
  if (!ok) failures.push(message)
}

console.log(`\n真实数据排序检查：${plugins.length} 个插件，window=${RANKING_CONFIG.diversity.window}\n`)

/* ---- 不变量断言 ---- */
check(ranked.length === plugins.length, `完整性：输出 ${ranked.length} 条 = 输入 ${plugins.length} 条（不丢不重）`)

const idSignature = list => [...list.map(p => p.id)].sort().join('|')
check(idSignature(ranked) === idSignature(plugins), '完整性：输出 id 集合与输入完全一致')

check(ranked[0].id === byScore[0].id,
  `分数序主导：第 1 名是全场最高分 ${byScore[0].id}（score ${computeRankingScore(byScore[0], { now }).score.toFixed(3)}），实际第 1 名 ${ranked[0].id}`)

const head = ranked.slice(0, RANKING_CONFIG.diversity.window)
const seats = new Map()
for (const p of head) seats.set(p.owner, (seats.get(p.owner) || 0) + 1)
const [worstOwner, worstSeats] = [...seats.entries()].sort((a, b) => b[1] - a[1])[0] || ['-', 0]
check(worstSeats <= RANKING_CONFIG.diversity.maxPerOwner,
  `防霸屏：head window 内最大 owner ${worstOwner} 占 ${worstSeats} 席（上限 ${RANKING_CONFIG.diversity.maxPerOwner}）`)

let triples = 0
for (let i = 2; i < ranked.length && i < 100; i += 1) {
  if (ranked[i - 2].owner === ranked[i - 1].owner && ranked[i - 1].owner === ranked[i].owner) triples += 1
}
check(triples === 0, `无 3 连：前 100 名同 owner 连续 3 席出现 ${triples} 次`)

check(plugins.every(p => Number.isFinite(computeRankingScore(p, { now }).score)), '数值健康：所有插件分数均为有限数')

/* ---- 对照报告（只观察，不断言） ---- */
const describe = (p, i) =>
  `${String(i + 1).padStart(3)}  ${p.id.slice(0, 36).padEnd(36)} ★${String(p.stars).padStart(6)}`
  + `${p.origin === 'issue' ? ' [issue]' : p.source === 'curated' ? ' [curated]' : '           '}`
  + `  更新 ${String(p.pushedAt || '').slice(0, 10)}`

console.log('\n---- 旧排序（纯 stars）top 15 ----')
byStars.slice(0, 15).forEach((p, i) => console.log(describe(p, i)))
console.log('\n---- 新排序（智能推荐）top 15 ----')
ranked.slice(0, 15).forEach((p, i) => console.log(describe(p, i)))

const issuePlugins = plugins.filter(p => p.origin === 'issue')
if (issuePlugins.length) {
  console.log('\n---- issue 收录插件位移 ----')
  for (const p of issuePlugins) {
    const movement = starRankOf(p.id) - rankOf(p.id)
    console.log(`${p.id.padEnd(36)} #${starRankOf(p.id)} → #${rankOf(p.id)}  ${movement > 0 ? '↑' + movement : movement < 0 ? '↓' + (-movement) : '—'}  score ${computeRankingScore(p, { now }).score.toFixed(3)}`)
  }
}

const oldTop = new Set(byStars.slice(0, 30).map(p => p.id))
const overlap = ranked.slice(0, 30).filter(p => oldTop.has(p.id)).length
console.log(`\n新旧 top 30 重叠 ${overlap}/30（boost 窗口期内 curated 整体上位会拉低重叠，属预期；长期过低说明排序翻车）`)

if (failures.length) {
  console.error(`\n${failures.length} 项不变量失败：`)
  for (const failure of failures) console.error('  - ' + failure)
  process.exitCode = 1
} else {
  console.log('\n全部不变量通过。')
}
