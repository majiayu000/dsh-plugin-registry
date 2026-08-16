/*
 * 智能推荐打分：信任分层（乘法）× 热度/维护/完整度（加法）+ 新收录退火。
 * 设计参考：Hacker News 幂律时间衰减、Reddit log 压缩（防头部垄断）、
 * Elasticsearch function_score 的乘法融合。权重集中在 RANKING_CONFIG，调整只动这里。
 */
export const RANKING_CONFIG = {
  // log10(1+stars) 的归一标尺：约等于数据集头部仓库，超过后饱和（P99 截断的固定常数近似，
  // 不随数据集漂移，且不改变 stars 项与 forks 项之间的配比语义）
  popStarScale: 20_000,
  popForkScale: 2_000,
  popStarWeight: 0.65,
  popForkWeight: 0.35,
  // 维护新鲜度：90 天半衰期（生态迭代快，一个季度不动≈停滞；一年≈0.06）
  maintenanceHalfLifeDays: 90,
  // pushedAt / latestRelease 都缺失时的中性分：不奖励也不惩罚
  missingMaintenanceScore: 0.4,
  // 信任乘法分层。issue 提交叠乘在 curated 上 ≈ 1.20 × 1.125 = 1.35
  trust: {
    verifiedChain: 1.12,
    curated: 1.20,
    issueSubmitted: 1.125,
    special: 1.15,
  },
  weights: { pop: 0.55, maint: 0.30, polish: 0.15 },
  // 列表完整度微调：只做 tiebreak，单项贡献远小于一个数量级的差距
  polish: { license: 0.04, release: 0.04, description: 0.04, icon: 0.03 },
  // 新收录（含 issue 审核通过）14 天线性退火助推
  boost: { amount: 0.35, days: 14 },
  // 搜索融合：文本相关分 × 质量包络，0.6 保底防止长尾质量分让精准匹配消失
  search: { qualityFloor: 0.6, qualityWeight: 0.4 },
  // score 的理论近似上限（trust 1.35 × 全因子满分 1.37），用于归一展示
  scoreCeiling: 1.85,
  // 多样性：前 24 席每 owner 最多 4 席（2 段×2 席），且任何 owner 不连续占 3 席
  diversity: { window: 24, maxPerOwner: 4, maxConsecutive: 2 },
}

function daysSince(value, now) {
  if (!value) return null
  const time = Date.parse(value)
  if (Number.isNaN(time)) return null
  return Math.max(0, (now - time) / 86_400_000)
}

function trustMultiplier(plugin, trust) {
  let multiplier = 1
  if (plugin.verification?.patch === 'exists' && typeof plugin.verifiedCommit === 'string' && /^[0-9a-f]{40}$/.test(plugin.verifiedCommit)) {
    multiplier *= trust.verifiedChain
  }
  if (plugin.source === 'curated') multiplier *= trust.curated
  if (plugin.origin === 'issue') multiplier *= trust.issueSubmitted
  if (plugin.special || plugin.recommendationSource) multiplier *= trust.special
  return multiplier
}

