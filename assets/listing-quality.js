/*
 * 低信号条目：默认浏览列表隐藏、但仍保留在快照、详情页与「全部条目」筛选中的可安装插件。
 * 只用快照已有字段在浏览端/构建端计算，不改快照结构、不增加部署文件体积。
 * 阈值集中在 LISTING_QUALITY_CONFIG，依据见 docs/registry-governance.md。
 */
export const LISTING_QUALITY_CONFIG = {
  // 同一 owner 的已收录条目数达到该值即视为批量发布者（2026-11 快照 owner 条目数 P99.9 = 27）
  bulkPublisherMinListings: 50,
}

export const LOW_SIGNAL_REASONS = {
  bulkPublisher: 'bulk_publisher',
  duplicate: 'duplicate',
}

// 人工审核、issue 申请或特别收录的条目不参与自动降级。
function exempt(plugin) {
  return plugin.source === 'curated' || plugin.origin === 'issue' || Boolean(plugin.special || plugin.recommendationSource)
}

// 条目自身是否有任何外部采用或发布信号。
function adopted(plugin) {
  return (plugin.stars || 0) > 0 || (plugin.forks || 0) > 0 || Boolean(plugin.latestRelease)
}

function duplicateKeys(plugin) {
  const keys = []
  if (typeof plugin.verifiedCommit === 'string' && /^[0-9a-f]{40}$/.test(plugin.verifiedCommit)) keys.push('commit:' + plugin.verifiedCommit)
  const description = String(plugin.description?.zh || plugin.description?.en || '').trim().toLowerCase()
  if (description) keys.push('copy:' + String(plugin.name || '').toLowerCase() + '\n' + description)
  return keys
}

// 重复组内保留信号最强的一条：豁免条目 > Stars > 有 Release > Forks > id 字典序。
function compareCanonical(a, b) {
  return Number(exempt(b)) - Number(exempt(a))
    || (b.stars || 0) - (a.stars || 0)
    || Number(Boolean(b.latestRelease)) - Number(Boolean(a.latestRelease))
    || (b.forks || 0) - (a.forks || 0)
    || String(a.id || '').localeCompare(String(b.id || ''))
}

/* 返回 Map<小写 id, 原因数组>，只包含低信号条目。 */
export function classifyLowSignal(plugins, config = LISTING_QUALITY_CONFIG) {
  const ownerCounts = new Map()
  const groups = new Map()
  for (const plugin of plugins) {
    const owner = String(plugin.owner || '').toLowerCase()
    ownerCounts.set(owner, (ownerCounts.get(owner) || 0) + 1)
    for (const key of duplicateKeys(plugin)) {
      const group = groups.get(key)
      if (group) group.push(plugin)
      else groups.set(key, [plugin])
    }
  }

  const reasons = new Map()
  const flag = (plugin, reason) => {
    const id = String(plugin.id || '').toLowerCase()
    const list = reasons.get(id) || []
    if (!list.includes(reason)) list.push(reason)
    reasons.set(id, list)
  }

  for (const plugin of plugins) {
    if (exempt(plugin) || adopted(plugin)) continue
    if (ownerCounts.get(String(plugin.owner || '').toLowerCase()) >= config.bulkPublisherMinListings) flag(plugin, LOW_SIGNAL_REASONS.bulkPublisher)
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const [, ...copies] = [...group].sort(compareCanonical)
    for (const plugin of copies) if (!exempt(plugin)) flag(plugin, LOW_SIGNAL_REASONS.duplicate)
  }
  return reasons
}

/* 默认列表：去掉低信号条目后的已收录插件。 */
export function partitionListing(plugins, config = LISTING_QUALITY_CONFIG) {
  const reasons = classifyLowSignal(plugins, config)
  const standard = []
  const lowSignal = []
  for (const plugin of plugins) (reasons.has(String(plugin.id || '').toLowerCase()) ? lowSignal : standard).push(plugin)
  return { standard, lowSignal, reasons }
}
