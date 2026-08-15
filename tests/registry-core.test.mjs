import assert from 'node:assert/strict'
import test from 'node:test'
import { applyGovernance, hasBundleManifest, inferCategory, mergePlugins, normalizeCurated, normalizeDiscovered, toPublicPlugin, validateHealth } from '../scripts/registry-core.mjs'

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
  assert.equal(plugin.listingEligible, true)
  assert.deepEqual(plugin.verification, { manifest: 'shape_validated', installation: 'not_tested' })
  assert.equal(plugin.trustLevel, 'manifest_verified')
  assert.equal(plugin.language, 'TypeScript')
  assert.equal(plugin.icon, 'https://avatars.example/acme.png')
})

test('curated entries override discovered duplicates', () => {
  const curated = normalizeCurated({ owner: 'Acme', name: 'plugin', description: { zh: '精选', en: 'Curated' } })
  const discovered = normalizeDiscovered({ full_name: 'acme/plugin', html_url: '#', description: 'Found', stargazers_count: 9 }, true)
  const merged = mergePlugins([curated], [discovered])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].source, 'curated')
  assert.equal(merged[0].trustLevel, 'curated')
  assert.deepEqual(merged[0].verification, { manifest: 'not_checked', installation: 'not_tested' })
})

test('curated monorepo entries use the repository URL as identity', () => {
  const plugin = normalizeCurated({
    owner: 'sjh9714',
    name: 'dsh-movein-permissions',
    url: 'https://github.com/sjh9714/dsh-movein/tree/main/plugin',
    description: { zh: '权限规则', en: 'Permission rules' },
  })
  assert.equal(plugin.id, 'sjh9714/dsh-movein#dsh-movein-permissions')
  assert.equal(plugin.owner, 'sjh9714')
  assert.equal(plugin.name, 'dsh-movein-permissions')
})

test('public plugins expose verification evidence without internal eligibility flags', () => {
  const normalized = normalizeDiscovered({ full_name: 'acme/plugin', html_url: 'https://github.com/acme/plugin' }, true)
  const plugin = toPublicPlugin(normalized)
  assert.equal('listingEligible' in plugin, false)
  assert.equal('verified' in plugin, false)
  assert.equal('installable' in plugin, false)
  assert.deepEqual(plugin.verification, { manifest: 'shape_validated', installation: 'not_tested' })
})

test('governance blocks repositories and applies only approved overrides', () => {
  const plugin = normalizeDiscovered({ full_name: 'acme/plugin', html_url: 'https://github.com/acme/plugin' }, true)
  const result = applyGovernance([plugin], { repositories: [{ repo: 'other/repo' }] }, {
    plugins: { 'acme/plugin': { name: 'Better name', category: 'dev', description: { zh: '修正' }, trustLevel: 'curated' } },
  })
  assert.equal(result.plugins[0].name, 'Better name')
  assert.equal(result.plugins[0].category, 'dev')
  assert.equal(result.plugins[0].description.zh, '修正')
  assert.equal(result.plugins[0].description.en, '')
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
