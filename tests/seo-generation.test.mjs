import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { generateSeoFiles, pluginRoute, renderPluginPage, renderStaticPage } from '../scripts/generate-seo.mjs'

test('SEO generation creates crawlable plugin pages and a sitemap', async () => {
  const root = await mkdtemp(join(tmpdir(), 'harness-registry-seo-'))
  const distDir = join(root, 'dist')
  const registryPath = join(root, 'plugins.json')
  await mkdir(distDir)
  await writeFile(join(distDir, 'plugin-detail.html'), '<html><head><title>Plugin</title><meta name="description" content="Generic" /></head><body></body></html>')
  await writeFile(join(distDir, 'index.html'), '<html><head><title>Registry</title><meta name="description" content="Browse plugins" /><link rel="icon" href="/assets/logo.png" type="image/png" /></head><body></body></html>')
  await writeFile(join(distDir, 'publish.html'), '<html><head><title>Publish</title></head><body></body></html>')
  await writeFile(registryPath, JSON.stringify({
    generatedAt: '2026-08-16T00:00:00.000Z',
    categories: { tools: { zh: '工具', en: 'Tools' } },
    plugins: [
      {
        id: 'acme/tools#terminal', name: 'Terminal', owner: 'acme', url: 'https://github.com/acme/tools',
        icon: 'https://github.com/acme.png', description: { zh: '终端插件', en: 'Terminal plugin' }, category: 'tools',
      },
      {
        id: 'acme/toolbox', name: 'Toolbox', owner: 'acme', url: 'https://github.com/acme/toolbox',
        icon: 'https://github.com/acme.png', description: { zh: '工具箱', en: 'Toolbox plugin' }, category: 'tools',
        stars: 10, trustLevel: 'curated',
      },
      {
        // 限定符是仓库内路径，可含 `/`：数据文件必须仍是单段文件名（曾导致 ENOENT 崩溃）
        id: 'acme/mono#pkgs/core', name: 'Mono Core', owner: 'acme', url: 'https://github.com/acme/mono',
        icon: 'https://github.com/acme.png', description: { zh: '子包', en: 'Subpackage' }, category: 'ui',
      },
      {
        // URL 必须编码 Unicode，但静态文件目录必须保留解码后的名称，供 Pages 正确命中。
        id: 'acme/unicode#中文', name: 'Unicode', owner: 'acme', url: 'https://github.com/acme/unicode',
        icon: 'https://github.com/acme.png', description: { zh: 'Unicode', en: 'Unicode' }, category: 'unicode',
      },
    ],
  }))

  await generateSeoFiles({ distDir, registryPath, homepage: 'https://example.com/registry/' })
  const route = pluginRoute({ id: 'acme/tools#terminal' })
  const page = await readFile(join(distDir, route, 'index.html'), 'utf8')
  const sitemap = await readFile(join(distDir, 'sitemap.xml'), 'utf8')
  assert.match(page, /data-plugin-id="acme\/tools#terminal"/)
  assert.match(page, /rel="canonical" href="https:\/\/example.com\/registry\/plugins\/acme\/tools\/terminal\/"/)
  assert.match(page, /application\/ld\+json/)
  assert.match(sitemap, /https:\/\/example.com\/registry\/plugins\/acme\/tools\/terminal\//)

  // 详情页改读单插件小数据：限定符编码为 `~~`，同类推荐随文件一起生成
  const dataFile = JSON.parse(await readFile(join(distDir, 'data', 'plugins', 'acme__tools~~terminal.json'), 'utf8'))
  assert.equal(dataFile.schemaVersion, 1)
  assert.equal(dataFile.generatedAt, '2026-08-16T00:00:00.000Z')
  assert.equal(dataFile.plugin.id, 'acme/tools#terminal')
  assert.deepEqual(dataFile.categories, { tools: { zh: '工具', en: 'Tools' } })
  assert.deepEqual(dataFile.related.map(related => related.id), ['acme/toolbox'])
  assert.deepEqual(dataFile.related[0], {
    id: 'acme/toolbox', name: 'Toolbox', owner: 'acme', url: 'https://github.com/acme/toolbox',
    stars: 10, trustLevel: 'curated',
  })
  const monoFile = JSON.parse(await readFile(join(distDir, 'data', 'plugins', 'acme__mono~~pkgs~2fcore.json'), 'utf8'))
  assert.equal(monoFile.plugin.id, 'acme/mono#pkgs/core')
  assert.deepEqual(monoFile.related, [])
  const unicodePage = await readFile(join(distDir, 'plugins', 'acme', 'unicode', '中文', 'index.html'), 'utf8')
  assert.match(unicodePage, /rel="canonical" href="https:\/\/example\.com\/registry\/plugins\/acme\/unicode\/%E4%B8%AD%E6%96%87\/"/)
  assert.match(sitemap, /https:\/\/example\.com\/registry\/plugins\/acme\/unicode\/%E4%B8%AD%E6%96%87\//)

  const home = await readFile(join(distDir, 'index.html'), 'utf8')
  assert.match(home, /rel="canonical" href="https:\/\/example.com\/registry\/"/)
  assert.match(home, /property="og:title" content="Registry"/)
  assert.match(home, /property="og:image" content="https:\/\/example.com\/assets\/logo\.png"/)
  const publish = await readFile(join(distDir, 'publish.html'), 'utf8')
  assert.match(publish, /rel="canonical" href="https:\/\/example.com\/registry\/publish\.html"/)
  assert.match(publish, /property="og:title" content="Publish"/)
  assert.doesNotMatch(publish, /property="og:description"/)
})

test('renderStaticPage rejects pages without a title', () => {
  assert.throws(() => renderStaticPage('<html><head></head><body></body></html>', 'x.html', 'https://example.com/'), /missing a <title>/)
})

test('plugin routes encode registry-valid qualifier characters and reject traversal segments', () => {
  const relativeRoute = pluginRoute({ id: 'acme/repo#~weird~name' })
  assert.equal(relativeRoute, 'plugins/acme/repo/~weird~name/')
  assert.equal(new URL(relativeRoute, 'https://example.com/registry/').pathname, '/registry/plugins/acme/repo/~weird~name/')
  assert.equal(pluginRoute({ id: 'acme/repo#中文' }), 'plugins/acme/repo/%E4%B8%AD%E6%96%87/')
  assert.throws(() => pluginRoute({ id: 'acme/repo#packages/../secret' }), /Invalid plugin id/)
})

test('SEO pages preserve the deployment base independently from the canonical domain', () => {
  const template = '<html><head><title>Plugin</title><meta name="description" content="Generic" /><script src="/legacy-path/assets/app.js"></script></head><body></body></html>'
  const page = renderPluginPage(template, {
    id: 'acme/plugin', name: 'Plugin', owner: 'acme', url: 'https://github.com/acme/plugin', description: { en: 'Plugin' },
  }, 'https://plugin.example.com/')
  assert.match(page, /<base href="\/legacy-path\/">/)
  assert.match(page, /rel="canonical" href="https:\/\/plugin\.example\.com\/plugins\/acme\/plugin\/"/)
})
