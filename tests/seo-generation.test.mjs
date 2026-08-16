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
  await writeFile(registryPath, JSON.stringify({ plugins: [{
    id: 'acme/tools#terminal', name: 'Terminal', owner: 'acme', url: 'https://github.com/acme/tools',
    icon: 'https://github.com/acme.png', description: { zh: '终端插件', en: 'Terminal plugin' },
  }] }))

  await generateSeoFiles({ distDir, registryPath, homepage: 'https://example.com/registry/' })
  const route = pluginRoute({ id: 'acme/tools#terminal' })
  const page = await readFile(join(distDir, route, 'index.html'), 'utf8')
  const sitemap = await readFile(join(distDir, 'sitemap.xml'), 'utf8')
  assert.match(page, /data-plugin-id="acme\/tools#terminal"/)
  assert.match(page, /rel="canonical" href="https:\/\/example.com\/registry\/plugins\/acme\/tools\/terminal\/"/)
  assert.match(page, /application\/ld\+json/)
  assert.match(sitemap, /https:\/\/example.com\/registry\/plugins\/acme\/tools\/terminal\//)

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

test('SEO pages preserve the deployment base independently from the canonical domain', () => {
  const template = '<html><head><title>Plugin</title><meta name="description" content="Generic" /><script src="/legacy-path/assets/app.js"></script></head><body></body></html>'
  const page = renderPluginPage(template, {
    id: 'acme/plugin', name: 'Plugin', owner: 'acme', url: 'https://github.com/acme/plugin', description: { en: 'Plugin' },
  }, 'https://plugin.example.com/')
  assert.match(page, /<base href="\/legacy-path\/">/)
  assert.match(page, /rel="canonical" href="https:\/\/plugin\.example\.com\/plugins\/acme\/plugin\/"/)
})
