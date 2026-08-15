import { validateBundleManifest } from '../assets/bundle-manifest.js'

const CATEGORY_RULES = [
  ['market', /market(?:place)?|plugin[ ._-]?(?:manager|browser|catalog|store)|registry|插件(?:市场|商店|管理器)/i],
  ['session', /session|conversation|chat[ ._-]?history|message[ ._-]?history|会话|对话|聊天记录|消息历史/i],
  ['fun', /desktop[ ._-]?pet|\bpet\b|wallpaper|music|game|emoji|桌宠|壁纸|音乐|娱乐/i],
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
  return validateBundleManifest(text).valid
}

export function repoKey(owner, name) {
  return `${owner}/${name}`.toLowerCase()
}

export function repositoryKey(plugin) {
  const match = String(plugin?.url || '').match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+)/)
  if (match) return repoKey(match[1], match[2])
  const idRepository = String(plugin?.id || '').split('#')[0]
  if (idRepository.includes('/')) return idRepository.toLowerCase()
  return repoKey(plugin?.owner || '', String(plugin?.name || '').split('#')[0])
}

function curatedIdentity(plugin) {
  const match = String(plugin.url || '').match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+)/)
  if (!match) return { id: `${plugin.owner}/${plugin.name}`, owner: plugin.owner }
  const [, repositoryOwner, repositoryName] = match
  const qualifier = plugin.name === repositoryName
    ? ''
    : (plugin.name.startsWith(`${repositoryName}#`) ? plugin.name.slice(repositoryName.length + 1) : plugin.name)
  return {
    id: `${repositoryOwner}/${repositoryName}${qualifier ? `#${qualifier}` : ''}`,
    owner: repositoryOwner,
  }
}

export function normalizeCurated(plugin, metadata = {}) {
  const identity = curatedIdentity(plugin)
  const owner = identity.owner
  const name = plugin.name
  return {
    id: identity.id,
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
    language: metadata.language || plugin.language || '',
    license: metadata.license || plugin.license || '',
    latestRelease: metadata.latestRelease || plugin.latestRelease || null,
    pushedAt: metadata.pushedAt || null,
    addedAt: plugin.added || null,
    source: 'curated',
    trustLevel: 'curated',
    listingEligible: true,
    verification: {
      manifest: 'not_checked',
      patch: 'not_checked',
      installation: 'not_tested',
    },
    install: plugin.install || `dsh plugin --profile web add github:${owner}/${name}`,
    archived: Boolean(metadata.isArchived),
    topics: metadata.repositoryTopics?.nodes?.map(node => node.topic.name) || [],
    icon: plugin.icon || metadata.avatarUrl || `https://github.com/${owner}.png?size=96`,
  }
}

export function normalizeDiscovered(repository, manifestShapeValid, patchExists = null) {
  const [owner, name] = repository.full_name.split('/')
  const listingEligible = Boolean(manifestShapeValid && patchExists !== false)
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
    language: repository.language || '',
    license: repository.license || '',
    latestRelease: repository.latest_release ? {
      tag: repository.latest_release.tag || '',
      publishedAt: repository.latest_release.published_at || null,
    } : null,
    pushedAt: repository.pushed_at || null,
    addedAt: null,
    source: 'discovered',
    trustLevel: listingEligible ? 'manifest_verified' : 'pending_review',
    listingEligible,
    verification: {
      manifest: manifestShapeValid ? 'shape_validated' : 'not_validated',
      patch: manifestShapeValid
        ? (patchExists === true ? 'exists' : (patchExists === false ? 'missing' : 'not_checked'))
        : 'not_checked',
      installation: 'not_tested',
    },
    install: `dsh plugin --profile web add github:${repository.full_name}`,
    archived: Boolean(repository.archived),
    topics: repository.topics || [],
    icon: repository.icon || repository.owner?.avatar_url || `https://github.com/${owner}.png?size=96`,
  }
}

const OVERRIDABLE_FIELDS = ['name', 'description', 'category', 'icon', 'install', 'special']

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
    const key = repositoryKey(plugin)
    const entryKey = String(plugin.id || '').toLowerCase()
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
    published.push(applyOverride(plugin, patches[entryKey] || patches[key] || {}))
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
  for (const plugin of discovered) registry.set(String(plugin.id).toLowerCase(), plugin)
  for (const plugin of curated) registry.set(String(plugin.id).toLowerCase(), plugin)
  return [...registry.values()]
    .filter(plugin => !plugin.archived && plugin.listingEligible)
    .sort((a, b) => b.stars - a.stars || a.id.localeCompare(b.id))
}

export function toPublicPlugin(plugin) {
  const { listingEligible, ...publicPlugin } = plugin
  return publicPlugin
}
