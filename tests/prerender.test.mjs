import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createBrowseSnapshot,
  prerenderDashboard,
  prerenderPluginDetail,
  prerenderRegistryHome,
} from '../scripts/prerender-pages.mjs'

const categories = {
  tools: { zh: '工具与能力', en: 'Tools & Capabilities' },
  memory: { zh: '记忆', en: 'Memory' },
}

const plugins = [
  {
    id: 'acme/terminal', name: 'Terminal', owner: 'acme', url: 'https://github.com/acme/terminal',
    description: { zh: '快速终端工具', en: 'Fast terminal tool' }, category: 'tools', stars: 42, forks: 3,
    language: 'TypeScript', license: 'MIT', pushedAt: '2026-08-20T00:00:00Z', addedAt: '2026-08-21',
    latestRelease: { tag: 'v1.0.0', publishedAt: '2026-08-19T00:00:00Z' }, source: 'discovered',
    trustLevel: 'manifest_verified', verification: { manifest: 'shape_validated', patch: 'exists', installation: 'not_tested' },
    install: 'dsh plugin --profile web add github:acme/terminal#0123456789012345678901234567890123456789',
    profile: 'web', packageName: '@acme/terminal', verifiedCommit: '0123456789012345678901234567890123456789',
    topics: ['terminal', 'automation'], icon: 'https://github.com/acme.png',
  },
  {
    id: 'beta/memory', name: 'Memory', owner: 'beta', url: 'https://github.com/beta/memory',
    description: { zh: '长期记忆', en: 'Long-term memory' }, category: 'memory', stars: 10, forks: 1,
    language: 'Rust', license: 'Apache-2.0', pushedAt: '2026-08-18T00:00:00Z', addedAt: '2026-08-18',
    source: 'curated', trustLevel: 'curated', verification: { manifest: 'shape_validated', patch: 'exists', installation: 'not_tested' },
    install: 'dsh plugin --profile web add github:beta/memory#abcdefabcdefabcdefabcdefabcdefabcdefabcd',
    profile: 'web', verifiedCommit: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd', topics: ['memory'],
  },
]

const registry = {
  schemaVersion: 2,
  generatedAt: '2026-08-25T00:00:00.000Z',
  categories,
  stats: { published: plugins.length },
  plugins,
}

test('browse snapshot is compact, content-addressed, and expands without installation payloads', () => {
  const snapshot = createBrowseSnapshot(registry)
  assert.match(snapshot.filename, /^browse-[0-9a-f]{12}\.json$/)
  assert.ok(snapshot.text.length < JSON.stringify(registry).length)
  const document = JSON.parse(snapshot.text)
  assert.equal(document.schemaVersion, 1)
  assert.equal(document.plugins.length, 2)
  assert.ok(Array.isArray(document.plugins[0]))
  assert.doesNotMatch(snapshot.text, /dsh plugin --profile/)
})

test('homepage prerender exposes meaningful content before JavaScript runs', () => {
  const template = `<!doctype html><html lang="zh-CN"><head><title>Registry</title></head><body>
    <span class="freshness" data-freshness hidden></span>
    <b id="st-count">—</b><b id="st-stars">—</b><b id="st-author">—</b><b id="st-auto">—</b>
    <div id="chips"><button data-cat="all"><span id="all-count">—</span></button></div>
    <span id="list-note"></span><select id="language"><option value="all">全部语言</option></select>
    <div id="list"></div><div id="load-more-wrap"></div></body></html>`
  const page = prerenderRegistryHome(template, registry, 'data/browse-deadbeef0000.json', 'https://example.com/')
  assert.match(page, /data-registry-prerendered="true"/)
  assert.match(page, /data-registry-src="data\/browse-deadbeef0000\.json"/)
  assert.match(page, /id="st-count">2</)
  assert.match(page, /class="prow"/)
  assert.match(page, /href="plugins\/acme\/terminal\/"/)
  assert.match(page, /id="list-note">2 个结果</)
  assert.match(page, /"@type":"ItemList"/)
})

test('dashboard prerender replaces every loading placeholder', () => {
  const template = `<!doctype html><html lang="zh-CN"><head></head><body>
    <span class="freshness" data-freshness hidden></span>
    <b id="k-stars">—</b><b id="k-count">—</b><b id="k-author">—</b><b id="k-auto">—</b>
    <div id="cats"></div><div id="sources"></div><p id="updated"></p>
    <tbody id="top-rows"></tbody><tbody id="author-rows"></tbody></body></html>`
  const page = prerenderDashboard(template, registry)
  assert.match(page, /data-registry-prerendered="true"/)
  assert.match(page, /id="k-count">2</)
  assert.match(page, /工具与能力/)
  assert.match(page, /acme\/terminal/)
  assert.doesNotMatch(page, /id="k-(?:stars|count|author|auto)">—</)
})

test('plugin detail prerender contains the visible entity and crawlable links', () => {
  const template = `<!doctype html><html lang="zh-CN"><head></head><body><main>
    <div id="avatar-slot"></div><h1 id="plugin-name">正在加载…</h1><p id="plugin-owner"></p><p id="plugin-desc"></p>
    <a id="repo-button"></a><code id="install-command"></code><p id="readme-desc"></p>
    <b id="plugin-stars">—</b><b id="plugin-forks">—</b><span id="maintainer"></span><span id="category"></span>
    <span id="package-status"></span><span id="profile-status"></span><span id="language-status"></span><span id="license-status"></span>
    <span id="release-status"></span><time id="updated-status"></time><time id="added-status"></time>
    <span id="manifest-status"></span><span id="patch-status"></span><span id="installation-test-status"></span><a id="repo-link"></a>
    <div id="topic-list"></div><section id="related-section" hidden><div id="related-list"></div></section>
  </main></body></html>`
  const page = prerenderPluginDetail(template, plugins[0], [plugins[1]], categories)
  assert.match(page, /data-plugin-prerendered="true"/)
  assert.match(page, /id="plugin-name">Terminal</)
  assert.match(page, /id="plugin-desc">快速终端工具</)
  assert.match(page, /href="https:\/\/github\.com\/acme\/terminal"/)
  assert.match(page, /href="plugins\/beta\/memory\/"/)
  assert.match(page, /id="language-status">TypeScript</)
  assert.match(page, /id="license-status">MIT</)
  assert.match(page, /id="manifest-status">格式检查通过</)
  assert.match(page, /id="patch-status">文件已确认</)
})
