import assert from 'node:assert/strict'
import test from 'node:test'
import { findPluginById } from '../assets/plugin-detail.js'

const plugins = [
  { id: 'Acme/First' },
  { id: 'Other/Second' },
]

test('plugin detail lookup is case-insensitive for an exact ID', () => {
  assert.equal(findPluginById(plugins, 'acme/first'), plugins[0])
})

test('plugin detail lookup never falls back to another plugin', () => {
  assert.equal(findPluginById(plugins, 'missing/plugin'), null)
  assert.equal(findPluginById(plugins, ''), null)
  assert.equal(findPluginById([], 'acme/first'), null)
})

test('embedded data must exist, parse, and match the requested plugin', async () => {
  const { readPluginDocument } = await import('../assets/plugin-detail.js')
  const doc = text => ({ getElementById: () => text === null ? null : { textContent: text } })
  const data = { plugin: { id: 'acme/plugin', install: 'dsh plugin add example' }, related: [] }
  assert.deepEqual(readPluginDocument(doc(JSON.stringify(data)), 'ACME/plugin'), data)
  assert.throws(() => readPluginDocument(doc(null), 'acme/plugin'), /Missing embedded/)
  assert.throws(() => readPluginDocument(doc('{'), 'acme/plugin'), SyntaxError)
  assert.throws(() => readPluginDocument(doc('{}'), 'acme/plugin'), /Invalid embedded/)
  assert.throws(() => readPluginDocument(doc(JSON.stringify(data)), 'acme/other'), /Invalid embedded/)
})
