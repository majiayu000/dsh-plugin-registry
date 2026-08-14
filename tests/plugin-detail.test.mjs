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
