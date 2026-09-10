import assert from 'node:assert/strict'
import test from 'node:test'

import { buildIssueBody, handleSubmission, onRequestGet, validateSubmissionPayload } from '../functions/api/submissions.js'

const validPayload = {
  repository: 'owner/dsh-example',
  submitter: '@octocat',
  summary: '这是一个用于验证站内审核提交链路的示例插件。',
  notes: '请重点检查 manifest。',
  website: '',
  ownershipConfirmed: true,
  publicReviewConfirmed: true,
  turnstileToken: 'verified-token',
}

test('submission payload normalizes public identifiers and rejects incomplete consent', () => {
  const result = validateSubmissionPayload(validPayload)
  assert.equal(result.value.repository, 'owner/dsh-example')
  assert.equal(result.value.submitter, 'octocat')

  const invalid = validateSubmissionPayload({ ...validPayload, publicReviewConfirmed: false })
  assert.match(invalid.error, /确认/)
})

test('issue body contains server checks and a stable duplicate marker', () => {
  const body = buildIssueBody(validateSubmissionPayload({ ...validPayload, notes: '请联系 @everyone <!-- hidden -->' }).value, {
    repositoryPublic: true,
    discoveryTopic: true,
    bundleManifest: false,
    repositoryStatus: true,
    bundleReason: '缺少 patch',
  })
  assert.match(body, /- \[x\] 公开仓库可访问/)
  assert.match(body, /- \[ \] 声明有效的 dsh\.bundle/)
  assert.match(body, /submission-repository: owner\/dsh-example/)
  assert.doesNotMatch(body, /@everyone/)
  assert.doesNotMatch(body, /<!-- hidden -->/)
})

test('config endpoint exposes only the public Turnstile site key', async () => {
  const response = onRequestGet({ env: {
    GITHUB_SUBMISSIONS_TOKEN: 'secret-token',
    TURNSTILE_SITE_KEY: 'public-site-key',
    TURNSTILE_SECRET_KEY: 'secret-turnstile-key',
  } })
  assert.deepEqual(await response.json(), { enabled: true, turnstileSiteKey: 'public-site-key' })
})

test('submission endpoint validates Turnstile, checks GitHub, and creates an assigned issue', async () => {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    if (String(url).includes('/siteverify')) return Response.json({ success: true, action: 'plugin_submission', hostname: 'plugin.example' })
    if (String(url).includes('/issues?state=open')) return Response.json([])
    if (String(url).endsWith('/repos/owner/dsh-example')) return Response.json({ visibility: 'public', private: false, topics: ['dsh-plugin'], archived: false, fork: false })
    if (String(url).endsWith('/contents/package.json')) return new Response(JSON.stringify({ name: 'dsh-example', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    if (String(url).endsWith('/contents/cordis.patch.yml')) return new Response('- insert:\n    - id: hello\n      name: dsh-example\n')
    if (String(url).endsWith('/repos/majiayu000/dsh-plugin-registry/issues') && init.method === 'POST') {
      return Response.json({ number: 42, html_url: 'https://github.com/majiayu000/dsh-plugin-registry/issues/42' }, { status: 201 })
    }
    throw new Error(`Unexpected request: ${url}`)
  }
  const request = new Request('https://plugin.example/api/submissions', {
    method: 'POST',
    headers: { origin: 'https://plugin.example', 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' },
    body: JSON.stringify(validPayload),
  })
  const response = await handleSubmission({
    request,
    env: { GITHUB_SUBMISSIONS_TOKEN: 'secret-token', TURNSTILE_SECRET_KEY: 'secret-turnstile-key' },
  }, fetcher)
  const result = await response.json()
  assert.equal(response.status, 201)
  assert.equal(result.issueNumber, 42)

  const createCall = calls.find(call => call.url.endsWith('/repos/majiayu000/dsh-plugin-registry/issues') && call.init.method === 'POST')
  const issue = JSON.parse(createCall.init.body)
  assert.deepEqual(issue.labels, ['plugin-submission'])
  assert.deepEqual(issue.assignees, ['majiayu000'])
  assert.match(issue.body, /- \[x\] 声明有效的 dsh\.bundle/)
  assert.match(issue.body, /- \[x\] Patch 文件是顶层 YAML 数组/)
})

function submissionRequest() {
  return new Request('https://plugin.example/api/submissions', {
    method: 'POST',
    headers: { origin: 'https://plugin.example', 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' },
    body: JSON.stringify(validPayload),
  })
}

const duplicateIssue = {
  number: 87,
  html_url: 'https://github.com/majiayu000/dsh-plugin-registry/issues/87',
  body: 'queued\n<!-- submission-repository: owner/dsh-example -->\n',
}

test('duplicate receipt matches an existing open submission on the first issues page', async () => {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    if (String(url).includes('/siteverify')) return Response.json({ success: true, action: 'plugin_submission', hostname: 'plugin.example' })
    if (String(url).includes('/issues?state=open')) return Response.json([duplicateIssue])
    throw new Error(`Unexpected request: ${url}`)
  }
  const response = await handleSubmission({
    request: submissionRequest(),
    env: { GITHUB_SUBMISSIONS_TOKEN: 'secret-token', TURNSTILE_SECRET_KEY: 'secret-turnstile-key' },
  }, fetcher)
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.equal(result.duplicate, true)
  assert.equal(result.issueNumber, 87)
  assert.equal(result.issueUrl, duplicateIssue.html_url)
  assert.equal(calls.some(call => call.init.method === 'POST' && call.url.endsWith('/repos/majiayu000/dsh-plugin-registry/issues')), false)
})

test('duplicate receipt paginates open plugin-submission issues until the repository marker matches', async () => {
  const calls = []
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    number: index + 1,
    html_url: `https://github.com/majiayu000/dsh-plugin-registry/issues/${index + 1}`,
    body: index === 0
      ? 'pull request with the same marker\n<!-- submission-repository: owner/dsh-example -->\n'
      : `other-${index}\n<!-- submission-repository: owner/other-${index} -->\n`,
    ...(index === 0 ? { pull_request: { url: 'https://api.github.com/repos/majiayu000/dsh-plugin-registry/pulls/1' } } : {}),
  }))
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    if (String(url).includes('/siteverify')) return Response.json({ success: true, action: 'plugin_submission', hostname: 'plugin.example' })
    const parsed = new URL(url)
    const page = parsed.searchParams.get('page')
    if (parsed.pathname.endsWith('/issues') && parsed.searchParams.get('state') === 'open' && page === '1') return Response.json(firstPage)
    if (parsed.pathname.endsWith('/issues') && parsed.searchParams.get('state') === 'open' && page === '2') return Response.json([duplicateIssue])
    throw new Error(`Unexpected request: ${url}`)
  }
  const response = await handleSubmission({
    request: submissionRequest(),
    env: { GITHUB_SUBMISSIONS_TOKEN: 'secret-token', TURNSTILE_SECRET_KEY: 'secret-turnstile-key' },
  }, fetcher)
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.equal(result.duplicate, true)
  assert.equal(result.issueNumber, 87)
  assert.equal(result.issueUrl, duplicateIssue.html_url)
  const issueListCalls = calls.filter(call => new URL(call.url).pathname.endsWith('/issues') && call.init.method !== 'POST')
  assert.equal(issueListCalls.length, 2)
  assert.equal(new URL(issueListCalls[1].url).searchParams.get('page'), '2')
  assert.equal(calls.some(call => call.init.method === 'POST' && call.url.endsWith('/repos/majiayu000/dsh-plugin-registry/issues')), false)
})
