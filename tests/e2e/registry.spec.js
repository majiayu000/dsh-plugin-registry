import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('a nested not-found page localizes for English visitors', async ({ page }) => {
  const notFoundPage = await readFile(new URL('../../404.html', import.meta.url), 'utf8')
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('harness-registry-locale', 'en-US'))
  await page.route('**/plugins/acme/missing-plugin/', route => route.fulfill({
    status: 404,
    contentType: 'text/html',
    body: notFoundPage,
  }))

  const response = await page.goto('/plugins/acme/missing-plugin/')
  expect(response.status()).toBe(404)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
  await expect(page).toHaveTitle('Page Not Found — DeepSeek Harness Plugin Registry')
  await expect(page.locator('h1')).toHaveText('Plugin not found.')
  await expect(page.locator('.page-sub')).toHaveText('It may have been removed from the directory, or the URL may be incorrect.')
  await expect(page.locator('.btn-primary')).toHaveText('Back to plugin directory')
  await expect(page.locator('.locale-switch')).toHaveText('中')
})

test('search ranks exact plugin names and persists the query in the URL', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#list .prow').first()).toBeVisible()
  await page.locator('#q').fill('dsh-at-file')
  await expect(page.locator('#list .prow-name a').first()).toContainText('dsh-at-file')
  await expect(page).toHaveURL(/q=dsh-at-file/)
})

test('default directory shows published plugins and does not promote candidates', async ({ page }) => {
  await page.goto('/')
  const first = page.locator('#list .prow').first()
  await expect(first).toBeVisible()
  const order = await page.evaluate(() => {
    const href = document.querySelector('#list .prow .prow-name a')?.getAttribute('href') || ''
    const actual = new URL(href, location.href).searchParams.get('plugin')
    return {
      actual,
      published: HR.PUBLISHED.some(plugin => plugin.id === actual),
      pending: (HR.PENDING || []).some(plugin => plugin.id === actual),
    }
  })
  expect(order.published).toBe(true)
  expect(order.pending).toBe(false)
  await expect(first.locator('.pill-pending')).toHaveCount(0)
})

test('special listing is visible with its repository-approved install command', async ({ page }) => {
  await page.goto('/?q=dsh-mini-tui')
  const row = page.locator('#list .prow').filter({ hasText: 'dsh-mini-tui' }).first()
  await expect(row).toBeVisible()
  await expect(row.locator('.pill-special')).toHaveText(/特别收录|Special listing/)
  await expect(row.locator('.pill-source')).toHaveText(/来源：X 推荐|Source: X recommendation/)
  const install = await page.evaluate(() => HR.PLUGINS.find(plugin => plugin.id === 'boxeryao/dsh-mini-tui').install)
  expect(install).toBe('dsh plugin --profile tui add dsh-mini-tui@latest')
})

test('dsh-TUI is classified as a client with confirmed manifest evidence', async ({ page }) => {
  await page.goto('/?q=dsh-TUI')
  const row = page.locator('#list .prow').first()
  await expect(row).toBeVisible()
  await expect(row.locator('.prow-name')).toContainText('dsh-TUI')
  await expect(row.locator('.prow-meta')).toContainText(/客户端与运行界面|Clients & Runtime Interfaces/)
  await expect(row.locator('.pill-manifest')).toContainText(/Manifest 格式检查通过|Manifest format checked/)
  await expect(row).not.toContainText(/Manifest 未检查|Manifest not checked/)
})

test('plugin details expose manifest, patch, and installation evidence', async ({ page }) => {
  await page.goto('/plugin-detail.html?plugin=omdsh-dev%2Fdsh-at-file')
  await expect(page.locator('#plugin-name')).toHaveText(/dsh-at-file/i)
  await expect(page.locator('#manifest-status')).not.toBeEmpty()
  await expect(page.locator('#patch-status')).not.toBeEmpty()
  await expect(page.locator('#installation-test-status')).toHaveText(/未执行|Not performed/)
})

test('mobile layout keeps navigation and filters usable without page overflow', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'mobile-only assertion')
  await page.goto('/')
  await expect(page.locator('.nav')).toBeVisible()
  await expect(page.locator('#source')).toBeVisible()
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1)
})

