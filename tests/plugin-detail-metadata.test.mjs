import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('plugin detail shows real maintenance metadata with honest fallbacks', async () => {
  const html = await readFile(new URL('../plugin-detail.html', import.meta.url), 'utf8')

  assert.match(html, /id="language-status"/)
  assert.match(html, /id="updated-status"/)
  assert.match(html, /id="license-status"/)
  assert.match(html, /id="release-status"/)
  assert.match(html, /plugin\.language/)
  assert.match(html, /plugin\.pushedAt/)
  assert.match(html, /最近更新/)
  assert.match(html, /未提供/)
  assert.match(html, /GitHub 仓库最后推送时间/)
})
