import assert from 'node:assert/strict'
import test from 'node:test'
import { applyGovernance, bundleDirectoryFromUrl, canonicalGithubHtmlUrl, hasBundleManifest, hasPublishableGithubIdentity, inferCategory, mergePlugins, mergeRegistryCategories, normalizeCurated, normalizeDiscovered, parseGithubRepositoryUrl, repositoryKey, toPublicPlugin, validateHealth } from '../scripts/registry-core.mjs'

test('only a dsh.bundle with a safe relative patch passes manifest validation', () => {
  assert.equal(hasBundleManifest('{"dsh":{"bundle":{"patch":"./cordis.patch.yml"}}}'), true)
  assert.equal(hasBundleManifest('{"dsh":{"bundle":{}}}'), false)
  assert.equal(hasBundleManifest('{"dsh":{"bundle":[]}}'), false)
  assert.equal(hasBundleManifest('{"dsh":{"bundle":{"patch":"../outside.yml"}}}'), false)
  assert.equal(hasBundleManifest('{"dsh":{"bundle":{"patch":"/absolute.yml"}}}'), false)
  assert.equal(hasBundleManifest('{"dsh":{"client":{"platform":"web"}}}'), false)
  assert.equal(hasBundleManifest('not json'), false)
})

test('discovered repositories receive stable categories and install commands', () => {
  const plugin = normalizeDiscovered({
    full_name: 'acme/dsh-memory',
    html_url: 'https://github.com/acme/dsh-memory',
    description: 'Long-term memory for DSH',
    topics: ['dsh-plugin'],
    owner: { avatar_url: 'https://avatars.example/acme.png' },
    stargazers_count: 42,
    forks_count: 7,
    language: 'TypeScript',
    pushed_at: '2026-08-14T00:00:00Z',
  }, true)
  assert.equal(inferCategory({ name: plugin.name, description: plugin.description.en }), 'memory')
  assert.equal(plugin.install, 'dsh plugin --profile web add github:acme/dsh-memory')
  assert.equal(plugin.profile, 'web')
  assert.equal(plugin.listingEligible, true)
  assert.deepEqual(plugin.verification, { manifest: 'shape_validated', patch: 'not_checked', installation: 'not_tested' })
  assert.equal(plugin.trustLevel, 'manifest_verified')
  assert.equal(plugin.language, 'TypeScript')
  assert.equal(plugin.icon, 'https://avatars.example/acme.png')
})

test('automatic discovery can classify every public category family', () => {
  assert.equal(inferCategory({ name: 'dsh-session-export' }), 'session')
  assert.equal(inferCategory({ name: 'dsh-plugin-market' }), 'market')
  assert.equal(inferCategory({ name: 'dsh-desktop-pet' }), 'fun')
  assert.equal(inferCategory({ name: 'dsh-desktop-client' }), 'client')
  assert.equal(inferCategory({ name: 'dsh-TUI', description: 'Claude Code 风格全屏终端 UI：像素鲸鱼顶栏。', topics: ['tui'] }), 'client')
  assert.equal(inferCategory({ name: 'awesome-dsh-plugins' }), 'resource')
  assert.equal(inferCategory({ name: 'dsh-client-pricing' }), 'model')
  assert.equal(inferCategory({ name: 'dsh-gui-customization', description: 'Theme workshop' }), 'theme')
  assert.equal(inferCategory({ id: 'acme/dsh-suite#plugin-notify', name: 'dsh-suite#plugin-notify', description: 'Notifications' }), 'notify')
  assert.equal(inferCategory({ name: 'dsh-guide-dog', description: 'Image helper' }), 'tools')
  assert.equal(inferCategory({ name: 'dsh-web-mobile-fix', description: 'Web UI 移动端布局修复：插件导航单行排满' }), 'ui')
  assert.equal(inferCategory({ name: 'dsh-revdiff', description: 'Git diff review', topics: ['terminal-ui'] }), 'ui')
})

