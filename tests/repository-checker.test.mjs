import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateRepository, findRegistryEntry, githubFailureMessage, manifestFailureMessage, parseGitHubRepository, repositoryCheckerCopy } from '../assets/repository-checker.js'

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

test('checker messages are complete and actionable in both locales', () => {
  assert.equal(repositoryCheckerCopy('en-US').pending, 'Pending')
  assert.equal(repositoryCheckerCopy('zh-CN').failed, '未通过')
  assert.equal(manifestFailureMessage({ reason_code: 'bundle_not_object' }, 'zh-CN'), 'Manifest 未通过：dsh.bundle 必须是对象。')
  assert.match(manifestFailureMessage({ reason_code: 'patch_unsafe' }, 'en-US'), /^Manifest failed:/)
  assert.match(githubFailureMessage(404, 'zh-CN'), /找不到/)
  assert.match(githubFailureMessage(403, 'en-US'), /rate-limited/)
})
