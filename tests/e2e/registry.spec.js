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
    const target = new URL(href, document.baseURI)
    return {
      href,
      pathname: target.pathname,
      search: target.search,
      published: HR.PUBLISHED.some(plugin => HR.detailHref(plugin) === href),
      pending: (HR.PENDING || []).some(plugin => plugin.url === href),
    }
  })
  expect(order.published).toBe(true)
  expect(order.pending).toBe(false)
  expect(order.href).toMatch(/^plugins\//)
  expect(order.pathname).toMatch(/^\/plugins\//)
  expect(order.search).toBe('')
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
  expect(cachedAudit).toBeNull()

  await page.goto('/dashboard.html')
  await expect(page.locator('#k-count')).not.toHaveText('—')
  await expect.poll(() => page.evaluate(() => (window.HR.PENDING || []).map(plugin => plugin.id))).toEqual([])
  await expect(page.locator('main')).not.toContainText('dsh-stale-candidate')
})

const PINNED_SHA = '0123456789abcdef0123456789abcdef01234567'

async function mockCheckedRepository(page, { packageManifest, patchBody = '', branchStatus = 200, sha = PINNED_SHA } = {}) {
  const requested = []
  const match = pathname => url => url.hostname === 'api.github.com' && url.pathname === pathname
  await page.route(match('/repos/acme/dsh-plugin'), route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ full_name: 'acme/dsh-plugin', private: false, archived: false, fork: false, topics: ['dsh-plugin'], default_branch: 'main' }),
  }))
  await page.route(match('/repos/acme/dsh-plugin/branches/main'), route => route.fulfill({
    status: branchStatus,
    contentType: 'application/json',
    body: JSON.stringify(branchStatus === 200 ? { commit: { sha } } : {}),
  }))
  await page.route(url => url.hostname === 'api.github.com' && url.pathname.startsWith('/repos/acme/dsh-plugin/contents/'), route => {
    requested.push(route.request().url())
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/repos/acme/dsh-plugin/contents/package.json') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(packageManifest) })
    }
    if (pathname === '/repos/acme/dsh-plugin/contents/cordis.patch.yml') {
      return route.fulfill({ status: 200, contentType: 'text/yaml', body: patchBody })
    }
    return route.fulfill({ status: 404, contentType: 'text/plain', body: '' })
  })
  return requested
}

async function submitRepositoryCheck(page) {
  const channelReady = page.waitForResponse(response => response.url().includes('/api/submissions') && response.request().method() === 'GET')
  await page.goto('/publish.html')
  await channelReady
  await page.locator('#repo-input').fill('acme/dsh-plugin')
  await page.locator('#repo-checker-form').evaluate(form => form.requestSubmit())
}

test('repository pre-check returns structured signals and enables GitHub submission', async ({ page }) => {
  const requested = await mockCheckedRepository(page, {
    packageManifest: { name: 'dsh-plugin', dsh: { bundle: { patch: './cordis.patch.yml' } } },
    patchBody: '- insert:\n    - id: hello\n      name: dsh-plugin\n',
  })
  await submitRepositoryCheck(page)
  await expect(page.locator('[data-check="bundle"]')).toHaveClass(/ok/)
  await expect(page.locator('[data-check="patch"]')).toHaveClass(/ok/)
  await expect(page.locator('#submission-actions')).toBeVisible()
  await expect(page.locator('#github-submit')).toHaveAttribute('href', /github\.com\/majiayu000\/dsh-plugin-registry\/issues\/new/)
  await expect(page.locator('#review-submit')).toBeDisabled()
  expect(requested.map(url => new URL(url).pathname)).toEqual([
    '/repos/acme/dsh-plugin/contents/package.json',
    '/repos/acme/dsh-plugin/contents/cordis.patch.yml',
  ])
  for (const url of requested) expect(new URL(url).searchParams.get('ref')).toBe(PINNED_SHA)
})