test('registry categories always use the canonical taxonomy', () => {
  const categories = mergeRegistryCategories({ custom: { en: 'Custom', zh: '自定义' } })
  assert.equal(categories.client.zh, '客户端与运行界面')
  assert.equal(categories.resource.zh, '资源、教程与导航')
  assert.equal('custom' in categories, false)
  assert.equal(inferCategory({ name: 'unclassified-entry' }, 'channel'), 'notify')
  assert.equal(inferCategory({ name: 'unclassified-entry' }, 'agent'), 'tools')
})

test('discovered plugins synthesize a GitHub URL when html_url is missing', () => {
  const plugin = normalizeDiscovered({
    full_name: 'acme/dsh-memory',
    description: 'Long-term memory for DSH',
  }, true, true)
  assert.equal(plugin.url, 'https://github.com/acme/dsh-memory')
  assert.equal(hasPublishableGithubIdentity(plugin), true)
})

test('mergePlugins drops installable plugins whose GitHub identity cannot be published', () => {
  const valid = normalizeDiscovered({
    full_name: 'acme/good-plugin',
    html_url: 'https://github.com/acme/good-plugin',
  }, true, true)
  const invalid = normalizeDiscovered({
    full_name: '_bad/plugin',
    html_url: 'https://github.com/_bad/plugin',
  }, true, true)
  assert.equal(parseGithubRepositoryUrl('https://github.com/_bad/plugin'), null)
  assert.equal(canonicalGithubHtmlUrl('_bad/plugin', 'https://github.com/_bad/plugin'), '')
  assert.equal(invalid.url, '')
  assert.equal(invalid.listingEligible, true)
  const merged = mergePlugins([], [valid, invalid])
  assert.deepEqual(merged.map(plugin => plugin.id), ['acme/good-plugin'])
})

test('a manifest whose referenced patch is missing is not installable', () => {
  const plugin = normalizeDiscovered({
    full_name: 'acme/broken-plugin',
    html_url: 'https://github.com/acme/broken-plugin',
  }, true, false)
  assert.equal(plugin.listingEligible, false)
  assert.equal(plugin.trustLevel, 'pending_review')
  assert.equal(plugin.verification.patch, 'missing')
})

test('curated entries override discovered duplicates', () => {
  const curated = normalizeCurated({ owner: 'Acme', name: 'plugin', description: { zh: '精选', en: 'Curated' } })
  const discovered = normalizeDiscovered({ full_name: 'acme/plugin', html_url: '#', description: 'Found', stargazers_count: 9 }, true)
  const merged = mergePlugins([curated], [discovered])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].source, 'curated')
  assert.equal(merged[0].trustLevel, 'curated')
  assert.deepEqual(merged[0].verification, { manifest: 'not_checked', patch: 'not_checked', installation: 'not_tested' })
})

test('curated monorepo entries use the repository URL as identity', () => {
  const plugin = normalizeCurated({
    owner: 'vectorize-io',
    name: 'hindsight#coding-agents',
    url: 'https://github.com/vectorize-io/hindsight/tree/main/hindsight-integrations/coding-agents',
    description: { zh: '长期记忆', en: 'Long-term memory' },
  })
  assert.equal(plugin.id, 'vectorize-io/hindsight#coding-agents')
  assert.equal(plugin.owner, 'vectorize-io')
  assert.equal(plugin.name, 'hindsight#coding-agents')
  assert.equal(repositoryKey(plugin), 'vectorize-io/hindsight')
})

test('curated monorepo entries apply current repository metadata', () => {
  const plugin = normalizeCurated({
    owner: 'vectorize-io',
    name: 'hindsight#coding-agents',
    url: 'https://github.com/vectorize-io/hindsight/tree/main/hindsight-integrations/coding-agents',
    stars: 19_981,
    description: { zh: '长期记忆', en: 'Long-term memory' },
  }, {
    stargazerCount: 20_005,
    forkCount: 1_413,
    language: 'Python',
    license: 'MIT',
    latestRelease: { tag: 'v1.0.0', publishedAt: '2026-08-15T00:00:00Z' },
    pushedAt: '2026-08-16T00:00:00Z',
    repositoryTopics: { nodes: [{ topic: { name: 'memory' } }] },
    avatarUrl: 'https://avatars.example/vectorize-io',
  })

  assert.equal(plugin.stars, 20_005)
  assert.equal(plugin.forks, 1_413)
  assert.equal(plugin.language, 'Python')
  assert.equal(plugin.license, 'MIT')
  assert.deepEqual(plugin.latestRelease, { tag: 'v1.0.0', publishedAt: '2026-08-15T00:00:00Z' })
  assert.equal(plugin.pushedAt, '2026-08-16T00:00:00Z')
  assert.deepEqual(plugin.topics, ['memory'])
  assert.equal(plugin.icon, 'https://avatars.example/vectorize-io')
})