test('a failed audit fetch does not keep stale pending candidates after reload', async ({ page }) => {
  const nextVersion = '2026-08-17T12:00:00.000Z'
  const published = {
    id: 'acme/live-plugin',
    name: 'live-plugin',
    owner: 'acme',
    url: 'https://github.com/acme/live-plugin',
    description: { zh: '在列插件', en: 'Listed plugin' },
    category: 'tools',
    topics: [],
    stars: 1,
    forks: 0,
    source: 'curated',
    trustLevel: 'curated',
    verification: { manifest: 'not_checked', patch: 'not_checked', installation: 'not_tested' },
  }
  const stalePending = {
    id: 'acme/dsh-stale-candidate',
    name: 'dsh-stale-candidate',
    url: 'https://github.com/acme/dsh-stale-candidate',
    topics: ['dsh'],
  }

  await page.route('**/data/version.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ schemaVersion: 1, generatedAt: nextVersion }),
  }))
  await page.route('**/data/plugins.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ generatedAt: nextVersion, plugins: [published], categories: {}, stats: {} }),
  }))
  await page.route('**/data/registry-audit.json', route => route.fulfill({
    status: 404,
    contentType: 'text/plain',
    body: 'missing',
  }))

  await page.addInitScript(async ({ published, stalePending }) => {
    if (sessionStorage.getItem('hr-seeded-stale-audit')) return
    sessionStorage.setItem('hr-seeded-stale-audit', '1')
    const origin = location.origin
    const cache = await caches.open('harness-registry-snapshot-v1')
    const put = (path, body) => cache.put(
      `${origin}/${path}`,
      new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
    )
    await put('data/version.json', { schemaVersion: 1, generatedAt: '2026-08-16T00:00:00.000Z' })
    await put('data/plugins.json', { generatedAt: '2026-08-16T00:00:00.000Z', plugins: [published] })
    await put('data/registry-audit.json', { pendingReview: [stalePending] })
  }, { published, stalePending })

  await page.goto('/')
  await expect(page.locator('#list .prow').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window.HR.PENDING || []).map(plugin => plugin.id))).toEqual([])
  await expect(page.locator('#list')).not.toContainText('dsh-stale-candidate')

  await page.reload()
  await expect(page.locator('#list .prow').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window.HR.PENDING || []).map(plugin => plugin.id))).toEqual([])
  await expect(page.locator('#list')).not.toContainText('dsh-stale-candidate')
  const cachedAudit = await page.evaluate(async () => {
    const cache = await caches.open('harness-registry-snapshot-v1')
    const response = await cache.match(`${location.origin}/data/registry-audit.json`)
    return response ? response.json() : null
  })
  expect(cachedAudit).toEqual({ pendingReview: [] })

  await page.goto('/dashboard.html')
  await expect(page.locator('#k-count')).not.toHaveText('—')
  await expect.poll(() => page.evaluate(() => (window.HR.PENDING || []).map(plugin => plugin.id))).toEqual([])
  await expect(page.locator('main')).not.toContainText('dsh-stale-candidate')
})

test('repository pre-check returns structured signals and enables GitHub submission', async ({ page }) => {
  await page.route('https://api.github.com/repos/acme/dsh-plugin', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ full_name: 'acme/dsh-plugin', private: false, archived: false, fork: false, topics: ['dsh-plugin'] }),
  }))
  await page.route('https://api.github.com/repos/acme/dsh-plugin/contents/package.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ name: 'dsh-plugin', dsh: { bundle: { patch: './cordis.patch.yml' } } }),
  }))
  await page.route('https://api.github.com/repos/acme/dsh-plugin/contents/cordis.patch.yml', route => route.fulfill({
    status: 200,
    contentType: 'text/yaml',
    body: '- insert:\n    - id: hello\n      name: dsh-plugin\n',
  }))
  await page.goto('/publish.html')
  await page.locator('#repo-input').fill('acme/dsh-plugin')
  await page.locator('#repo-checker-form').evaluate(form => form.requestSubmit())
  await expect(page.locator('[data-check="bundle"]')).toHaveClass(/ok/)
  await expect(page.locator('#submission-actions')).toBeVisible()
  await expect(page.locator('#github-submit')).toHaveAttribute('href', /github\.com\/majiayu000\/dsh-plugin-registry\/issues\/new/)
  await expect(page.locator('#review-submit')).toBeDisabled()
})
