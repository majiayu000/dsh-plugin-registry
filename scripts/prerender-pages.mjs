import { createHash } from 'node:crypto'
import { pluginRoute } from '../assets/plugin-route.js'
import { rankPlugins } from '../assets/registry-ranking.js'
import { toBrowseDocument } from '../assets/browse-snapshot.js'

const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>'
const FORK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v2c0 3 2 4 6 4s6-1 6-4V7M12 13v4"/></svg>'

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceContents(page, id, content) {
  const escapedId = escapeRegExp(id)
  const pattern = new RegExp(`(<([a-z][a-z0-9-]*)\\b[^>]*\\bid=["']${escapedId}["'][^>]*>)[\\s\\S]*?(<\\/\\2>)`, 'i')
  return page.replace(pattern, `$1${content}$3`)
}

function setAttribute(page, id, attribute, value) {
  const escapedId = escapeRegExp(id)
  const pattern = new RegExp(`(<[a-z][a-z0-9-]*\\b[^>]*\\bid=["']${escapedId}["'][^>]*)(>)`, 'i')
  return page.replace(pattern, (match, start, end) => {
    const attrPattern = new RegExp(`\\s${escapeRegExp(attribute)}=["'][^"']*["']`, 'i')
    const next = attrPattern.test(start)
      ? start.replace(attrPattern, ` ${attribute}="${escapeHtml(value)}"`)
      : `${start} ${attribute}="${escapeHtml(value)}"`
    return next + end
  })
}

function addHtmlAttributes(page, attributes) {
  return page.replace(/<html\b([^>]*)>/i, (match, existing) => {
    const additions = Object.entries(attributes)
      .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
      .join('')
    return `<html${existing}${additions}>`
  })
}

function description(plugin) {
  return plugin.description?.zh || plugin.description?.en || '作者未提供简介；安装前请先查看 GitHub 源码。'
}

function categoryName(categories, key) {
  const category = categories?.[key]
  return category?.zh || category?.en || key || '分类待确认'
}

function sourceLabel(plugin) {
  if (plugin.recommendationSource === 'x') return '来源：X 推荐'
  if (plugin.source === 'curated') return '来源：社区目录'
  return '来源：GitHub 自动发现'
}

function fmtNumber(value) {
  const number = Number(value) || 0
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  if (number >= 1_000) return `${(number / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(number)
}

function topicSignals(plugin) {
  return (plugin.topics || [])
    .filter(topic => !/^(dsh-plugin|deepseek-harness|dsh)$/i.test(topic))
    .slice(0, 2)
    .map(topic => `<span class="prow-topic">#${escapeHtml(topic)}</span>`)
    .join('')
}

function pluginSignals(plugin) {
  const signals = []
  if (plugin.packageName) signals.push(plugin.packageName)
  if (plugin.profile && plugin.profile !== 'web') signals.push(plugin.profile)
  if (plugin.license) signals.push(plugin.license)
  if (plugin.latestRelease?.tag) signals.push(plugin.latestRelease.tag)
  return signals.map(signal => `<span class="prow-topic">${escapeHtml(signal)}</span>`).join('')
}

