import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { renderPluginPage } from '../scripts/render-plugin-page.mjs'
import { pluginShardFilename } from '../assets/plugin-route.js'
import { generateSeoFiles, pluginRoute, renderStaticPage } from '../scripts/generate-seo.mjs'

test('SEO generation creates bounded detail shards and a complete sitemap', async () => {
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
        // 仓库内路径限定符仍应正确生成详情页与内嵌数据。
        id: 'acme/mono#pkgs/core', name: 'Mono Core', owner: 'acme', url: 'https://github.com/acme/mono',
        icon: 'https://github.com/acme.png', description: { zh: '子包', en: 'Subpackage' }, category: 'ui',
      },
      {
        // URL 编码 Unicode，读取详情数据后仍须保留原始 ID。
        id: 'acme/unicode#中文', name: 'Unicode', owner: 'acme', url: 'https://github.com/acme/unicode',
        icon: 'https://github.com/acme.png', description: { zh: 'Unicode', en: 'Unicode' }, category: 'unicode',
      },
    ],
  }))

  await generateSeoFiles({ distDir, registryPath, homepage: 'https://example.com/registry/' })
  const detail = async id => {
    const shard = JSON.parse(await readFile(join(distDir, 'data/plugin-shards', pluginShardFilename(id) + '.json'), 'utf8'))
    return shard.documents[id.toLowerCase()]
  }
  const render = async id => {
    const data = await detail(id)
    return renderPluginPage(await readFile(join(distDir, 'plugin-detail.html'), 'utf8'), data.plugin, 'https://example.com/registry/', data)
  }
  assert.equal((await readdir(distDir)).includes('plugins'), false)
  assert.equal((await readdir(join(distDir, 'data/plugin-shards'))).length, 256)
  const page = await render('acme/tools#terminal')
  const sitemap = await readFile(join(distDir, 'sitemap.xml'), 'utf8')
  assert.match(page, /data-plugin-id="acme\/tools#terminal"/)
  assert.match(page, /rel="canonical" href="https:\/\/example.com\/registry\/plugins\/acme\/tools\/terminal\/"/)
  assert.match(page, /application\/ld\+json/)
  assert.match(sitemap, /https:\/\/example.com\/registry\/plugins\/acme\/tools\/terminal\//)

  // Dynamic HTML carries the same record supplied by the JSON endpoint.
  const embedded = html => JSON.parse(html.match(/<script id="plugin-data" type="application\/json">([\s\S]*?)<\/script>/)[1])
  const dataFile = embedded(page)
  assert.equal((await readdir(join(distDir, 'data'))).includes('plugins'), false)
  assert.equal(dataFile.schemaVersion, 1)
  assert.equal(dataFile.generatedAt, '2026-08-16T00:00:00.000Z')
  assert.equal(dataFile.plugin.id, 'acme/tools#terminal')
  assert.deepEqual(dataFile.categories, { tools: { zh: '工具', en: 'Tools' } })
  assert.deepEqual(dataFile.related.map(related => related.id), ['acme/toolbox'])
  assert.deepEqual(dataFile.related[0], {
    id: 'acme/toolbox', name: 'Toolbox', owner: 'acme', url: 'https://github.com/acme/toolbox',
    stars: 10, trustLevel: 'curated',
  })
  const monoFile = embedded(await render('acme/mono#pkgs/core'))
  assert.equal(monoFile.plugin.id, 'acme/mono#pkgs/core')
  assert.deepEqual(monoFile.related, [])
  const unicodePage = await render('acme/unicode#中文')
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

test('embedded plugin data cannot terminate its script element', () => {
  const description = '</script><script>alert(1)</script><!-- & 中文'
  const page = renderPluginPage('<html><head><title>Plugin</title></head><body></body></html>', {
    id: 'acme/plugin', name: 'Plugin', owner: 'acme', description: { en: description },
  }, 'https://example.com/')
  const payload = page.match(/<script id="plugin-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1]
  assert.ok(payload)
  assert.equal(payload.includes('<'), false)
  assert.equal(JSON.parse(payload).plugin.description.en, description)
})
