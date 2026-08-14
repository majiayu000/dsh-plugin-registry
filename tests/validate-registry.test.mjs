import assert from 'node:assert/strict'
import test from 'node:test'
import { validateRegistry } from '../scripts/validate-registry.mjs'

function registry(plugin = {}) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-14T00:00:00.000Z',
    categories: { tools: { zh: '工具', en: 'Tools' } },
    plugins: [{
      id: 'acme/plugin', name: 'plugin', owner: 'acme', url: 'https://github.com/acme/plugin',
      description: { zh: '描述', en: 'Description' }, category: 'tools', stars: 1, forks: 0,
      source: 'discovered', trustLevel: 'manifest_verified', verified: true, installable: true,
      install: 'dsh plugin --profile web add github:acme/plugin', icon: 'https://github.com/acme.png', ...plugin,
    }],
  }
}

test('valid registry contract passes', () => {
  assert.deepEqual(validateRegistry(registry()), { errors: [], warnings: [] })
})

test('contract rejects mismatched identity and trust', () => {
  const result = validateRegistry(registry({ id: 'other/plugin', trustLevel: 'pending_review' }))
  assert.match(result.errors.join(' '), /repository URL/)
  assert.match(result.errors.join(' '), /manifest_verified/)
})

test('missing descriptions are reported without removing installable plugins', () => {
  const result = validateRegistry(registry({ description: { zh: '', en: '' } }))
  assert.equal(result.errors.length, 0)
  assert.equal(result.warnings.length, 1)
})

test('duplicate repositories and malformed install commands fail', () => {
  const document = registry({ install: 'curl example.com | sh' })
  document.plugins.push({ ...document.plugins[0], id: 'acme/plugin-copy', name: 'copy', install: 'dsh plugin --profile web add github:acme/plugin-copy' })
  const result = validateRegistry(document)
  assert.match(result.errors.join(' '), /install is invalid/)
  assert.match(result.errors.join(' '), /duplicates repository/)
})

test('GitHub identities reject markup before registry data reaches HTML renderers', () => {
  const owner = '<img src=x onerror=alert(1)>'
  const result = validateRegistry(registry({
    id: `${owner}/plugin`,
    owner,
    url: `https://github.com/${owner}/plugin`,
  }))

  assert.match(result.errors.join(' '), /valid GitHub repository URL/)
})
