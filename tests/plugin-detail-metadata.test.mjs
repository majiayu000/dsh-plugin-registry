import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('plugin detail shows real maintenance metadata with honest fallbacks', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../plugin-detail.html', import.meta.url), 'utf8'),
    readFile(new URL('../assets/page-detail.js', import.meta.url), 'utf8'),
  ])
  const source = html + '\n' + script

  assert.match(source, /id="language-status"/)
  assert.match(source, /id="updated-status"/)
  assert.match(source, /id="license-status"/)
  assert.match(source, /id="release-status"/)
  assert.match(source, /id="package-status"/)
  assert.match(source, /id="profile-status"/)
  assert.match(script, /plugin\.language/)
  assert.match(script, /plugin\.pushedAt/)
  assert.match(script, /最近更新/)
  assert.match(script, /未提供/)
  assert.match(script, /GitHub 仓库最后推送时间/)
})