test('curated entries keep source fallbacks when repository metadata is unavailable', () => {
  const curatedPlugin = {
    owner: 'deleted-owner',
    name: 'deleted-repo#plugin',
    url: 'https://github.com/deleted-owner/deleted-repo/tree/main/plugin',
    stars: 12,
    forks: 7,
    language: 'JavaScript',
    license: 'MIT',
    description: { zh: '精选', en: 'Curated' },
  }
  const plugin = normalizeCurated(curatedPlugin)

  assert.equal(plugin.stars, 12)
  assert.equal(plugin.forks, 7)
  assert.equal(plugin.language, 'JavaScript')
  assert.equal(plugin.license, 'MIT')
  assert.equal(plugin.archived, false)
  assert.equal(normalizeCurated(curatedPlugin, { forkCount: 0 }).forks, 0)
})

test('repository governance blocks every entry from a curated monorepo', () => {
  const plugin = normalizeCurated({
    owner: 'whyihaveyou',
    name: 'dsh-suite#plugin-notify',
    url: 'https://github.com/whyihaveyou/dsh-suite/tree/main/packages/plugins/plugin-notify',
    description: { zh: '通知', en: 'Notifications' },
  })
  const result = applyGovernance([plugin], {
    repositories: [{ repo: 'whyihaveyou/dsh-suite', reason: 'repository quarantine' }],
  })
  assert.equal(result.plugins.length, 0)
  assert.equal(result.quarantined[0].id, 'whyihaveyou/dsh-suite#plugin-notify')
})

test('public plugins expose verification evidence without internal eligibility flags', () => {
  const normalized = normalizeDiscovered({ full_name: 'acme/plugin', html_url: 'https://github.com/acme/plugin' }, true)
  const plugin = toPublicPlugin(normalized)
  assert.equal('listingEligible' in plugin, false)
  assert.equal('verified' in plugin, false)
  assert.equal('installable' in plugin, false)
  assert.deepEqual(plugin.verification, { manifest: 'shape_validated', patch: 'not_checked', installation: 'not_tested' })
})

test('governance blocks repositories and applies only approved overrides', () => {
  const plugin = normalizeDiscovered({ full_name: 'acme/plugin', html_url: 'https://github.com/acme/plugin' }, true)
  const result = applyGovernance([plugin], { repositories: [{ repo: 'other/repo' }] }, {
    plugins: { 'acme/plugin': { name: 'Better name', category: 'dev', description: { zh: '修正' }, special: true, recommendationSource: 'x', trustLevel: 'curated' } },
  })
  assert.equal(result.plugins[0].name, 'Better name')
  assert.equal(result.plugins[0].category, 'dev')
  assert.equal(result.plugins[0].description.zh, '修正')
  assert.equal(result.plugins[0].description.en, '')
  assert.equal(result.plugins[0].special, true)
  assert.equal(result.plugins[0].recommendationSource, 'x')
  assert.equal(result.plugins[0].trustLevel, 'manifest_verified')

  const blocked = applyGovernance([plugin], { repositories: [{ repo: 'ACME/plugin', reason: 'duplicate' }] })
  assert.equal(blocked.plugins.length, 0)
  assert.equal(blocked.quarantined[0].trustLevel, 'quarantined')
  assert.equal(blocked.quarantined[0].reason, 'duplicate')
})

