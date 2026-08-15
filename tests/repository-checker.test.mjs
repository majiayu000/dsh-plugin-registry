import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateRepository, findRegistryEntry, parseGitHubRepository } from '../assets/repository-checker.js'

test('repository input accepts only an owner/repository pair or canonical GitHub URL', () => {
  assert.equal(parseGitHubRepository('owner/repository'), 'owner/repository')
  assert.equal(parseGitHubRepository('https://github.com/owner/repository.git'), 'owner/repository')
  assert.equal(parseGitHubRepository('http://github.com/owner/repository'), null)
  assert.equal(parseGitHubRepository('https://example.com/owner/repository'), null)
  assert.equal(parseGitHubRepository('https://github.com/owner/repository/issues'), null)
  assert.equal(parseGitHubRepository('owner'), null)
})

test('repository evaluation returns structured signals for automatic discovery', () => {
  const result = evaluateRepository({
    repository: { topics: ['dsh-plugin'], archived: false, fork: false },
    bundleCheck: { valid: true, reason: 'valid bundle manifest' },
  })

  assert.equal(result.auto_discoverable, true)
  assert.deepEqual(result.signals.map(item => item.signal_type), [
    'repository_public',
    'discovery_topic',
    'bundle_manifest',
    'repository_status',
  ])
  result.signals.forEach(item => {
    assert.equal(typeof item.signal.passed, 'boolean')
    assert.equal(typeof item.reason, 'string')
  })
})

test('curated listing status stays distinct from automatic discovery eligibility', () => {
  const entry = { id: 'owner/repository', source: 'curated' }
  const result = evaluateRepository({
    repository: { topics: ['dsh-plugin'], archived: false, fork: false },
    bundleCheck: { valid: false, reason: 'dsh.bundle must be an object.' },
    registryEntry: entry,
  })

  assert.equal(result.auto_discoverable, false)
  assert.deepEqual(result.listing, { listed: true, source: 'curated', id: 'owner/repository' })
  assert.equal(findRegistryEntry({ plugins: [entry] }, 'OWNER/REPOSITORY'), entry)
})
