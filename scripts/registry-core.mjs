import { validateBundleManifest } from '../assets/bundle-manifest.js'
import { INSTALL_PROFILES, buildInstallCommand, packageNameFromSpec, parseInstallCommand, pinInstallCommand } from '../assets/install-command.js'

export const REGISTRY_CATEGORIES = {
  ui: { en: 'UI Enhancements', zh: 'UI 增强' },
  theme: { en: 'Themes & Appearance', zh: '主题与外观' },
  client: { en: 'Clients & Runtime Interfaces', zh: '客户端与运行界面' },
  model: { en: 'Models & Providers', zh: '模型与账号接入' },
  session: { en: 'Sessions & Messages', zh: '会话与消息' },
  memory: { en: 'Memory', zh: '记忆' },
  tools: { en: 'Tools & Capabilities', zh: '工具与能力' },
  skill: { en: 'Skills', zh: '技能包' },
  workflow: { en: 'Workflow & Automation', zh: '工作流与自动化' },
  notify: { en: 'Notifications & Integrations', zh: '通知与集成' },
  dev: { en: 'Development & Runtime', zh: '开发与运行时' },
  market: { en: 'Plugin Markets & Managers', zh: '插件市场与管理' },
  resource: { en: 'Resources, Guides & Directories', zh: '资源、教程与导航' },
  fun: { en: 'Just for Fun', zh: '娱乐' },
}

const CATEGORY_RULES = [
  ['memory', /memory|recall|knowledge[ ._-]?graph|context[ ._-]?(?:store|manager)|记忆|知识图谱|上下文存储/i],
  ['notify', /notif|webhook|\bchannel\b|slack|discord|telegram|feishu|lark|dingtalk|email|ntfy|push[ ._-]?(?:message|service)|通知|推送|飞书|钉钉/i],
  ['session', /session[ ._-]?(?:manager|management|history|browser|search|export|backup|delete|cleanup|analytics|share|sync|archive|tool)|conversation[ ._-]?(?:history|manager|search|export)|chat[ ._-]?history|message[ ._-]?history|transcript|会话(?:管理|历史|搜索|导出|删除|清理|分析|分享|同步|归档)|对话历史|聊天记录|消息历史/i],
  ['model', /model|provider|router|gateway|token|quota|pricing|billing|模型|供应商|路由|令牌|额度|计费/i],
  ['workflow', /workflow|automat|schedule|orchestrat|agent[ ._-]?team|pipeline|工作流|自动化|编排|定时任务/i],
  ['skill', /\bskill|技能/i],
  ['dev', /runtime|debug|develop|sandbox|test|profile|benchmark|observab|开发|调试|沙箱|测试/i],
  ['ui', /\bui\b|sidebar|panel|dashboard|webview|frontend|界面|侧边栏|面板/i],
]

function descriptionText(description) {
  if (!description || typeof description === 'string') return description || ''
  return Object.values(description).filter(value => typeof value === 'string').join(' ')
}

export function mergeRegistryCategories(categories = {}) {
  return Object.fromEntries(Object.entries(REGISTRY_CATEGORIES).map(([key, labels]) => [
    key,
    { ...categories[key], ...labels },
  ]))
}

