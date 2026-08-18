import { validateBundleManifest } from '../../assets/bundle-manifest.js'
import { validateBundlePatch } from '../../assets/bundle-patch.js'

const DEFAULT_REGISTRY_REPOSITORY = 'majiayu000/dsh-plugin-registry'
const DEFAULT_REVIEWER = 'majiayu000'
const GITHUB_API_VERSION = '2026-03-10'
const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const GITHUB_REPOSITORY = /^[A-Za-z0-9._-]{1,100}$/
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  })
}

function normalizeRepository(value) {
  let candidate = String(value || '').trim()
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate)
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return null
      const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
      if (parts.length !== 2) return null
      candidate = parts.join('/')
    } catch {
      return null
    }
  }
  const parts = candidate.replace(/\.git$/i, '').split('/')
  if (parts.length !== 2 || !GITHUB_OWNER.test(parts[0]) || !GITHUB_REPOSITORY.test(parts[1])) return null
  return `${parts[0]}/${parts[1]}`
}

function normalizeLogin(value) {
  const login = String(value || '').trim().replace(/^@/, '')
  return GITHUB_LOGIN.test(login) ? login : null
}

export function validateSubmissionPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: '提交内容格式不正确。' }
  if (String(input.website || '').trim()) return { error: '提交未通过验证。' }

  const repository = normalizeRepository(input.repository)
  const submitter = normalizeLogin(input.submitter)
  const summary = String(input.summary || '').trim()
  const notes = String(input.notes || '').trim()
  const turnstileToken = String(input.turnstileToken || '').trim()

  if (!repository) return { error: '请输入有效的公开 GitHub 仓库地址。' }
  if (!submitter) return { error: '请输入有效的 GitHub 用户名。' }
  if (summary.length < 20 || summary.length > 300) return { error: '插件简介需要保持在 20–300 个字符之间。' }
  if (notes.length > 2000) return { error: '补充说明不能超过 2000 个字符。' }
  if (input.ownershipConfirmed !== true || input.publicReviewConfirmed !== true) return { error: '请确认提交授权和公开审核说明。' }
  if (!turnstileToken || turnstileToken.length > 2048) return { error: '请完成人机验证后再提交。' }

  return { value: { repository, submitter, summary, notes, turnstileToken } }
}

function githubHeaders(token, accept = 'application/vnd.github+json') {
  return {
    accept,
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'user-agent': 'dsh-plugin-registry-submissions',
    'x-github-api-version': GITHUB_API_VERSION,
  }
}

async function githubRequest(fetcher, token, path, init = {}) {
  const { accept, ...requestInit } = init
  const response = await fetcher(`https://api.github.com${path}`, {
    ...requestInit,
    headers: { ...githubHeaders(token, accept), ...requestInit.headers },
  })
  if (response.ok) return response
  const error = new Error(`GitHub request failed with ${response.status}`)
  error.status = response.status
  throw error
}

async function verifyTurnstile({ fetcher, secret, token, remoteIp, expectedHostname }) {
  try {
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: remoteIp }),
    })
    if (!response.ok) return false
    const result = await response.json()
    return result.success === true
      && result.action === 'plugin_submission'
      && result.hostname === expectedHostname
  } catch {
    return false
  }
}

function safeIssueText(value) {
  return String(value || '')
    .replaceAll('@', '@\u200b')
    .replaceAll('<!--', '&lt;!--')
    .replaceAll('-->', '--&gt;')
}

async function inspectRepository(fetcher, token, repository) {
  const encodedRepository = repository.split('/').map(encodeURIComponent).join('/')
  const repositoryResponse = await githubRequest(fetcher, token, `/repos/${encodedRepository}`, { method: 'GET' })
  const metadata = await repositoryResponse.json()
  let bundleCheck = { valid: false, reason_code: 'package_missing', reason: '根目录中没有 package.json。' }

  const packageResponse = await fetcher(`https://api.github.com/repos/${encodedRepository}/contents/package.json`, {
    method: 'GET',
    headers: githubHeaders(token, 'application/vnd.github.raw+json'),
  })
  if (packageResponse.ok) bundleCheck = validateBundleManifest(await packageResponse.text())
  else if (packageResponse.status !== 404) {
    const error = new Error(`GitHub package request failed with ${packageResponse.status}`)
    error.status = packageResponse.status
    throw error
  }

  let patchCheck = { valid: false, reason: '引用的 Patch 文件在仓库中不存在。' }
  if (bundleCheck.valid) {
    const patchResponse = await fetcher(`https://api.github.com/repos/${encodedRepository}/contents/${bundleCheck.patch.replace(/^\.\//, '')}`, {
      method: 'GET',
      headers: githubHeaders(token, 'application/vnd.github.raw+json'),
    })
    if (patchResponse.ok) patchCheck = validateBundlePatch(await patchResponse.text())
    else if (patchResponse.status !== 404) {
      const error = new Error(`GitHub patch request failed with ${patchResponse.status}`)
      error.status = patchResponse.status
      throw error
    }
  }

  const topics = Array.isArray(metadata.topics) ? metadata.topics.map(topic => String(topic).toLowerCase()) : []
  return {
    repositoryPublic: metadata.visibility === 'public' || metadata.private === false,
    discoveryTopic: topics.includes('dsh-plugin'),
    bundleManifest: Boolean(bundleCheck.valid),
    bundlePatch: Boolean(patchCheck.valid),
    repositoryStatus: !metadata.archived && !metadata.fork,
    bundleReason: bundleCheck.reason || '',
    patchReason: patchCheck.reason || '',
  }
}

