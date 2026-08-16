import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const pages = ['index.html', 'dashboard.html', 'plugin-detail.html', 'publish.html', 'policy.html']

test('preview pages do not claim a deployment or a signed-in user', async () => {
  const html = (await Promise.all(pages.map(page => readFile(page, 'utf8')))).join('\n')
  assert.doesNotMatch(html, /REGISTRY LIVE|LIVE DATA|已登录：lifcc|registry\.deepseek-harness\.dev/)
  assert.match(html, /COMMUNITY PREVIEW/)
})

test('mobile styles keep primary navigation available', async () => {
  const css = await readFile('assets/registry.css', 'utf8')
  assert.doesNotMatch(css, /\.nav\s*\{\s*display:\s*none/)
  assert.match(css, /\.nav\s*\{[\s\S]*display:\s*flex;\s*order:\s*3;/)
  assert.match(css, /\.installbox\s*\{\s*flex-wrap:\s*wrap;/)
  assert.match(css, /\.statstrip\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*1fr 1fr;/)
  assert.match(css, /\.chips\s*\{[^}]*overflow-x:\s*auto;/)
})

test('every page uses the complete registry name and shared logo asset', async () => {
  const htmlPages = await Promise.all(pages.map(page => readFile(page, 'utf8')))
  htmlPages.forEach(html => {
    assert.match(html, /<title>[^<]*DeepSeek Harness Plugin Registry<\/title>/)
    assert.match(html, /rel="icon" href="assets\/dsh-desk-logo\.png"/)
    assert.match(html, /class="brand-logo" src="assets\/dsh-desk-logo\.png"/)
    assert.match(html, /<strong>DeepSeek Harness<\/strong><em>Community Registry<\/em>/)
  })
})

test('primary pages expose keyboard and assistive-technology navigation', async () => {
  const htmlPages = await Promise.all(pages.map(page => readFile(page, 'utf8')))
  htmlPages.forEach(html => {
    assert.match(html, /class="skip-link" href="#main-content"/)
    assert.match(html, /<main[^>]+id="main-content"/)
    assert.match(html, /<nav class="nav" aria-label="主要导航">/)
  })
  const index = htmlPages[0]
  assert.match(index, /<label class="sr-only" for="q">/)
  assert.match(index, /id="sort" aria-label="排序方式"/)
  const browse = index + '\n' + await readFile('assets/page-browse.js', 'utf8')
  assert.match(browse, /aria-pressed/)
})

test('homepage links to the registry GitHub repository', async () => {
  const [html, css] = await Promise.all([
    readFile('index.html', 'utf8'),
    readFile('assets/registry.css', 'utf8'),
  ])
  assert.match(html, /class="github-link" href="https:\/\/github\.com\/majiayu000\/dsh-plugin-registry"/)
  assert.match(html, /aria-label="在 GitHub 上查看本项目"/)
  assert.match(css, /\.github-link\s*\{/)
})

test('plugin detail describes only verifiable registry signals', async () => {
  const [html, script] = await Promise.all([
    readFile('plugin-detail.html', 'utf8'),
    readFile('assets/page-detail.js', 'utf8'),
  ])
  const detail = html + '\n' + script
  assert.doesNotMatch(detail, /为什么被收录|人工精选且可安装|已通过社区精选库/)
  assert.doesNotMatch(detail, />README</)
  assert.match(detail, />插件信息</)
  assert.match(detail, /验证范围/)
  assert.match(detail, /本站不审计插件安全性/)
  assert.match(detail, /本站没有检查 Manifest/)
  assert.match(detail, /安装前请确认/)
})

test('plugin rows expose topics and update dates as decision signals', async () => {
  const script = await readFile('assets/plugins.js', 'utf8')
  assert.match(script, /prow-topic/)
  assert.match(script, /prow-updated/)
  assert.match(script, /plugin\.pushedAt/)
})

test('special listings receive a distinct bilingual marker', async () => {
  const [script, css] = await Promise.all([
    readFile('assets/plugins.js', 'utf8'),
    readFile('assets/registry.css', 'utf8'),
  ])
  assert.match(script, /Special listing.*特别收录/)
  assert.match(script, /Source: X recommendation.*来源：X 推荐/)
  assert.match(css, /\.pill-special/)
})

test('pending GitHub candidates remain visible without exposing an install action', async () => {
  const [html, script, css] = await Promise.all([
    readFile('index.html', 'utf8'),
    readFile('assets/plugins.js', 'utf8'),
    readFile('assets/registry.css', 'utf8'),
  ])
  assert.match(script, /data\/registry-audit\.json/)
  assert.match(script, /pending_review/)
  assert.match(script, /缺少有效 dsh\.bundle/)
  assert.match(script, /查看仓库/)
  assert.match(html, /value="not_validated">缺少有效 dsh\.bundle/)
  assert.match(css, /\.prow-pending/)
})

test('directory places plugin results directly after the filters', async () => {
  const html = await readFile('index.html', 'utf8')
  assert.doesNotMatch(html, /id="featured-sec"|热门精选|class="fcard"/)
  assert.match(html, /id="language"[\s\S]*<h2>插件<\/h2>/)
})

test('install actions open an accessible shared guide instead of silently copying', async () => {
  const shared = await readFile('assets/plugins.js', 'utf8')
  const [detailHtml, detailScript] = await Promise.all([
    readFile('plugin-detail.html', 'utf8'),
    readFile('assets/page-detail.js', 'utf8'),
  ])
  const detail = detailHtml + '\n' + detailScript
  assert.match(shared, /document\.createElement\('dialog'\)/)
  assert.match(shared, /aria-labelledby/)
  assert.match(shared, /dialog\.showModal\(\)/)
  assert.match(shared, /本站不审计插件安全性/)
  assert.match(shared, /插件尚未安装/)
  assert.match(shared, /Install steps.*安装步骤/)
  assert.match(shared, /View install method.*查看安装方式/)
  assert.match(shared, /Manifest 未检查/)
  assert.match(shared, /openInstallDialog\(plugin\)/)
  assert.match(detail, /HR\.openInstallDialog\(plugin\)/)
  assert.match(detail, /id="install-btn">安装步骤<\/button>/)
  assert.match(detail, /id="copy-btn"/)
  assert.match(detail, /id="install-copy-status" role="status"/)
  assert.match(detail, /命令已复制，插件尚未安装/)
})

test('listing policy stays inside the registry site', async () => {
  const index = await readFile('index.html', 'utf8')
  const publish = await readFile('publish.html', 'utf8')
  const policy = await readFile('policy.html', 'utf8')
  assert.match(index, /href="policy\.html">收录规范<\/a>/)
  assert.match(publish, /href="policy\.html">查看完整收录规范<\/a>/)
  assert.doesNotMatch(index + publish + policy, /awesome-dsh-plugin\/awesome-dsh-plugin\/blob\/main\/contributing\.md/)
  assert.doesNotMatch(policy, /https?:\/\//)
  assert.doesNotMatch(policy, /其他插件网站|awesome-dsh-plugin/)
})
