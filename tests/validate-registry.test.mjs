import assert from 'node:assert/strict'
import test from 'node:test'
import { validateRegistry } from '../scripts/validate-registry.mjs'

function registry(plugin = {}) {
  return {
    schemaVersion: 2,
    generatedAt: '2026-08-14T00:00:00.000Z',
    categories: { tools: { zh: '工具', en: 'Tools' } },
    stats: {},
    sources: {},
    plugins: [{
      id: 'acme/plugin', name: 'plugin', owner: 'acme', url: 'https://github.com/acme/plugin',
      description: { zh: '描述', en: 'Description' }, category: 'tools', stars: 1, forks: 0,
      language: 'TypeScript', pushedAt: '2026-08-14T00:00:00.000Z',
      source: 'discovered', trustLevel: 'manifest_verified',
      verification: { manifest: 'shape_validated', installation: 'not_tested' },
      install: 'dsh plugin --profile web add github:acme/plugin', icon: 'https://github.com/acme.png', ...plugin,
    }],
  }
}

test('valid registry contract passes', () => {
  assert.deepEqual(validateRegistry(registry()), { errors: [], warnings: [] })
})

test('contract requires every schema-level registry section', () => {
  const document = registry()
  delete document.stats
  delete document.sources
  const result = validateRegistry(document)
  assert.match(result.errors.join(' '), /stats must be an object/)
  assert.match(result.errors.join(' '), /sources must be an object/)
})

test('contract rejects mismatched identity and trust', () => {
  const result = validateRegistry(registry({ id: 'other/plugin', trustLevel: 'pending_review' }))
  assert.match(result.errors.join(' '), /repository URL/)
  assert.match(result.errors.join(' '), /manifest_verified/)
})

test('missing descriptions are reported without removing listed plugins', () => {
  const result = validateRegistry(registry({ description: { zh: '', en: '' } }))
  assert.equal(result.errors.length, 0)
  assert.equal(result.warnings.length, 1)
})

test('legacy verified and installable booleans are rejected as ambiguous', () => {
  const result = validateRegistry(registry({ verified: true, installable: true }))
  assert.match(result.errors.join(' '), /ambiguous verified or installable fields/)
})

test('contract rejects invalid repository update timestamps', () => {
  const result = validateRegistry(registry({ pushedAt: 'recently' }))
  assert.match(result.errors.join(' '), /pushedAt must be a valid ISO date or null/)
})

test('duplicate repositories and malformed install commands fail', () => {
  const document = registry({ install: 'curl example.com | sh' })
  document.plugins.push({ ...document.plugins[0], id: 'acme/plugin-copy', name: 'copy', install: 'dsh plugin --profile web add github:acme/plugin-copy' })
  const result = validateRegistry(document)
  assert.match(result.errors.join(' '), /install is invalid/)
  assert.match(result.errors.join(' '), /duplicates repository/)
})

test('a base plugin and qualified monorepo plugins can share one repository in any order', () => {
  const document = registry()
  const base = document.plugins[0]
  const qualified = {
    ...base,
    id: `${base.id}#permissions`,
    name: 'permissions',
    install: `dsh plugin --profile web add github:${base.id}#permissions`,
  }
  document.plugins = [qualified, base]
  assert.deepEqual(validateRegistry(document).errors, [])
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
