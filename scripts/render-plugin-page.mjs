import { pluginRoute } from '../assets/plugin-route.js'
import { escapeHtml, prerenderPluginDetail } from './prerender-pages.mjs'

function localizedDescription(plugin) {
  return plugin.description?.zh || plugin.description?.en || `${plugin.name} — DeepSeek Harness community plugin.`
}

function deploymentBasePath(template, homepage) {
  const asset = template.match(/(?:src|href)="([^"?]*\/assets\/)/)?.[1]
  if (asset?.startsWith('/')) return asset.slice(0, asset.indexOf('/assets/') + 1)
  return new URL(homepage).pathname
}

export function renderPluginPage(template, plugin, homepage, { related = [], categories = {}, generatedAt = null } = {}) {
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
  const data = JSON.stringify({ schemaVersion: 1, generatedAt, categories, plugin, related }).replace(/</g, '\\u003c')
  return prerenderPluginDetail(page, plugin, related, categories)
    .replace('</body>', () => `<script id="plugin-data" type="application/json">${data}</script>\n</body>`)
}