function staticRow(plugin, index, categories) {
  const manifest = plugin.verification?.manifest === 'shape_validated'
    ? '<span class="pill pill-manifest">Manifest 格式检查通过</span>'
    : ''
  const special = plugin.special ? '<span class="pill pill-special">特别收录</span>' : ''
  const updated = plugin.pushedAt && !Number.isNaN(Date.parse(plugin.pushedAt))
    ? `<span class="prow-updated">更新于 ${escapeHtml(plugin.pushedAt.slice(0, 10))}</span>`
    : ''
  const avatar = plugin.icon
    ? `<img src="${escapeHtml(plugin.icon)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : ''
  return `<div class="prow" data-prerendered-row>
    <span class="prow-idx">${String(index + 1).padStart(3, '0')}</span>
    <span class="prow-av"><span class="pavatar${plugin.source === 'curated' ? '' : ' alt'}" aria-hidden="true"><span class="pavatar-fallback">${escapeHtml(plugin.name?.charAt(0).toUpperCase())}</span>${avatar}</span></span>
    <div class="prow-main">
      <div class="prow-name" data-dyn><a href="${escapeHtml(pluginRoute(plugin))}">${escapeHtml(plugin.name)}</a>${special}<span class="pill pill-source">${escapeHtml(sourceLabel(plugin))}</span>${manifest}</div>
      <div class="prow-desc" data-dyn>${escapeHtml(description(plugin))}</div>
      <div class="prow-signals" data-dyn>${topicSignals(plugin)}${pluginSignals(plugin)}${updated}</div>
    </div>
    <div class="prow-meta"><b data-dyn>@${escapeHtml(plugin.owner)}</b><br>${escapeHtml(categoryName(categories, plugin.category))}</div>
    <div class="prow-stars">${STAR}<b>${fmtNumber(plugin.stars)}</b><small>Stars</small></div>
    <div class="prow-forks">${plugin.forks == null ? '<b>—</b>' : `${FORK}<b>${fmtNumber(plugin.forks)}</b>`}<small>Forks</small></div>
    <div class="prow-act"><button class="btn btn-sm" type="button" data-install-plugin="${escapeHtml(plugin.id)}">安装步骤</button></div>
  </div>`
}

function registrySummary(registry) {
  const plugins = registry.plugins || []
  return {
    count: plugins.length,
    stars: plugins.reduce((sum, plugin) => sum + (Number(plugin.stars) || 0), 0),
    authors: new Set(plugins.map(plugin => plugin.owner)).size,
    manifests: plugins.filter(plugin => plugin.verification?.manifest === 'shape_validated').length,
  }
}

function freshnessMarkup(generatedAt) {
  if (!generatedAt) return '<span class="freshness" data-freshness hidden></span>'
  return `<span class="freshness" data-freshness title="快照生成时间：${escapeHtml(generatedAt)}">数据刚刚更新</span>`
}

export function createBrowseSnapshot(registry) {
  const text = JSON.stringify(toBrowseDocument(registry))
  const digest = createHash('sha256').update(text).digest('hex').slice(0, 12)
  return { filename: `browse-${digest}.json`, text }
}

export function prerenderRegistryHome(template, registry, browseUrl, homepage) {
  const summary = registrySummary(registry)
  const ranked = rankPlugins(registry.plugins || [])
  const visible = ranked.slice(0, 8)
  const categoryCounts = new Map()
  const languageCounts = new Map()
  for (const plugin of registry.plugins || []) {
    categoryCounts.set(plugin.category, (categoryCounts.get(plugin.category) || 0) + 1)
    if (plugin.language) languageCounts.set(plugin.language, (languageCounts.get(plugin.language) || 0) + 1)
  }
  const chips = [`<button class="chip on" type="button" data-cat="all" aria-pressed="true">全部 <span class="chip-count" id="all-count">${summary.count.toLocaleString()}</span></button>`]
  for (const key of Object.keys(registry.categories || {})) {
    chips.push(`<button class="chip" type="button" data-cat="${escapeHtml(key)}" aria-pressed="false">${escapeHtml(categoryName(registry.categories, key))} <span class="chip-count">${(categoryCounts.get(key) || 0).toLocaleString()}</span></button>`)
  }
  const languages = ['<option value="all">全部语言</option>']
  for (const [language, count] of [...languageCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    languages.push(`<option value="${escapeHtml(language)}">${escapeHtml(language)} (${count.toLocaleString()})</option>`)
  }
  const itemList = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'DeepSeek Harness Plugins',
    numberOfItems: summary.count,
    itemListElement: ranked.slice(0, 24).map((plugin, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: plugin.name,
      url: new URL(pluginRoute(plugin), homepage).href,
    })),
  }).replace(/</g, '\\u003c')

  let page = addHtmlAttributes(template, {
    'data-registry-prerendered': 'true',
    'data-registry-src': browseUrl,
    'data-generated-at': registry.generatedAt || '',
  })
  page = page.replace(/<span class="freshness" data-freshness hidden><\/span>/, freshnessMarkup(registry.generatedAt))
  page = replaceContents(page, 'st-count', summary.count.toLocaleString())
  page = replaceContents(page, 'st-stars', summary.stars.toLocaleString())
  page = replaceContents(page, 'st-author', summary.authors.toLocaleString())
  page = replaceContents(page, 'st-auto', summary.manifests.toLocaleString())
  page = replaceContents(page, 'chips', chips.join(''))
  page = replaceContents(page, 'language', languages.join(''))
  page = replaceContents(page, 'list-note', `${summary.count.toLocaleString()} 个结果`)
  page = replaceContents(page, 'list', visible.map((plugin, index) => staticRow(plugin, index, registry.categories)).join(''))
  page = page.replace('</head>', `<script type="application/ld+json">${itemList}</script>\n</head>`)
  return page
}

function bars(rows) {
  const max = Math.max(...rows.map(row => row.value), 1)
  return rows.map(row => {
    const width = row.value === 0 ? 0 : Math.max(2, Math.round(row.value / max * 100))
    return `<div class="hbar-row"><span>${escapeHtml(row.name)}</span><div class="hbar-track"><div class="hbar-fill" style="width:${width}%"></div></div><span class="hbar-n">${row.value.toLocaleString()}</span></div>`
  }).join('')
}

export function prerenderDashboard(template, registry) {
  const summary = registrySummary(registry)
  const byCategory = new Map()
  const byAuthor = new Map()
  for (const plugin of registry.plugins || []) {
    byCategory.set(plugin.category, (byCategory.get(plugin.category) || 0) + 1)
    const author = byAuthor.get(plugin.owner) || { owner: plugin.owner, count: 0, stars: 0 }
    author.count += 1
    author.stars += Number(plugin.stars) || 0
    byAuthor.set(plugin.owner, author)
  }
  const categoryRows = [...byCategory].map(([key, value]) => ({ name: categoryName(registry.categories, key), value })).sort((a, b) => b.value - a.value)
  const curated = (registry.plugins || []).filter(plugin => plugin.source === 'curated').length
  const top = [...(registry.plugins || [])].sort((a, b) => b.stars - a.stars).slice(0, 10)
  const authors = [...byAuthor.values()].sort((a, b) => b.stars - a.stars).slice(0, 10)
  let page = addHtmlAttributes(template, { 'data-registry-prerendered': 'true', 'data-generated-at': registry.generatedAt || '' })
  page = page.replace(/<span class="freshness" data-freshness hidden><\/span>/, freshnessMarkup(registry.generatedAt))
  page = replaceContents(page, 'k-stars', summary.stars.toLocaleString())
  page = replaceContents(page, 'k-count', summary.count.toLocaleString())
  page = replaceContents(page, 'k-author', summary.authors.toLocaleString())
  page = replaceContents(page, 'k-auto', summary.manifests.toLocaleString())
  page = replaceContents(page, 'cats', bars(categoryRows))
  page = replaceContents(page, 'sources', bars([
    { name: '社区目录', value: curated },
    { name: 'GitHub 自动发现', value: summary.count - curated },
  ]))
  page = replaceContents(page, 'updated', `数据生成于：${new Date(registry.generatedAt).toLocaleString('zh-CN')}`)
  page = replaceContents(page, 'top-rows', top.map((plugin, index) => `<tr><td class="r">${index + 1}</td><td class="nm"><a href="${escapeHtml(pluginRoute(plugin))}">${escapeHtml(plugin.id)}</a></td><td class="r">${plugin.stars.toLocaleString()}</td><td class="r">${plugin.forks.toLocaleString()}</td></tr>`).join(''))
  page = replaceContents(page, 'author-rows', authors.map(author => `<tr><td class="nm">@${escapeHtml(author.owner)}</td><td class="r">${author.count}</td><td class="r">${author.stars.toLocaleString()}</td></tr>`).join(''))
  return page
}

export function prerenderPluginDetail(template, plugin, related, categories) {
  const pluginDescription = description(plugin)
  const missing = '未提供'
  const manifestChecked = plugin.verification?.manifest === 'shape_validated'
  const patchState = plugin.verification?.patch || 'not_checked'
  const patchLabel = patchState === 'exists' ? '文件已确认' : patchState === 'missing' ? '未找到文件' : '未检查'
  let page = addHtmlAttributes(template, { 'data-plugin-prerendered': 'true' })
  page = replaceContents(page, 'avatar-slot', plugin.icon ? `<span class="pavatar lg" aria-hidden="true"><span class="pavatar-fallback">${escapeHtml(plugin.name.charAt(0).toUpperCase())}</span><img src="${escapeHtml(plugin.icon)}" alt="" decoding="async" referrerpolicy="no-referrer"></span>` : '')
  page = replaceContents(page, 'plugin-name', escapeHtml(plugin.name))
  page = replaceContents(page, 'plugin-owner', `@${escapeHtml(plugin.owner)}`)
  page = replaceContents(page, 'plugin-desc', escapeHtml(pluginDescription))
  page = replaceContents(page, 'readme-desc', escapeHtml(pluginDescription))
  page = replaceContents(page, 'install-command', escapeHtml(plugin.install || ''))
  page = replaceContents(page, 'plugin-stars', Number(plugin.stars || 0).toLocaleString())
  page = replaceContents(page, 'plugin-forks', plugin.forks == null ? '—' : Number(plugin.forks).toLocaleString())
  page = replaceContents(page, 'maintainer', `@${escapeHtml(plugin.owner)}`)
  page = replaceContents(page, 'category', escapeHtml(categoryName(categories, plugin.category)))
  page = replaceContents(page, 'package-status', escapeHtml(plugin.packageName || missing))
  page = replaceContents(page, 'profile-status', escapeHtml(plugin.profile || 'web'))
  page = replaceContents(page, 'language-status', escapeHtml(plugin.language || missing))
  page = replaceContents(page, 'license-status', escapeHtml(plugin.license || missing))
  page = replaceContents(page, 'release-status', escapeHtml(plugin.latestRelease?.tag || missing))
  page = replaceContents(page, 'updated-status', escapeHtml(plugin.pushedAt?.slice(0, 10) || missing))
  page = replaceContents(page, 'added-status', escapeHtml(plugin.addedAt?.slice(0, 10) || missing))
  if (plugin.pushedAt) page = setAttribute(page, 'updated-status', 'datetime', plugin.pushedAt)
  if (plugin.addedAt) page = setAttribute(page, 'added-status', 'datetime', plugin.addedAt)
  page = replaceContents(page, 'source', escapeHtml(sourceLabel(plugin).replace(/^来源：/, '')))
  page = replaceContents(page, 'manifest-status', manifestChecked ? '格式检查通过' : '未检查')
  page = replaceContents(page, 'patch-status', patchLabel)
  page = replaceContents(page, 'installation-test-status', '未执行')
  page = replaceContents(page, 'evidence-source', plugin.source === 'curated' ? '社区目录' : 'GitHub 自动发现')
  page = replaceContents(page, 'evidence-manifest', manifestChecked ? '格式检查通过' : '未检查')
  page = replaceContents(page, 'evidence-patch', patchLabel)
  page = replaceContents(page, 'evidence-installation', '未执行')
  page = replaceContents(page, 'manifest-decision', manifestChecked
    ? (patchState === 'exists' ? '同步时，Manifest 符合 dsh.bundle 格式，且引用的 Patch 文件真实存在。' : 'Manifest 符合 dsh.bundle 格式，但引用的 Patch 文件尚未确认。')
    : '本站没有检查这个仓库的 Manifest，请先在仓库中确认安装说明。')
  page = replaceContents(page, 'evidence-title', manifestChecked ? 'Manifest 格式检查通过' : '来源记录为社区目录')
  page = replaceContents(page, 'evidence-copy', manifestChecked
    ? '同步时，仓库根目录 package.json 符合 dsh.bundle 格式，Patch 文件检查结果单独展示；本站没有运行插件、测试安装或审计安全性。'
    : '该条目同步自公开社区目录；本站没有检查 Manifest、运行插件、测试安装或审计安全性。')
  page = replaceContents(page, 'topic-list', (plugin.topics || []).map(topic => `<span class="topic-chip">${escapeHtml(topic)}</span>`).join('') || '<span class="topic-chip">dsh-plugin</span>')
  page = setAttribute(page, 'repo-button', 'href', plugin.url)
  page = setAttribute(page, 'repo-link', 'href', plugin.url)
  const relatedMarkup = (related || []).map(candidate => `<a class="related-item" href="${escapeHtml(pluginRoute(candidate))}"><span><b>${escapeHtml(candidate.name)}</b><small>@${escapeHtml(candidate.owner)}</small></span><strong>${fmtNumber(candidate.stars)} ★</strong></a>`).join('')
  if (relatedMarkup) {
    page = page.replace(/(<section\b[^>]*\bid=["']related-section["'][^>]*)\shidden([^>]*>)/i, '$1$2')
    page = replaceContents(page, 'related-list', relatedMarkup)
  }
  return page
}
