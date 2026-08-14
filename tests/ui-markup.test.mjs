import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const pages = ['index.html', 'dashboard.html', 'plugin-detail.html', 'publish.html']

test('preview pages do not claim a deployment or a signed-in user', async () => {
  const html = (await Promise.all(pages.map(page => readFile(page, 'utf8')))).join('\n')
  assert.doesNotMatch(html, /REGISTRY LIVE|LIVE DATA|已登录：lifcc|registry\.deepseek-harness\.dev/)
  assert.match(html, /REGISTRY PREVIEW/)
})

test('mobile styles keep primary navigation available', async () => {
  const css = await readFile('assets/registry.css', 'utf8')
  assert.doesNotMatch(css, /\.nav\s*\{\s*display:\s*none/)
  assert.match(css, /\.nav\s*\{[\s\S]*display:\s*flex;\s*order:\s*3;/)
})
