import assert from 'node:assert/strict'
import test from 'node:test'

import { buildGitHubSubmissionUrl, submissionQueueUrl } from '../assets/github-submission.js'

const check = {
  signals: [
    { signal_type: 'repository_public', signal: { passed: true }, reason: 'public' },
    { signal_type: 'bundle_manifest', signal: { passed: false }, reason: 'missing' },
  ],
  listing: { listed: false, source: null },
}

test('GitHub submission URL carries the repository and structured pre-check results', () => {
  const url = new URL(buildGitHubSubmissionUrl({
    registryRepository: 'majiayu000/dsh-plugin-registry',
    repository: 'owner/plugin',
    check,
    locale: 'zh-CN',
  }))

  assert.equal(url.origin, 'https://github.com')
  assert.equal(url.pathname, '/majiayu000/dsh-plugin-registry/issues/new')
  assert.equal(url.searchParams.get('labels'), 'plugin-submission')
  assert.match(url.searchParams.get('title'), /owner\/plugin/)
  assert.match(url.searchParams.get('body'), /- \[x\] 公开仓库可访问/)
  assert.match(url.searchParams.get('body'), /- \[ \] 声明有效的 dsh\.bundle/)
})

test('GitHub submission has complete English copy and a trackable queue URL', () => {
  const url = new URL(buildGitHubSubmissionUrl({
    registryRepository: 'majiayu000/dsh-plugin-registry',
    repository: 'owner/plugin',
    check,
    locale: 'en-US',
  }))

  assert.doesNotMatch(url.searchParams.get('body'), /[\u4e00-\u9fff]/)
  assert.equal(
    submissionQueueUrl('majiayu000/dsh-plugin-registry'),
    'https://github.com/majiayu000/dsh-plugin-registry/issues?q=is%3Aissue+label%3Aplugin-submission',
  )
})
