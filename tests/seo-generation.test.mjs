import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { generateSeoFiles, pluginRoute, renderPluginPage } from '../scripts/generate-seo.mjs'

test('SEO generation creates crawlable plugin pages and a sitemap', async () => {
  const root = await mkdtemp(join(tmpdir(), 'harness-registry-seo-'))
  const distDir = join(root, 'dist')
  const registryPath = join(root, 'plugins.json')
  await mkdir(distDir)
  await writeFile(join(distDir, 'plugin-detail.html'), '<html><head><title>Plugin</title><meta name="description" content="Generic" /></head><body></body></html>')
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
})

test('SEO pages preserve the deployment base independently from the canonical domain', () => {
  const template = '<html><head><title>Plugin</title><meta name="description" content="Generic" /><script src="/legacy-path/assets/app.js"></script></head><body></body></html>'
  const page = renderPluginPage(template, {
    id: 'acme/plugin', name: 'Plugin', owner: 'acme', url: 'https://github.com/acme/plugin', description: { en: 'Plugin' },
  }, 'https://plugin.example.com/')
  assert.match(page, /<base href="\/legacy-path\/">/)
  assert.match(page, /rel="canonical" href="https:\/\/plugin\.example\.com\/plugins\/acme\/plugin\/"/)
})
