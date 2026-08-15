import assert from 'node:assert/strict'
import test from 'node:test'
import { createPluginSearchIndex, filterPluginSearchIndex } from '../assets/registry-search.js'

const plugins = [
  { id: 'acme/memory', category: 'memory', source: 'curated', verification: { manifest: 'not_checked' } },
  { id: 'acme/terminal', category: 'ui', source: 'discovered', verification: { manifest: 'shape_validated' } },
  { id: 'other/notifier', category: 'notify', source: 'discovered', verification: { manifest: 'shape_validated' } },
  { id: 'candidate/no-bundle', category: '', source: 'discovered', trustLevel: 'pending_review', verification: { manifest: 'not_validated' } },
]

test('searchable text is normalized once when the index is created', () => {
  let builds = 0
  const index = createPluginSearchIndex(plugins, function (plugin) {
    builds += 1
    return plugin.id.toUpperCase()
  })

  assert.equal(builds, plugins.length)
  assert.deepEqual(filterPluginSearchIndex(index, { query: 'ACME' }), plugins.slice(0, 2))
  assert.deepEqual(filterPluginSearchIndex(index, { query: 'terminal' }), [plugins[1]])
  assert.equal(builds, plugins.length)
})

test('category and curated filters compose with text search', () => {
  const index = createPluginSearchIndex(plugins, function (plugin) { return plugin.id })

  assert.deepEqual(filterPluginSearchIndex(index, { category: 'ui' }), [plugins[1]])
  assert.deepEqual(filterPluginSearchIndex(index, { curatedOnly: true, query: 'memory' }), [plugins[0]])
  assert.deepEqual(filterPluginSearchIndex(index, { category: 'ui', curatedOnly: true }), [])
  assert.deepEqual(filterPluginSearchIndex(index, { source: 'discovered' }), plugins.slice(1))
  assert.deepEqual(filterPluginSearchIndex(index, { manifest: 'not_checked' }), [plugins[0]])
  assert.deepEqual(filterPluginSearchIndex(index, { source: 'discovered', manifest: 'shape_validated', query: 'acme terminal' }), [plugins[1]])
  assert.deepEqual(filterPluginSearchIndex(index, { manifest: 'not_validated' }), [plugins[3]])
})