export function computeRankingScore(plugin, options = {}) {
  const config = options.config || RANKING_CONFIG
  const now = options.now ?? Date.now()

  const starNorm = Math.min(1, Math.log10(1 + (plugin.stars || 0)) / Math.log10(1 + config.popStarScale))
  const forkNorm = plugin.forks == null
    ? 0
    : Math.min(1, Math.log10(1 + plugin.forks) / Math.log10(1 + config.popForkScale))
  const pop = config.popStarWeight * starNorm + config.popForkWeight * forkNorm

  // 有 release 用 release（改 README 不算维护）；两者皆缺用中性分
  const activityDays = daysSince(plugin.latestRelease?.publishedAt, now) ?? daysSince(plugin.pushedAt, now)
  const maint = activityDays == null
    ? config.missingMaintenanceScore
    : Math.pow(2, -activityDays / config.maintenanceHalfLifeDays)

  const trust = trustMultiplier(plugin, config.trust)

  const description = plugin.description || {}
  const polish =
    (plugin.license ? config.polish.license : 0)
    + (plugin.latestRelease?.tag ? config.polish.release : 0)
    + (description.zh && description.en ? config.polish.description : 0)
    + (plugin.icon ? config.polish.icon : 0)

  const addedDays = daysSince(plugin.addedAt, now)
  const boost = addedDays == null
    ? 0
    : config.boost.amount * Math.max(0, 1 - addedDays / config.boost.days)

  const score = trust * (
    config.weights.pop * pop
    + config.weights.maint * maint
    + config.weights.polish * polish
    + boost
  )

  return {
    score,
    breakdown: { pop, maint, trust, polish, boost },
    badges: {
      maintained: maint >= 0.5,
      humanReviewed: plugin.source === 'curated',
      issueSubmitted: plugin.origin === 'issue',
      newListing: boost > 0,
    },
  }
}

const scoreCache = new WeakMap()

function cachedScore(plugin, now) {
  let entry = scoreCache.get(plugin)
  if (!entry || entry.now !== now) {
    entry = { now, ranking: computeRankingScore(plugin, { now }) }
    scoreCache.set(plugin, entry)
  }
  return entry.ranking.score
}

/* 与旧 compareDefaultPluginOrder 同序位替换：pending 候选沉底，其余按推荐分降序 */
export function compareByRankingScore(a, b, options = {}) {
  const now = options.now ?? Date.now()
  const tier = plugin => (plugin.trustLevel === 'pending_review' ? 1 : 0)
  return tier(a) - tier(b)
    || cachedScore(b, now) - cachedScore(a, now)
    || String(a.id || '').localeCompare(String(b.id || ''))
}

export function normalizeRankingScore(score, config = RANKING_CONFIG) {
  return Math.max(0, Math.min(1, score / config.scoreCeiling))
}

/* 搜索模式融合：relevance × (floor + weight × 归一推荐分) */
export function blendSearchQuality(relevance, score, config = RANKING_CONFIG) {
  return relevance * (config.search.qualityFloor + config.search.qualityWeight * normalizeRankingScore(score, config))
}

/* 多样性后处理：只重排席位，不改分数。
   输出顺序由原分数序主导；仅当放入会造成同一 owner 连续第 3 席、
   或在前 window 席内超过每 owner 席位上限时顺延，被顺延的多轮回填。
   若剩余条目全部属于同一 owner（物理上无法再穿插），按原序接受。 */
export function applyDiversity(plugins, config = RANKING_CONFIG) {
  const { window, maxPerOwner, maxConsecutive } = config.diversity
  const headSeats = new Map()
  const out = []
  const tailRun = owner => {
    let run = 0
    for (let i = out.length - 1; i >= 0 && out[i].owner === owner; i -= 1) run += 1
    return run
  }
  const tryPlace = plugin => {
    if (out.length < window && (headSeats.get(plugin.owner) || 0) >= maxPerOwner) return false
    if (tailRun(plugin.owner) >= maxConsecutive) return false
    if (out.length < window) headSeats.set(plugin.owner, (headSeats.get(plugin.owner) || 0) + 1)
    out.push(plugin)
    return true
  }
  let pending = plugins
  for (let round = 0; pending.length && round < 20; round += 1) {
    const deferred = []
    for (const plugin of pending) {
      if (!tryPlace(plugin)) deferred.push(plugin)
    }
    if (deferred.length === pending.length) break
    pending = deferred
  }
  return out.concat(pending)
}

export function rankPlugins(plugins, options = {}) {
  const now = options.now ?? Date.now()
  const ranked = [...plugins].sort((a, b) => compareByRankingScore(a, b, { now }))
  return options.diversity === false ? ranked : applyDiversity(ranked, options.config)
}
