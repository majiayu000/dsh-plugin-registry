import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { pluginPathSegments, pluginRoute } from '../assets/plugin-route.js'
import { computeRankingScore } from '../assets/registry-ranking.js'
import { pluginDataFilename } from '../assets/plugin-data-route.js'
import {
  createBrowseSnapshot,
  escapeHtml,
  prerenderDashboard,
  prerenderPluginDetail,
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

function localizedDescription(plugin) {
  return plugin.description?.zh || plugin.description?.en || `${plugin.name} — DeepSeek Harness community plugin.`
}

function deploymentBasePath(template, homepage) {
  const asset = template.match(/(?:src|href)="([^"?]*\/assets\/)/)?.[1]
  if (asset?.startsWith('/')) return asset.slice(0, asset.indexOf('/assets/') + 1)
  return new URL(homepage).pathname
}

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

export function renderPluginPage(template, plugin, homepage, { related = [], categories = {} } = {}) {
  const route = pluginRoute(plugin)
  const canonical = new URL(route, homepage).href
  const title = `${plugin.name} — DeepSeek Harness Plugin Registry`
  const description = localizedDescription(plugin).replace(/\s+/g, ' ').trim().slice(0, 180)
  const image = plugin.icon || new URL('assets/dsh-registry-logo.svg', homepage).href
  const basePath = deploymentBasePath(template, homepage)
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': canonical,
        url: canonical,
        name: title,
        description,
        inLanguage: ['zh-CN', 'en-US'],
        mainEntity: { '@id': `${canonical}#plugin` },
        breadcrumb: { '@id': `${canonical}#breadcrumb` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${canonical}#plugin`,
        name: plugin.name,
        description,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Any',
        url: canonical,
        sameAs: plugin.url,
        isBasedOn: { '@id': `${canonical}#source` },
        softwareRequirements: 'DeepSeek Harness',
        author: { '@type': 'Organization', name: plugin.owner, url: `https://github.com/${encodeURIComponent(plugin.owner)}` },
        ...(plugin.license ? { license: plugin.license } : {}),
        ...(plugin.pushedAt ? { dateModified: plugin.pushedAt } : {}),
        ...(plugin.addedAt ? { datePublished: plugin.addedAt } : {}),
        ...(plugin.topics?.length ? { keywords: plugin.topics.join(', ') } : {}),
      },
      {
        '@type': 'SoftwareSourceCode',
        '@id': `${canonical}#source`,
        name: `${plugin.name} source code`,
        codeRepository: plugin.url,
        targetProduct: { '@id': `${canonical}#plugin` },
        ...(plugin.language ? { programmingLanguage: plugin.language } : {}),
        ...(plugin.license ? { license: plugin.license } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonical}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '插件目录', item: homepage },
          { '@type': 'ListItem', position: 2, name: plugin.name, item: canonical },
        ],
      },
    ],
  }).replace(/</g, '\\u003c')

  const page = template
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace('</head>', [
      `<base href="${escapeHtml(basePath)}">`,
      `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
      '<meta property="og:type" content="website" />',
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      '<meta property="og:site_name" content="DeepSeek Harness Plugin Registry" />',
      '<meta property="og:locale" content="zh_CN" />',
      '<meta property="og:locale:alternate" content="en_US" />',
      '<meta name="twitter:card" content="summary" />',
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
      `<script type="application/ld+json">${structuredData}</script>`,
      '</head>',
    ].join('\n'))
    .replace('<body>', `<body data-plugin-id="${escapeHtml(plugin.id)}">`)
  return prerenderPluginDetail(page, plugin, related, categories)
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
  const [template, registry, packageDocument] = await Promise.all([
    readFile(join(distDir, 'plugin-detail.html'), 'utf8'),
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
  function relatedPlugins(plugin, limit = 3) {
    return (peersByCategory.get(plugin.category) || [])
      .filter(peer => peer.id !== plugin.id)
      .sort((a, b) => computeRankingScore(b).score - computeRankingScore(a).score)
      .slice(0, limit)
      .map(peer => ({ id: peer.id, name: peer.name, owner: peer.owner, url: peer.url, stars: peer.stars, trustLevel: peer.trustLevel }))
  }
  const dataDir = join(distDir, 'data', 'plugins')

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

  await mkdir(dataDir, { recursive: true })
  let dataFileCount = 0
  for (const plugin of registry.plugins) {
    const route = pluginRoute(plugin)
    const output = join(distDir, 'plugins', ...pluginPathSegments(plugin), 'index.html')
    await mkdir(dirname(output), { recursive: true })
    const related = relatedPlugins(plugin)
    await writeFile(output, renderPluginPage(template, plugin, homepage, { related, categories: registry.categories }))
    urls.push({ loc: new URL(route, homepage).href, lastmod: plugin.pushedAt || plugin.addedAt || registry.generatedAt })

    // 单插件小数据：详情页用它代替整份多 MB 快照（category 元数据 + 同类推荐一并内置）。
    const filename = pluginDataFilename(plugin.id)
    if (filename) {
      await writeFile(join(dataDir, `${filename}.json`), JSON.stringify({
        schemaVersion: 1,
        generatedAt: registry.generatedAt ?? null,
        categories: registry.categories || {},
        plugin,
        related,
      }))
      dataFileCount += 1
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(({ loc, lastmod }) => `  <url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${xmlEscape(String(lastmod).slice(0, 10))}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`
  await Promise.all([
    writeFile(join(distDir, 'sitemap.xml'), sitemap),
    writeFile(join(distDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', homepage).href}\n`),
  ])
  console.log(`SEO pages generated: ${registry.plugins.length} plugin pages, ${staticPageCount} static pages, ${dataFileCount} per-plugin data files, ${browseSnapshot.filename}, and sitemap.xml.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateSeoFiles().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
