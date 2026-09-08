import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { pluginRoute, pluginShardFilename } from '../assets/plugin-route.js'
import { computeRankingScore } from '../assets/registry-ranking.js'
import {
  createBrowseSnapshot,
  escapeHtml,
  prerenderDashboard,
  prerenderRegistryHome,
} from './prerender-pages.mjs'

export { pluginRoute } from '../assets/plugin-route.js'

function xmlEscape(value) {
  return escapeHtml(value).replace(/&#39;/g, '&apos;')
}

const STATIC_PAGES = [
  { file: 'index.html', path: '' },
  { file: 'publish.html', path: 'publish.html' },
  { file: 'policy.html', path: 'policy.html' },
  { file: 'dashboard.html', path: 'dashboard.html' },
]

async function inlinePageStyles(page, distDir) {
  const match = page.match(/<link rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/)
  if (!match) return page
  const assetPath = match[1].replace(/^\//, '')
  const stylesheet = await readFile(join(distDir, assetPath), 'utf8')
  return page.replace(match[0], `<style data-critical-css>${stylesheet.replace(/<\/style/gi, '<\\/style')}</style>`)
}

async function deferPageModule(page, distDir) {
  const match = page.match(/<script type="module"(?:\s+crossorigin)?\s+src="([^"]+)"><\/script>/)
  if (!match) return page
  const moduleUrl = match[1]
  const loader = `(function(){var started=false;function start(){if(started)return;started=true;document.documentElement.dataset.enhancementBoot="ready";var script=document.createElement("script");script.type="module";script.src=${JSON.stringify(moduleUrl)};script.onerror=function(){document.documentElement.dataset.registryHydration="failed";var note=document.getElementById("list-note");if(note)note.textContent="插件交互暂时无法加载；当前列表仍可浏览。"};document.head.appendChild(script)}["pointerdown","keydown","focusin"].forEach(function(type){addEventListener(type,start,{once:true,capture:true})});addEventListener("load",function(){setTimeout(start,100)},{once:true})})();`
  const digest = createHash('sha256').update(loader).digest('hex').slice(0, 12)
  const filename = `browse-loader-${digest}.js`
  await writeFile(join(distDir, 'assets', filename), loader)
  return page
    .replace(match[0], `<script defer src="/assets/${filename}"></script>`)
    .replace(/\s*<link rel="modulepreload"[^>]+>\n?/g, '')
}

export function renderStaticPage(page, path, homepage) {
  const canonical = new URL(path, homepage).href
  const title = page.match(/<title>([^<]*)<\/title>/)?.[1]
  if (!title) throw new Error(`Static page ${canonical} is missing a <title> element for SEO tags.`)
  const description = page.match(/<meta name="description" content="([^"]*)" ?\/>/)?.[1]
  const icon = page.match(/<link rel="icon" href="([^"]+)"[^>]*>/)?.[1]
  const tags = [
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    description ? `<meta property="og:description" content="${escapeHtml(description)}" />` : '',
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    icon ? `<meta property="og:image" content="${escapeHtml(new URL(icon, canonical).href)}" />` : '',
    '<meta property="og:site_name" content="DeepSeek Harness Plugin Registry" />',
    '<meta property="og:locale" content="zh_CN" />',
    '<meta property="og:locale:alternate" content="en_US" />',
    '<meta name="twitter:card" content="summary" />',
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    description ? `<meta name="twitter:description" content="${escapeHtml(description)}" />` : '',
    icon ? `<meta name="twitter:image" content="${escapeHtml(new URL(icon, canonical).href)}" />` : '',
    `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': canonical,
      url: canonical,
      name: title,
      ...(description ? { description } : {}),
      inLanguage: ['zh-CN', 'en-US'],
      isPartOf: { '@type': 'WebSite', name: 'DeepSeek Harness Plugin Registry', url: homepage },
    }).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean)
  return page.replace('</head>', tags.join('\n') + '\n</head>')
}

export async function generateSeoFiles({
  distDir = resolve('dist'),
  registryPath = resolve('public/data/plugins.json'),
  homepage,
} = {}) {
  const [registry, packageDocument] = await Promise.all([
    readFile(registryPath, 'utf8').then(JSON.parse),
    homepage ? null : readFile(resolve('package.json'), 'utf8').then(JSON.parse),
  ])
  homepage ||= packageDocument.homepage
  if (!homepage) throw new Error('package.json homepage is required to generate canonical plugin URLs.')
  const urls = STATIC_PAGES.map(({ path }) => ({ loc: new URL(path, homepage).href, lastmod: registry.generatedAt }))
  const browseSnapshot = createBrowseSnapshot(registry)
  await mkdir(join(distDir, 'data'), { recursive: true })
  await writeFile(join(distDir, 'data', browseSnapshot.filename), browseSnapshot.text)

  const peersByCategory = new Map()
  for (const plugin of registry.plugins) {
    const peers = peersByCategory.get(plugin.category) || []
    peers.push(plugin)
    peersByCategory.set(plugin.category, peers)
  }
  for (const peers of peersByCategory.values()) {
    peers.sort((a, b) => computeRankingScore(b).score - computeRankingScore(a).score)
  }
  function relatedPlugins(plugin, limit = 3) {
    return (peersByCategory.get(plugin.category) || [])
      .slice(0, limit + 1)
      .filter(peer => peer.id !== plugin.id)
      .slice(0, limit)
      .map(peer => ({ id: peer.id, name: peer.name, owner: peer.owner, url: peer.url, stars: peer.stars, trustLevel: peer.trustLevel }))
  }

  let staticPageCount = 0
  for (const { file, path } of STATIC_PAGES) {
    const target = join(distDir, file)
    const page = await readFile(target, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (page === null) continue
    let rendered = renderStaticPage(page, path, homepage)
    if (file === 'index.html') {
      rendered = prerenderRegistryHome(rendered, registry, `data/${browseSnapshot.filename}`, homepage)
    } else if (file === 'dashboard.html') {
      rendered = prerenderDashboard(rendered, registry)
    }
    if (file === 'index.html' || file === 'dashboard.html') rendered = await inlinePageStyles(rendered, distDir)
    if (file === 'index.html') rendered = await deferPageModule(rendered, distDir)
    await writeFile(target, rendered)
    staticPageCount += 1
  }

  // Fixed file count; each cold request reads only one small bucket.
  const shards = new Map(Array.from({ length: 256 }, (_, i) => [i.toString(16).padStart(2, '0'), {}]))
  for (const plugin of registry.plugins) {
    const route = pluginRoute(plugin)
    shards.get(pluginShardFilename(plugin.id))[plugin.id.toLowerCase()] = {
      schemaVersion: 1,
      generatedAt: registry.generatedAt ?? null,
      categories: registry.categories || {},
      plugin,
      related: relatedPlugins(plugin),
    }
    urls.push({ loc: new URL(route, homepage).href, lastmod: plugin.pushedAt || plugin.addedAt || registry.generatedAt })
  }
  const shardDir = join(distDir, 'data', 'plugin-shards')
  await mkdir(shardDir, { recursive: true })
  await Promise.all([...shards].map(([id, documents]) =>
    writeFile(join(shardDir, `${id}.json`), JSON.stringify({ homepage, documents }))))

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(({ loc, lastmod }) => `  <url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${xmlEscape(String(lastmod).slice(0, 10))}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`
  await Promise.all([
    writeFile(join(distDir, 'sitemap.xml'), sitemap),
    writeFile(join(distDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', homepage).href}\n`),
  ])
  // Publish the cache version only after all files for this build are ready.
  await writeFile(join(distDir, 'data', 'detail-build.json'), JSON.stringify({ version: randomUUID() }))
  console.log(`SEO pages generated: ${registry.plugins.length} plugin URLs, 256 detail shards, ${staticPageCount} static pages, ${browseSnapshot.filename}, and sitemap.xml.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateSeoFiles().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
