import { expect, test } from '@playwright/test'

test('search ranks exact plugin names and persists the query in the URL', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#list .prow').first()).toBeVisible()
  await page.locator('#q').fill('dsh-at-file')
  await expect(page.locator('#list .prow-name a').first()).toContainText('dsh-at-file')
  await expect(page).toHaveURL(/q=dsh-at-file/)
})

test('default directory ranks published plugins by stars instead of promoting candidates', async ({ page }) => {
  await page.goto('/')
  const first = page.locator('#list .prow').first()
  await expect(first).toBeVisible()
  const order = await page.evaluate(() => {
    const expected = HR.PLUGINS
      .filter(plugin => plugin.trustLevel !== 'pending_review')
      .sort((a, b) => b.stars - a.stars || a.id.localeCompare(b.id))[0]
    const href = document.querySelector('#list .prow .prow-name a')?.getAttribute('href') || ''
    return { expected: expected.id, actual: new URL(href, location.href).searchParams.get('plugin') }
  })
  expect(order.actual).toBe(order.expected)
  await expect(first.locator('.pill-pending')).toHaveCount(0)
  await expect(first).not.toContainText(/Manifest 未检查|Manifest not checked/)
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

test('repository pre-check returns structured signals and enables GitHub submission', async ({ page }) => {
  await page.route('https://api.github.com/repos/acme/dsh-plugin', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ full_name: 'acme/dsh-plugin', private: false, archived: false, fork: false, topics: ['dsh-plugin'] }),
  }))
  await page.route('https://api.github.com/repos/acme/dsh-plugin/contents/package.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ dsh: { bundle: { patch: './cordis.patch.yml' } } }),
  }))
  await page.goto('/publish.html')
  await page.locator('#repo-input').fill('acme/dsh-plugin')
  await page.locator('#repo-checker-form').evaluate(form => form.requestSubmit())
  await expect(page.locator('[data-check="bundle"]')).toHaveClass(/ok/)
  await expect(page.locator('#github-submit')).toHaveAttribute('aria-disabled', 'false')
})
