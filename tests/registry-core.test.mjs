import assert from 'node:assert/strict'
import test from 'node:test'
import { hasBundleManifest, inferCategory, mergePlugins, normalizeCurated, normalizeDiscovered } from '../scripts/registry-core.mjs'

test('only a dsh.bundle object is installable', () => {
  assert.equal(hasBundleManifest('{"dsh":{"bundle":{"patch":"./cordis.patch.yml"}}}'), true)
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
    pushed_at: '2026-08-14T00:00:00Z',
  }, true)
  assert.equal(inferCategory({ name: plugin.name, description: plugin.description.en }), 'memory')
  assert.equal(plugin.install, 'dsh plugin --profile web add github:acme/dsh-memory')
  assert.equal(plugin.verified, true)
  assert.equal(plugin.icon, 'https://avatars.example/acme.png')
})

test('curated entries override discovered duplicates', () => {
  const curated = normalizeCurated({ owner: 'Acme', name: 'plugin', description: { zh: '精选', en: 'Curated' } })
  const discovered = normalizeDiscovered({ full_name: 'acme/plugin', html_url: '#', description: 'Found', stargazers_count: 9 }, true)
  const merged = mergePlugins([curated], [discovered])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].source, 'curated')
})
