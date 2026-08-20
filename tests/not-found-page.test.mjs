import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('the custom not-found page is non-indexable and returns visitors to the registry', async () => {
  const page = await readFile('404.html', 'utf8')
  const viteConfig = await readFile('vite.config.js', 'utf8')

  assert.match(page, /<meta name="robots" content="noindex, nofollow" \/>/)
  assert.match(page, /<title>页面未找到 — DeepSeek Harness Plugin Registry<\/title>/)
  assert.match(page, /<a class="btn btn-primary" href="\/">返回插件目录<\/a>/)
  assert.doesNotMatch(page, /rel="canonical"/)
  assert.match(viteConfig, /notFound: resolve\(import\.meta\.dirname, '404\.html'\)/)
})
