const CATEGORY_RULES = [
  ['theme', /theme|skin|appearance|pixel|主题|皮肤/i],
  ['ui', /\bui\b|sidebar|desktop|tui|webview|界面|侧边栏|桌面/i],
  ['memory', /memory|recall|knowledge.graph|记忆|知识图谱/i],
  ['notify', /notif|message|integration|webhook|通知|集成/i],
  ['model', /model|provider|router|token|模型|路由/i],
  ['workflow', /workflow|automat|schedule|orchestrat|agent.team|工作流|自动化|编排/i],
  ['skill', /\bskill|技能/i],
  ['dev', /runtime|debug|develop|sandbox|test|profile|开发|调试|沙箱/i],
]

export function inferCategory(repository) {
  const haystack = [
    repository.name,
    repository.description,
    ...(repository.topics || []),
  ].filter(Boolean).join(' ')
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(haystack))?.[0] || 'tools'
}

export function hasBundleManifest(text) {
  if (!text) return false
  try {
    const pkg = JSON.parse(text)
    return Boolean(pkg?.dsh?.bundle && typeof pkg.dsh.bundle === 'object')
  } catch {
    return false
  }
}

export function repoKey(owner, name) {
  return `${owner}/${name}`.toLowerCase()
}

export function normalizeCurated(plugin, metadata = {}) {
  const owner = plugin.owner
  const name = plugin.name
  return {
    id: `${owner}/${name}`,
    name,
    owner,
    url: plugin.url || `https://github.com/${owner}/${name}`,
    description: {
      zh: plugin.description?.zh || plugin.description?.en || '',
      en: plugin.description?.en || plugin.description?.zh || '',
    },
    category: plugin.category || 'tools',
    stars: metadata.stargazerCount ?? plugin.stars ?? 0,
    forks: metadata.forkCount ?? 0,
    pushedAt: metadata.pushedAt || null,
    addedAt: plugin.added || null,
    source: 'curated',
    trustLevel: 'curated',
    verified: true,
    installable: true,
    install: plugin.install || `dsh plugin --profile web add github:${owner}/${name}`,
    archived: Boolean(metadata.isArchived),
    topics: metadata.repositoryTopics?.nodes?.map(node => node.topic.name) || [],
    icon: plugin.icon || metadata.avatarUrl || `https://github.com/${owner}.png?size=96`,
  }
}

export function normalizeDiscovered(repository, installable) {
  const [owner, name] = repository.full_name.split('/')
  return {
    id: repository.full_name,
    name,
    owner,
    url: repository.html_url,
    description: {
      zh: repository.description || '',
      en: repository.description || '',
    },
    category: inferCategory(repository),
    stars: repository.stargazers_count || 0,
    forks: repository.forks_count || 0,
    pushedAt: repository.pushed_at || null,
    addedAt: null,
    source: 'discovered',
    trustLevel: installable ? 'manifest_verified' : 'pending_review',
    verified: Boolean(installable),
    installable: Boolean(installable),
    install: `dsh plugin --profile web add github:${repository.full_name}`,
    archived: Boolean(repository.archived),
    topics: repository.topics || [],
    icon: repository.icon || repository.owner?.avatar_url || `https://github.com/${owner}.png?size=96`,
  }
}

const OVERRIDABLE_FIELDS = ['name', 'description', 'category', 'icon', 'install']

export function applyOverride(plugin, override = {}) {
  const next = { ...plugin }
  for (const field of OVERRIDABLE_FIELDS) {
    if (override[field] === undefined) continue
    next[field] = field === 'description'
      ? { ...plugin.description, ...override.description }
      : override[field]
  }
  return next
}

export function applyGovernance(plugins, blocklist = {}, overrides = {}) {
  const blocked = new Map((blocklist.repositories || []).map(entry => [String(entry.repo).toLowerCase(), entry]))
  const patches = overrides.plugins || {}
  const published = []
  const quarantined = []

  for (const plugin of plugins) {
    const key = repoKey(plugin.owner, plugin.name)
    const block = blocked.get(key)
    if (block) {
      quarantined.push({
        id: plugin.id,
        url: plugin.url,
        trustLevel: 'quarantined',
        reason: block.reason || 'Blocked by registry maintainers',
      })
      continue
    }
    published.push(applyOverride(plugin, patches[key] || patches[plugin.id] || {}))
  }
  return { plugins: published, quarantined }
}

export function validateHealth(next, previous, options = {}) {
  const errors = []
  if (!previous?.plugins?.length) return errors
  if (options.allowUnsafe || process.env.DSH_SYNC_ALLOW_UNSAFE === '1') return errors

  const previousMode = previous.stats?.discoveryMode
  const nextMode = next.stats?.discoveryMode
  if (previousMode === 'complete' && nextMode !== 'complete') {
    errors.push('A partial discovery run cannot overwrite a complete registry snapshot.')
    return errors
  }

  if (nextMode !== 'complete') return errors
  const publishedRatio = options.publishedRatio ?? Number(process.env.DSH_MIN_PUBLISHED_RATIO || 0.8)
  const curatedRatio = options.curatedRatio ?? Number(process.env.DSH_MIN_CURATED_RATIO || 0.85)
  const previousPublished = previous.stats?.published ?? previous.plugins.length
  const previousCurated = previous.stats?.curated ?? previous.plugins.filter(plugin => plugin.source === 'curated').length
  const nextPublished = next.stats?.published ?? next.plugins.length
  const nextCurated = next.stats?.curated ?? next.plugins.filter(plugin => plugin.source === 'curated').length

  if (nextPublished < Math.floor(previousPublished * publishedRatio)) {
    errors.push(`Published plugins dropped from ${previousPublished} to ${nextPublished} (minimum allowed: ${Math.floor(previousPublished * publishedRatio)}).`)
  }
  if (nextCurated < Math.floor(previousCurated * curatedRatio)) {
    errors.push(`Curated plugins dropped from ${previousCurated} to ${nextCurated} (minimum allowed: ${Math.floor(previousCurated * curatedRatio)}).`)
  }
  return errors
}

export function mergePlugins(curated, discovered) {
  const registry = new Map()
  for (const plugin of discovered) registry.set(repoKey(plugin.owner, plugin.name), plugin)
  for (const plugin of curated) registry.set(repoKey(plugin.owner, plugin.name), plugin)
  return [...registry.values()]
    .filter(plugin => !plugin.archived && plugin.installable)
    .sort((a, b) => b.stars - a.stars || a.id.localeCompare(b.id))
}
