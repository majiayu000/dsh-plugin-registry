import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  hasBundleManifest,
  mergePlugins,
  normalizeCurated,
  normalizeDiscovered,
  repoKey,
} from './registry-core.mjs'

const CURATED_URL = 'https://awesome-dsh-plugin.com/plugins.json'
const GITHUB_API = 'https://api.github.com'
const OUTPUT = resolve(process.env.DSH_REGISTRY_OUTPUT || 'public/data/plugins.json')
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
const USER_AGENT = 'harness-registry-sync'
const MAX_UNAUTHENTICATED_CANDIDATES = 100

const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': USER_AGENT,
  'x-github-api-version': '2022-11-28',
  ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
}

function sleep(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms))
}

async function fetchJson(url, options = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
    if (response.ok) return response.json()
    if ((response.status === 403 || response.status === 429) && attempt < 2) {
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000
      const wait = Number.isFinite(reset) ? Math.max(1_000, Math.min(reset - Date.now() + 1_000, 60_000)) : 5_000
      await sleep(wait)
      continue
    }
    throw new Error(`${response.status} ${response.statusText}: ${url}`)
  }
  throw new Error(`Unable to fetch ${url}`)
}

async function loadPrevious() {
  try {
    return JSON.parse(await readFile(OUTPUT, 'utf8'))
  } catch {
    return null
  }
}

async function loadCurated(previous) {
  try {
    return await fetchJson(CURATED_URL, { headers: { accept: 'application/json' } })
  } catch (error) {
    if (previous?.plugins?.length) {
      console.warn(`Curated source unavailable; keeping the previous snapshot: ${error.message}`)
      return {
        updated: previous.generatedAt,
        categories: previous.categories,
        plugins: previous.plugins.filter(plugin => plugin.source === 'curated').map(plugin => ({
          ...plugin,
          description: plugin.description,
          category: plugin.category,
          added: plugin.addedAt,
        })),
      }
    }
    throw error
  }
}

async function githubSearch(query, page = 1) {
  const params = new URLSearchParams({ q: query, sort: 'updated', order: 'desc', per_page: '100', page: String(page) })
  const result = await fetchJson(`${GITHUB_API}/search/repositories?${params}`)
  if (TOKEN) await sleep(2_100)
  return result
}

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

async function discoverWindow(from, to) {
  const query = `topic:dsh-plugin created:${isoDate(from)}..${isoDate(to)}`
  const first = await githubSearch(query, 1)
  if (first.total_count <= 1_000 || isoDate(from) === isoDate(to)) {
    const pages = Math.min(10, Math.ceil(first.total_count / 100))
    const items = [...first.items]
    for (let page = 2; page <= pages; page += 1) items.push(...(await githubSearch(query, page)).items)
    return items
  }

  const midpoint = new Date(Math.floor((from.getTime() + to.getTime()) / 2))
  const nextDay = new Date(midpoint)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  return [
    ...(await discoverWindow(from, midpoint)),
    ...(await discoverWindow(nextDay, to)),
  ]
}

async function discoverRepositories() {
  if (!TOKEN) {
    console.warn('No GitHub token found; syncing the 100 most recently updated candidates only.')
    return (await githubSearch('topic:dsh-plugin')).items.slice(0, MAX_UNAUTHENTICATED_CANDIDATES)
  }
  return discoverWindow(new Date('2008-01-01T00:00:00Z'), new Date())
}

async function loadPackageManifests(repositories) {
  if (!TOKEN || repositories.length === 0) return new Map()
  const manifests = new Map()
  const batchSize = 40

  for (let offset = 0; offset < repositories.length; offset += batchSize) {
    const batch = repositories.slice(offset, offset + batchSize)
    const fields = batch.map((repo, index) => {
      const [owner, name] = repo.full_name.split('/')
      return `r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { object(expression: "HEAD:package.json") { ... on Blob { text } } }`
    }).join('\n')
    const response = await fetchJson(`${GITHUB_API}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: `query { ${fields} }` }),
    })
    if (response.errors?.length) console.warn(`GraphQL manifest batch warning: ${response.errors[0].message}`)
    batch.forEach((repo, index) => manifests.set(repoKey(...repo.full_name.split('/')), response.data?.[`r${index}`]?.object?.text || ''))
  }
  return manifests
}

async function main() {
  const previous = await loadPrevious()
  const curatedRegistry = await loadCurated(previous)
  const repositories = await discoverRepositories()
  const uniqueRepositories = [...new Map(repositories.map(repo => [repo.full_name.toLowerCase(), repo])).values()]
    .filter(repo => !repo.archived && !repo.fork && repo.full_name !== 'deepseek-ai/deepseek-harness')

  const curatedKeys = new Set(curatedRegistry.plugins.map(plugin => repoKey(plugin.owner, plugin.name)))
  const newCandidates = uniqueRepositories.filter(repo => !curatedKeys.has(repo.full_name.toLowerCase()))
  const manifests = await loadPackageManifests(newCandidates)

  const metadata = new Map(uniqueRepositories.map(repo => [repo.full_name.toLowerCase(), {
    stargazerCount: repo.stargazers_count,
    forkCount: repo.forks_count,
    pushedAt: repo.pushed_at,
    isArchived: repo.archived,
    repositoryTopics: { nodes: (repo.topics || []).map(name => ({ topic: { name } })) },
    avatarUrl: repo.owner?.avatar_url,
  }]))
  const curated = curatedRegistry.plugins.map(plugin => normalizeCurated(plugin, metadata.get(repoKey(plugin.owner, plugin.name))))
  const discovered = newCandidates
    .map(repo => normalizeDiscovered(repo, hasBundleManifest(manifests.get(repo.full_name.toLowerCase()))))
    .filter(plugin => plugin.installable)
  const plugins = mergePlugins(curated, discovered)

  const document = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    categories: curatedRegistry.categories,
    stats: {
      topicCandidates: uniqueRepositories.length,
      curated: curated.length,
      automaticallyDiscovered: discovered.length,
      published: plugins.length,
      manifestRejected: newCandidates.length - discovered.length,
      discoveryMode: TOKEN ? 'complete' : 'recent',
    },
    sources: {
      curated: CURATED_URL,
      discovery: 'https://github.com/topics/dsh-plugin',
    },
    plugins,
  }

  await mkdir(dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, `${JSON.stringify(document, null, 2)}\n`)
  console.log(`Registry synced: ${plugins.length} published (${curated.length} curated + ${discovered.length} discovered), ${document.stats.manifestRejected} candidates rejected.`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
