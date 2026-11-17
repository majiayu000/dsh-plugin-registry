// Query-only search artifact for #106 (local workerd measurement only).
// Writes .generated/query-only/: a query document bundled into the Worker, and
// static assets (display cards and install-detail shards) under one content
// version. Nothing here is wired into the production Pages build.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildSearchDocument } from '../shared/build-search-index.mjs'
import { searchCardShardFilename } from '../in-memory/card-shard.js'
import { pluginShardFilename } from '../../assets/plugin-route.js'
import { partitionListing } from '../../assets/listing-quality.js'

export const LISTINGS = ['standard', 'low_signal', 'all']

// Same counts the browser computes in renderSummary()/populateFacets().
function listingFacets(plugins) {
  const categories = {}
  const languages = {}
  let stars = 0, manifestVerified = 0
  const authors = new Set()
  for (const plugin of plugins) {
    categories[plugin.category] = (categories[plugin.category] || 0) + 1
    if (plugin.language) languages[plugin.language] = (languages[plugin.language] || 0) + 1
    stars += plugin.stars || 0
    if (plugin.verification?.manifest === 'shape_validated') manifestVerified++
    authors.add(plugin.owner)
  }
  return { summary: { count: plugins.length, stars, authors: authors.size, manifestVerified }, categories, languages }
}

// ASCII-only JSON keeps the bundled module a one-byte V8 string.
export function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'))
}

/** Pure artifact construction; returns file contents keyed by relative path. */
export function buildQueryArtifact(registry, audit, { homepage = 'https://plugin.dshdesk.com/' } = {}) {
  const { index, cards } = buildSearchDocument(registry, audit)
  const { standard, lowSignal } = partitionListing(registry.plugins)
  const listings = {
    standard: listingFacets(standard), low_signal: listingFacets(lowSignal), all: listingFacets(registry.plugins),
  }

  const cardShards = new Map()
  for (const [id, card] of Object.entries(cards)) {
    const shard = searchCardShardFilename(id)
    if (!cardShards.has(shard)) cardShards.set(shard, {})
    cardShards.get(shard)[id] = card
  }
  const detailShards = new Map(Array.from({ length: 256 }, (_, i) => [i.toString(16).padStart(2, '0'), {}]))
  for (const plugin of registry.plugins) {
    detailShards.get(pluginShardFilename(plugin.id))[plugin.id.toLowerCase()] = {
      schemaVersion: 1, generatedAt: registry.generatedAt ?? null, categories: registry.categories || {}, plugin, related: [],
    }
  }

  // One content version over everything a result page can read: the query
  // document, every card and every install-detail record.
  const hash = createHash('sha256')
  hash.update(JSON.stringify(index))
  for (const shard of [...cardShards.keys()].sort()) hash.update(shard).update(JSON.stringify(cardShards.get(shard)))
  for (const shard of [...detailShards.keys()].sort()) hash.update(shard).update(JSON.stringify(detailShards.get(shard)))
  const version = hash.digest('hex').slice(0, 20)
  const cardsPath = `data/search-cards/${version}/`

  const build = {
    version, generatedAt: registry.generatedAt, rankingAt: index.rankingAt, cards: cardsPath,
    categories: registry.categories || {}, listings,
  }
  const files = new Map()
  files.set('query-document.txt', asciiJson({ build, index }))
  for (const [shard, plugins] of cardShards) files.set(`public/${cardsPath}${shard}.json`, JSON.stringify({ version, plugins }))
  for (const [shard, documents] of detailShards) files.set(`public/data/plugin-shards/${shard}.json`, JSON.stringify({ homepage, version, documents }))
  // Detail route caches by this version; publish it with the same content version.
  files.set('public/data/detail-build.json', JSON.stringify({ version }))
  return { version, build, index, cards, files }
}

async function main() {
  const root = resolve(import.meta.dirname, '../..')
  const out = resolve(root, process.argv[2] || '.generated/query-only')
  if (!out.startsWith(join(root, '.generated'))) throw new Error('Output must stay inside .generated/')
  const [registry, audit, pkg] = await Promise.all(['public/data/plugins.json', 'public/data/registry-audit.json', 'package.json']
    .map(path => readFile(join(root, path), 'utf8').then(JSON.parse)))
  const started = performance.now()
  const { version, files, index } = buildQueryArtifact(registry, audit, { homepage: pkg.homepage })
  await rm(out, { recursive: true, force: true })
  let bytes = 0, publicFiles = 0
  for (const [path, contents] of files) {
    const target = join(out, path)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, contents)
    if (path.startsWith('public/')) { bytes += Buffer.byteLength(contents); publicFiles++ }
  }
  console.log(JSON.stringify({
    version, generatedAt: registry.generatedAt, rankingAt: new Date(index.rankingAt).toISOString(),
    entries: index.entries.length, published: registry.plugins.length, pendingCandidates: index.entries.length - registry.plugins.length,
    queryDocumentBytes: Buffer.byteLength(files.get('query-document.txt')), publicFiles, publicBytes: bytes,
    buildMs: Math.round(performance.now() - started),
  }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exitCode = 1 })
}
