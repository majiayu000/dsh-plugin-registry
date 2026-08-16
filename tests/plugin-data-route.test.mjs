import assert from 'node:assert/strict'
import test from 'node:test'
import { pluginDataFilename } from '../assets/plugin-data-route.js'

test('plugin data filenames stay a single path segment for any qualifier', () => {
  assert.equal(pluginDataFilename('acme/plugin'), 'acme__plugin')
  assert.equal(pluginDataFilename('acme/mono#pkgs/core'), 'acme__mono~~pkgs~2fcore')
  // 限定符里的原始 `~` 自身被转义，不会与 `~~` 分隔符或转义序列混淆
  assert.equal(pluginDataFilename('acme/repo#~weird~name'), 'acme__repo~~~7eweird~7ename')
  assert.equal(pluginDataFilename('acme/repo#中文'), 'acme__repo~~~4e2d~6587')
  assert.equal(pluginDataFilename(''), '')
  assert.equal(pluginDataFilename('no-slash'), '')
  // 不同 id 必须映射到不同文件名（编码可注入）
  assert.notEqual(pluginDataFilename('acme/repo#a/b'), pluginDataFilename('acme/repo#a~2Fb'))
})
