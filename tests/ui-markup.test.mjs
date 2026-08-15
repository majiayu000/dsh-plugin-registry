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

test('plugin detail describes only verifiable registry signals', async () => {
  const html = await readFile('plugin-detail.html', 'utf8')
  assert.doesNotMatch(html, /为什么被收录|人工精选且可安装|已通过社区精选库/)
  assert.doesNotMatch(html, />README</)
  assert.match(html, />插件信息</)
  assert.match(html, /验证范围/)
  assert.match(html, /这不代表安全审计/)
  assert.match(html, /本站未单独审核其功能质量或安全性/)
})

test('plugin rows expose topics and update dates as decision signals', async () => {
  const script = await readFile('assets/plugins.js', 'utf8')
  assert.match(script, /prow-topic/)
  assert.match(script, /prow-updated/)
  assert.match(script, /plugin\.pushedAt/)
})

test('directory places plugin results directly after the filters', async () => {
  const html = await readFile('index.html', 'utf8')
  assert.doesNotMatch(html, /id="featured-sec"|热门精选|class="fcard"/)
  assert.match(html, /id="language"[\s\S]*<h2>全部插件<\/h2>/)
})

test('install actions open an accessible shared guide instead of silently copying', async () => {
  const shared = await readFile('assets/plugins.js', 'utf8')
  const detail = await readFile('plugin-detail.html', 'utf8')
  assert.match(shared, /document\.createElement\('dialog'\)/)
  assert.match(shared, /aria-labelledby/)
  assert.match(shared, /dialog\.showModal\(\)/)
  assert.match(shared, /Manifest 格式验证不代表安全审计/)
  assert.match(shared, /插件尚未安装/)
  assert.match(shared, /Install steps.*安装步骤/)
  assert.match(shared, /openInstallDialog\(plugin\)/)
  assert.match(detail, /HR\.openInstallDialog\(plugin\)/)
  assert.match(detail, /id="install-btn">安装步骤<\/button>/)
  assert.match(detail, /id="copy-btn"/)
  assert.match(detail, /id="install-copy-status" role="status"/)
  assert.match(detail, /命令已复制，插件尚未安装/)
})