export function buildIssueBody(submission, checks) {
  const checkRows = [
    ['公开仓库可访问', checks.repositoryPublic],
    ['包含 dsh-plugin Topic', checks.discoveryTopic],
    ['声明有效的 dsh.bundle', checks.bundleManifest],
    ['Patch 文件是顶层 YAML 数组', checks.bundlePatch],
    ['仓库未归档且不是 Fork', checks.repositoryStatus],
  ].map(([label, passed]) => `- [${passed ? 'x' : ' '}] ${label}`).join('\n')

  return [
    '## 插件仓库',
    `https://github.com/${submission.repository}`,
    '',
    '## 提交人',
    `@${submission.submitter}`,
    '',
    '## 插件简介',
    safeIssueText(submission.summary),
    '',
    '## 服务端预检',
    checkRows,
    ...(!checks.bundleManifest && checks.bundleReason ? ['', `> Manifest：${checks.bundleReason}`] : []),
    ...(!checks.bundlePatch && checks.patchReason ? ['', `> Patch：${checks.patchReason}`] : []),
    '',
    '## 补充说明',
    safeIssueText(submission.notes) || '无',
    '',
    '## 作者确认',
    '- [x] 我是该仓库的所有者或主要维护者，并有权提交收录。',
    '- [x] 我理解本次提交会作为公开 GitHub Issue 进入审核队列。',
    '',
    `<!-- submission-repository: ${submission.repository.toLowerCase()} -->`,
    '<!-- submitted-via: plugin.dshdesk.com -->',
  ].join('\n')
}

async function findExistingSubmission(fetcher, token, registryRepository, repository) {
  const encodedRegistry = registryRepository.split('/').map(encodeURIComponent).join('/')
  const response = await githubRequest(fetcher, token, `/repos/${encodedRegistry}/issues?state=open&labels=plugin-submission&per_page=100`, { method: 'GET' })
  const marker = `<!-- submission-repository: ${repository.toLowerCase()} -->`
  return (await response.json()).find(issue => !issue.pull_request && String(issue.body || '').includes(marker)) || null
}

export async function handleSubmission(context, fetcher = fetch) {
  const requestUrl = new URL(context.request.url)
  const origin = context.request.headers.get('origin')
  if (!origin || origin !== requestUrl.origin) return json({ error: '请求来源无效。' }, 403)

  const contentLength = Number(context.request.headers.get('content-length') || 0)
  if (contentLength > 12_000) return json({ error: '提交内容过大。' }, 413)
  if (!String(context.request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return json({ error: '提交格式不受支持。' }, 415)
  }

  const githubToken = context.env.GITHUB_SUBMISSIONS_TOKEN
  const turnstileSecret = context.env.TURNSTILE_SECRET_KEY
  if (!githubToken || !turnstileSecret) return json({ error: '站内审核通道尚未完成配置，请暂时使用 GitHub 提交通道。' }, 503)

  let payload
  try {
    payload = await context.request.json()
  } catch {
    return json({ error: '无法读取提交内容。' }, 400)
  }
  if (JSON.stringify(payload).length > 12_000) return json({ error: '提交内容过大。' }, 413)
  const validation = validateSubmissionPayload(payload)
  if (validation.error) return json({ error: validation.error }, 422)

  const turnstileValid = await verifyTurnstile({
    fetcher,
    secret: turnstileSecret,
    token: validation.value.turnstileToken,
    remoteIp: context.request.headers.get('CF-Connecting-IP') || undefined,
    expectedHostname: requestUrl.hostname,
  })
  if (!turnstileValid) return json({ error: '人机验证已失效，请刷新验证后重试。', code: 'turnstile_failed' }, 422)

  const registryRepository = context.env.GITHUB_REGISTRY_REPOSITORY || DEFAULT_REGISTRY_REPOSITORY
  const reviewer = context.env.GITHUB_REVIEWER || DEFAULT_REVIEWER

  try {
    const existing = await findExistingSubmission(fetcher, githubToken, registryRepository, validation.value.repository)
    if (existing) {
      return json({
        ok: true,
        duplicate: true,
        issueNumber: existing.number,
        issueUrl: existing.html_url,
        message: '这个仓库已经在审核队列中。',
      })
    }

    const checks = await inspectRepository(fetcher, githubToken, validation.value.repository)
    const encodedRegistry = registryRepository.split('/').map(encodeURIComponent).join('/')
    const issueResponse = await githubRequest(fetcher, githubToken, `/repos/${encodedRegistry}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: `[Plugin submission] ${validation.value.repository}`,
        body: buildIssueBody(validation.value, checks),
        labels: ['plugin-submission'],
        assignees: [reviewer],
      }),
    })
    const issue = await issueResponse.json()
    return json({
      ok: true,
      duplicate: false,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      message: '已进入公开审核队列。',
    }, 201)
  } catch (error) {
    if (error.status === 404) return json({ error: '找不到这个公开仓库，请确认地址和可见性。' }, 422)
    if (error.status === 403 || error.status === 429) return json({ error: 'GitHub 暂时限制了请求，请稍后再试。' }, 503)
    if (error.status === 422) return json({ error: 'GitHub 拒绝了这次提交，请检查是否已经存在相同审核。' }, 422)
    return json({ error: '审核通道暂时不可用，请稍后重试。' }, 502)
  }
}

export function onRequestGet({ env }) {
  const enabled = Boolean(env.GITHUB_SUBMISSIONS_TOKEN && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY)
  return json({ enabled, turnstileSiteKey: enabled ? env.TURNSTILE_SITE_KEY : null })
}

export function onRequestPost(context) {
  return handleSubmission(context)
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { allow: 'GET, POST, OPTIONS' } })
}