test('health gate rejects partial and unexpectedly smaller snapshots', () => {
  const plugins = Array.from({ length: 100 }, (_, index) => ({ id: `a/${index}`, source: index < 20 ? 'curated' : 'discovered' }))
  const previous = { plugins, stats: { published: 100, curated: 20, discoveryMode: 'complete' } }
  assert.match(validateHealth({ plugins: plugins.slice(0, 90), stats: { published: 90, curated: 20, discoveryMode: 'recent' } }, previous)[0], /partial/i)
  assert.match(validateHealth({ plugins: plugins.slice(0, 70), stats: { published: 70, curated: 10, discoveryMode: 'complete' } }, previous).join(' '), /dropped/)
  assert.deepEqual(validateHealth({ plugins: plugins.slice(0, 90), stats: { published: 90, curated: 18, discoveryMode: 'complete' } }, previous), [])
})

test('verified commit pins record the checked HEAD and rewrite the github install spec', () => {
  const commit = 'a'.repeat(40)
  const pinned = normalizeDiscovered({ full_name: 'acme/plugin', html_url: 'https://github.com/acme/plugin' }, true, true, commit)
  assert.equal(pinned.verifiedCommit, commit)
  assert.equal(pinned.trustLevel, 'manifest_verified')
  assert.equal(pinned.install, `dsh plugin --profile web add github:acme/plugin#${commit}`)
  const unpinned = normalizeDiscovered({ full_name: 'acme/plugin', html_url: 'https://github.com/acme/plugin' }, true, true)
  assert.equal('verifiedCommit' in unpinned, false)
  assert.equal(unpinned.install, 'dsh plugin --profile web add github:acme/plugin')
})

test('an invalid patch is not installable', () => {
  const plugin = normalizeDiscovered({
    full_name: 'acme/empty-patch',
    html_url: 'https://github.com/acme/empty-patch',
  }, true, 'invalid')
  assert.equal(plugin.listingEligible, false)
  assert.equal(plugin.verification.patch, 'invalid')
})

test('curated entries keep a declared category instead of regex-overwriting it', () => {
  const plugin = normalizeCurated({
    owner: 'strukto-ai',
    name: 'mirage#dsh',
    url: 'https://github.com/strukto-ai/mirage/tree/main/typescript/packages/dsh',
    category: 'dev',
    description: {
      zh: '挂载 Slack、Gmail、Notion，并发送通知',
      en: 'Mount Slack, Gmail, Notion, and send notifications',
    },
  })
  assert.equal(plugin.category, 'dev')
  assert.equal(bundleDirectoryFromUrl(plugin.url), 'typescript/packages/dsh')
})

test('curated entries that fail a completed contract check are not listing eligible', () => {
  const plugin = normalizeCurated({
    owner: 'acme',
    name: 'plugin',
    url: 'https://github.com/acme/plugin',
    description: { zh: '精选', en: 'Curated' },
  }, {}, { manifestShapeValid: false, patchExists: null, checked: true })
  assert.equal(plugin.listingEligible, false)
  assert.equal(plugin.verification.manifest, 'not_validated')
})

test('curated entries stay listed when the contract was not checked', () => {
  const plugin = normalizeCurated({
    owner: 'acme',
    name: 'plugin',
    url: 'https://github.com/acme/plugin',
    description: { zh: '精选', en: 'Curated' },
  })
  assert.equal(plugin.listingEligible, true)
  assert.equal(plugin.verification.manifest, 'not_checked')
})

test('health gate treats curated source count separately from published curated', () => {
  const plugins = Array.from({ length: 100 }, (_, index) => ({ id: `a/${index}`, source: index < 20 ? 'curated' : 'discovered' }))
  const previous = { plugins, stats: { published: 100, curated: 20, curatedSource: 20, discoveryMode: 'complete' } }
  assert.deepEqual(validateHealth({
    plugins: plugins.filter((_, index) => index >= 10),
    stats: { published: 90, curated: 10, curatedSource: 20, discoveryMode: 'complete' },
  }, previous), [])
  assert.match(validateHealth({
    plugins: plugins.slice(0, 90),
    stats: { published: 90, curated: 18, curatedSource: 10, discoveryMode: 'complete' },
  }, previous).join(' '), /Curated source/)
})
