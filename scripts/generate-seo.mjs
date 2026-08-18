import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { computeRankingScore } from '../assets/registry-ranking.js'
import { pluginDataFilename } from '../assets/plugin-data-route.js'

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function xmlEscape(value) {
  return escapeHtml(value).replace(/&#39;/g, '&apos;')
}

export function pluginRoute(plugin) {
  const [repository, qualifier] = String(plugin.id).split('#', 2)
  const segments = repository.split('/').concat(qualifier ? [qualifier] : [])
  return `plugins/${segments.map(segment => encodeURIComponent(segment)).join('/')}/`
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

export function renderPluginPage(template, plugin, homepage) {
  const route = pluginRoute(plugin)
  const canonical = new URL(route, homepage).href
  const title = `${plugin.name} — DeepSeek Harness Plugin Registry`
  const description = localizedDescription(plugin).replace(/\s+/g, ' ').trim().slice(0, 180)
  const image = plugin.icon || new URL('assets/dsh-registry-logo.svg', homepage).href
  const basePath = deploymentBasePath(template, homepage)
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: plugin.name,
    description,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any',
    url: canonical,
    codeRepository: plugin.url,
    author: { '@type': 'Person', name: plugin.owner },
  }).replace(/</g, '\\u003c')

  return template
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
      '<meta name="twitter:card" content="summary" />',
      `<script type="application/ld+json">${structuredData}</script>`,
      '</head>',
    ].join('\n'))
    .replace('<body>', `<body data-plugin-id="${escapeHtml(plugin.id)}">`)
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
    '<meta name="twitter:card" content="summary" />',
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
  const urls = STATIC_PAGES.map(({ path }) => new URL(path, homepage).href)

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
    await writeFile(target, renderStaticPage(page, path, homepage))
    staticPageCount += 1
  }

  await mkdir(dataDir, { recursive: true })
  let dataFileCount = 0
  for (const plugin of registry.plugins) {
    const route = pluginRoute(plugin)
    const output = join(distDir, route, 'index.html')
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, renderPluginPage(template, plugin, homepage))
    urls.push(new URL(route, homepage).href)

    // 单插件小数据：详情页用它代替整份多 MB 快照（category 元数据 + 同类推荐一并内置）。
    const filename = pluginDataFilename(plugin.id)
    if (filename) {
      await writeFile(join(dataDir, `${filename}.json`), JSON.stringify({
        schemaVersion: 1,
        generatedAt: registry.generatedAt ?? null,
        categories: registry.categories || {},
        plugin,
        related: relatedPlugins(plugin),
      }))
      dataFileCount += 1
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${xmlEscape(url)}</loc></url>`).join('\n')}\n</urlset>\n`
  await Promise.all([
    writeFile(join(distDir, 'sitemap.xml'), sitemap),
    writeFile(join(distDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', homepage).href}\n`),
  ])
  console.log(`SEO pages generated: ${registry.plugins.length} plugin pages, ${staticPageCount} static pages, ${dataFileCount} per-plugin data files, and sitemap.xml.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateSeoFiles().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