export function inferCategory(repository, fallback = 'tools') {
  const identity = String(repository.id || repository.name || '')
  const name = String(repository.name || identity).toLowerCase()
  const description = descriptionText(repository.description).toLowerCase()
  const topics = (repository.topics || []).map(topic => String(topic).toLowerCase())
  const haystack = [identity, name, description, ...topics].filter(Boolean).join(' ')
  const isQualifiedEntry = identity.includes('#') || name.includes('#')

  const resourceName = /^(?:awesome[-_.](?:deepseek[-_.](?:harness|skills)|dsh)(?:[-_.](?:plugin|plugins|bridges))?|dsh[-_.](?:resources?|tutorial|handbook|course))$|from[-_.]?scratch|plugin[-_.]?(?:dev[-_.]?)?guide$/i.test(name)
  const resourceDescription = /curated (?:list|directory)|awesome list|plugin (?:directory|catalog)|development guide|beginner(?:'s)? guide|getting started guide|学习资料|入门教程|开发教程|插件(?:目录|指南)|精选.{0,6}(?:列表|目录)|资源(?:导航|推荐|合集)/i.test(description)
  if (!isQualifiedEntry && resourceName) return 'resource'

  if (/market(?:place)?|plugin[ ._-]?(?:manager|browser|catalog|store|search)|registry|插件(?:市场|商店|管理器)/i.test(haystack)) return 'market'
  if (!isQualifiedEntry && resourceDescription) return 'resource'
  if (/theme|skin|appearance|customi[sz](?:ation|er)|主题|皮肤|外观/i.test(haystack)) return 'theme'
  if (/desktop[ ._-]?pet|(?:^|[ ._-])pet(?:$|[ ._-])|wallpaper|music|game|emoji|桌宠|壁纸|音乐|娱乐/i.test(haystack)) return 'fun'

  const clientName = /(?:^|[-_.])(desktop|tui|launcher)(?:$|[-_.])/i.test(name)
  const clientTopic = topics.some(topic => ['desktop-app', 'desktop-client', 'desktop-application', 'tui', 'launcher'].includes(topic))
  const clientDescription = /terminal (?:ui|client|front door)|standalone (?:client|desktop|tui)|local-first desktop workspace|ai agent desktop app|终端(?:界面|客户端)/i.test(description)
  const modelSpecificName = /(?:^|[-_.])(pricing|quota|billing|token|model|provider|router)(?:$|[-_.])/i.test(name)
  if (modelSpecificName) return 'model'
  if ((clientName || clientTopic || clientDescription) && !modelSpecificName) return 'client'

  const fallbackAliases = { skin: 'theme', channel: 'notify' }
  const canonicalFallback = fallbackAliases[fallback] || fallback
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(haystack))?.[0]
    || (Object.hasOwn(REGISTRY_CATEGORIES, canonicalFallback) ? canonicalFallback : 'tools')
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

export function bundleDirectoryFromUrl(url) {
  const match = String(url || '').match(/^https:\/\/github\.com\/[^/]+\/[^/]+\/tree\/[^/]+\/(.+?)\/?$/)
  return match ? match[1].replace(/\/+$/, '') : ''
}

export function verificationCacheKey(repositoryName, directory = '') {
  const repo = String(repositoryName || '').toLowerCase()
  return directory ? `${repo}#${directory}` : repo
}

function patchStatusFromEvidence(manifestShapeValid, patchExists) {
  if (!manifestShapeValid) return 'not_checked'
  if (patchExists === true) return 'exists'
  if (patchExists === false) return 'missing'
  if (patchExists === 'invalid') return 'invalid'
  return 'not_checked'
}

export function isInstallableEvidence({ manifestShapeValid, patchExists } = {}) {
  return Boolean(manifestShapeValid && patchExists === true)
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

export function normalizeCurated(plugin, metadata = {}, evidence = {}) {
  const identity = curatedIdentity(plugin)
  const owner = identity.owner
  const name = plugin.name
  const topics = metadata.repositoryTopics?.nodes?.map(node => node.topic.name) || plugin.topics || []
  const description = {
    zh: plugin.description?.zh || plugin.description?.en || '',
    en: plugin.description?.en || plugin.description?.zh || '',
  }
  const declaredCategory = plugin.category
  const category = Object.hasOwn(REGISTRY_CATEGORIES, declaredCategory)
    ? declaredCategory
    : inferCategory({ id: identity.id, name, description, topics }, declaredCategory || 'tools')
  const checked = evidence.checked === true
  const manifestShapeValid = evidence.manifestShapeValid === true
  const patchExists = evidence.patchExists
  const listingEligible = !checked || isInstallableEvidence({ manifestShapeValid, patchExists })
  const parsedInstall = parseInstallCommand(plugin.install)
  const repositoryName = String(identity.id).split('#')[0]
  const spec = parsedInstall?.spec || `github:${repositoryName}`
  const profile = parsedInstall?.profile || evidence.profile || 'web'
  const verifiedCommit = evidence.verifiedCommit || metadata.verifiedCommit || ''
  const packageName = evidence.packageName || packageNameFromSpec(spec)
  return {
    id: identity.id,
    name,
    owner,
    url: plugin.url || `https://github.com/${owner}/${name}`,
    description,
    category,
    stars: metadata.stargazerCount ?? plugin.stars ?? 0,
    forks: metadata.forkCount ?? plugin.forks ?? 0,
    language: metadata.language || plugin.language || '',
    license: metadata.license || plugin.license || '',
    latestRelease: metadata.latestRelease || plugin.latestRelease || null,
    pushedAt: metadata.pushedAt || null,
    addedAt: plugin.added || null,
    source: 'curated',
    trustLevel: 'curated',
    listingEligible,
    verification: {
      manifest: checked ? (manifestShapeValid ? 'shape_validated' : 'not_validated') : 'not_checked',
      patch: checked ? patchStatusFromEvidence(manifestShapeValid, patchExists) : 'not_checked',
      installation: 'not_tested',
    },
    install: buildInstallCommand({ profile, spec, verifiedCommit }),
    profile: INSTALL_PROFILES.includes(profile) ? profile : 'web',
    ...(packageName ? { packageName } : {}),
    ...(verifiedCommit ? { verifiedCommit } : {}),
    archived: Boolean(metadata.isArchived),
    topics,
    icon: plugin.icon || metadata.avatarUrl || `https://github.com/${owner}.png?size=96`,
  }
}

export function normalizeDiscovered(repository, manifestShapeValid, patchExists = null, verifiedCommit = '', options = {}) {
  const [owner, name] = repository.full_name.split('/')
  const listingEligible = isInstallableEvidence({ manifestShapeValid, patchExists }) || Boolean(manifestShapeValid && patchExists == null)
  const directory = options.directory || ''
  const qualifier = directory ? `#${directory.split('/').filter(Boolean).pop()}` : ''
  const profile = INSTALL_PROFILES.includes(options.profile) ? options.profile : 'web'
  const spec = options.spec || `github:${repository.full_name}`
  const packageName = options.packageName || packageNameFromSpec(spec)
  return {
    id: options.id || `${repository.full_name}${qualifier}`,
    name: options.name || (qualifier ? `${name}${qualifier}` : name),
    owner,
    url: options.url || repository.html_url,
    ...(verifiedCommit ? { verifiedCommit } : {}),
    description: {
      zh: repository.description || '',
      en: repository.description || '',
    },
    category: inferCategory({ ...repository, id: options.id || repository.full_name, name: options.name || name }),
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
      patch: patchStatusFromEvidence(manifestShapeValid, patchExists),
      installation: 'not_tested',
    },
    install: buildInstallCommand({ profile, spec, verifiedCommit }),
    profile,
    ...(packageName ? { packageName } : {}),
    archived: Boolean(repository.archived),
    topics: repository.topics || [],
    icon: repository.icon || repository.owner?.avatar_url || `https://github.com/${owner}.png?size=96`,
  }
}

const OVERRIDABLE_FIELDS = ['name', 'description', 'category', 'icon', 'install', 'special', 'recommendationSource', 'origin']

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
  const previousCuratedSource = previous.stats?.curatedSource ?? previous.stats?.curated ?? previous.plugins.filter(plugin => plugin.source === 'curated').length
  const nextPublished = next.stats?.published ?? next.plugins.length
  const nextCuratedSource = next.stats?.curatedSource ?? next.stats?.curated ?? next.plugins.filter(plugin => plugin.source === 'curated').length

  if (nextPublished < Math.floor(previousPublished * publishedRatio)) {
    errors.push(`Published plugins dropped from ${previousPublished} to ${nextPublished} (minimum allowed: ${Math.floor(previousPublished * publishedRatio)}).`)
  }
  if (nextCuratedSource < Math.floor(previousCuratedSource * curatedRatio)) {
    errors.push(`Curated source dropped from ${previousCuratedSource} to ${nextCuratedSource} (minimum allowed: ${Math.floor(previousCuratedSource * curatedRatio)}).`)
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
  const install = pinInstallCommand(publicPlugin.install, { verifiedCommit: publicPlugin.verifiedCommit })
  const parsed = parseInstallCommand(install)
  const packageName = publicPlugin.packageName || packageNameFromSpec(parsed?.spec)
  return {
    ...publicPlugin,
    install,
    ...(parsed ? { profile: parsed.profile } : {}),
    ...(packageName ? { packageName } : {}),
  }
}