test('repository pre-check leaves the patch row failed when the patch path smuggles a ref', async ({ page }) => {
  const requested = await mockCheckedRepository(page, {
    packageManifest: { name: 'dsh-plugin', dsh: { bundle: { patch: './ok.yml?ref=deadbeef' } } },
  })
  await submitRepositoryCheck(page)
  await expect(page.locator('[data-check="bundle"]')).toHaveClass(/fail/)
  await expect(page.locator('[data-check="patch"]')).toHaveClass(/fail/)
  await expect(page.locator('#check-message')).toContainText('dsh.bundle.patch')
  expect(requested.map(url => new URL(url).pathname)).toEqual(['/repos/acme/dsh-plugin/contents/package.json'])
  expect(requested.some(url => url.includes('deadbeef'))).toBe(false)
  expect(new URL(requested[0]).searchParams.get('ref')).toBe(PINNED_SHA)
})

test('repository pre-check skips contents when the default branch cannot be pinned', async ({ page }) => {
  const requested = await mockCheckedRepository(page, {
    branchStatus: 404,
    packageManifest: { name: 'dsh-plugin', dsh: { bundle: { patch: './cordis.patch.yml' } } },
    patchBody: '- insert:\n    - id: hello\n      name: dsh-plugin\n',
  })
  await submitRepositoryCheck(page)
  await expect(page.locator('[data-check="bundle"]')).toHaveClass(/fail/)
  await expect(page.locator('[data-check="patch"]')).toHaveClass(/fail/)
  await expect(page.locator('#check-message')).toContainText('could not be pinned to a commit')
  expect(requested).toEqual([])
})

test('rendered details hydrate inline while listing installs use the JSON API', async ({ page }) => {
  const { renderPluginPage } = await import('../../scripts/render-plugin-page.mjs')
  const template = await readFile(new URL('../../plugin-detail.html', import.meta.url), 'utf8')
  const plugin = {
    id: 'acme/mono#pkgs/core', name: 'Embedded Plugin', owner: 'acme',
    url: 'https://github.com/acme/mono', stars: 12, forks: 2, category: 'tools',
    description: { en: '</script><script>window.injected = true</script>', zh: '内嵌数据' },
    install: 'dsh plugin add embedded-plugin', topics: [], source: 'curated', trustLevel: 'curated',
  }
  const html = renderPluginPage(template, plugin, 'http://127.0.0.1:5173/')
  await page.route('**/plugins/acme/mono/pkgs/core/', route => route.fulfill({
    status: 200, contentType: 'text/html', body: html,
  }))
  await page.route('**/api/plugins/acme/mono/pkgs/core/', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ plugin }),
  }))
  const dataRequests = []
  page.on('request', request => {
    if (/\/data\/(plugins|registry-audit)/.test(request.url())) dataRequests.push(request.url())
  })
  await page.goto('/plugins/acme/mono/pkgs/core/')
  await expect.poll(() => page.evaluate(() => window.HR?.PUBLISHED?.length)).toBe(1)
  await expect(page.locator('#plugin-name')).toHaveText(plugin.name)
  await expect(page.locator('#install-command')).toHaveText(plugin.install)
  expect(dataRequests).toEqual([])
  expect(await page.evaluate(() => window.injected)).toBeUndefined()
  // This is the same lazy loader used by install buttons in the compact homepage snapshot.
  expect(await page.evaluate(id => HR.loadPluginDetail(id), plugin.id)).toEqual(plugin)
  await page.locator('#install-btn').click()
  await expect(page.locator('dialog[open] [data-install-command]')).toHaveText(plugin.install)

  await page.route('**/plugins/acme/mono/pkgs/core/', route => route.fulfill({
    status: 200, contentType: 'text/html', body: html.replace('id="plugin-data"', 'id="missing-data"'),
  }))
  await page.reload()
  await expect(page.locator('#plugin-name')).toHaveText(/插件数据加载失败|Unable to load plugin data/)
  expect(dataRequests).toEqual([])
})
