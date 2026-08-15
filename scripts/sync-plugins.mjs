import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  applyGovernance,
  hasBundleManifest,
  mergePlugins,
  normalizeCurated,
  normalizeDiscovered,
  repoKey,
  validateHealth,
} from './registry-core.mjs'
import { validateRegistry } from './validate-registry.mjs'

const CURATED_URL = 'https://awesome-dsh-plugin.com/plugins.json'
const GITHUB_API = 'https://api.github.com'
const OUTPUT = resolve(process.env.DSH_REGISTRY_OUTPUT || 'public/data/plugins.json')
const AUDIT_OUTPUT = resolve(process.env.DSH_REGISTRY_AUDIT_OUTPUT || 'public/data/registry-audit.json')
const BLOCKLIST = resolve('sources/blocklist.json')
const OVERRIDES = resolve('sources/overrides.json')
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
    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers },
        signal: options.signal || AbortSignal.timeout(30_000),
      })
      if (response.ok) return response.json()
      if ((response.status === 403 || response.status === 429) && attempt < 2) {
        const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000
        const wait = Number.isFinite(reset) ? Math.max(1_000, Math.min(reset - Date.now() + 1_000, 60_000)) : 5_000
        await sleep(wait)
        continue
      }
      throw new Error(`${response.status} ${response.statusText}: ${url}`)
    } catch (error) {
      if (attempt === 2) throw error
      console.warn(`GitHub request failed; retrying (${attempt + 1}/3): ${error.message}`)
      await sleep(2_000 * (attempt + 1))
    }
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

async function loadConfig(path) {
  return JSON.parse(await readFile(path, 'utf8'))
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
  const batches = []
  for (let offset = 0; offset < repositories.length; offset += batchSize) batches.push(repositories.slice(offset, offset + batchSize))
  let nextBatch = 0
  let completed = 0

  async function worker() {
    while (nextBatch < batches.length) {
      const batch = batches[nextBatch]
      nextBatch += 1
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
      completed += batch.length
      if (completed === batch.length || completed === repositories.length || completed % 400 < batchSize) {
        console.log(`Manifest validation: ${completed}/${repositories.length}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, () => worker()))
  return manifests
}

async function main() {
  const previous = await loadPrevious()
  const [blocklist, overrides] = await Promise.all([loadConfig(BLOCKLIST), loadConfig(OVERRIDES)])
  const curatedRegistry = await loadCurated(previous)
  const repositories = await discoverRepositories()
  console.log(`Discovery complete: ${repositories.length} topic candidates.`)
  const uniqueRepositories = [...new Map(repositories.map(repo => [repo.full_name.toLowerCase(), repo])).values()]
    .filter(repo => !repo.archived && !repo.fork)

  const curatedKeys = new Set(curatedRegistry.plugins.map(plugin => repoKey(plugin.owner, plugin.name)))
  const newCandidates = uniqueRepositories.filter(repo => !curatedKeys.has(repo.full_name.toLowerCase()))
  const previousVerified = new Map((previous?.plugins || [])
    .filter(plugin => plugin.trustLevel === 'manifest_verified' || plugin.source === 'discovered')
    .map(plugin => [plugin.id.toLowerCase(), plugin]))
  const unchangedVerified = new Set(newCandidates
    .filter(repo => previousVerified.get(repo.full_name.toLowerCase())?.pushedAt === repo.pushed_at)
    .map(repo => repo.full_name.toLowerCase()))
  const manifests = await loadPackageManifests(newCandidates.filter(repo => !unchangedVerified.has(repo.full_name.toLowerCase())))

  const metadata = new Map(uniqueRepositories.map(repo => [repo.full_name.toLowerCase(), {
    stargazerCount: repo.stargazers_count,
    forkCount: repo.forks_count,
    language: repo.language || '',
    pushedAt: repo.pushed_at,
    isArchived: repo.archived,
    repositoryTopics: { nodes: (repo.topics || []).map(name => ({ topic: { name } })) },
    avatarUrl: repo.owner?.avatar_url,
  }]))
  const curated = curatedRegistry.plugins.map(plugin => normalizeCurated(plugin, metadata.get(repoKey(plugin.owner, plugin.name))))
  const normalizedCandidates = newCandidates
    .map(repo => normalizeDiscovered(repo, unchangedVerified.has(repo.full_name.toLowerCase()) || hasBundleManifest(manifests.get(repo.full_name.toLowerCase()))))
  const blocked = new Map((blocklist.repositories || []).map(entry => [String(entry.repo).toLowerCase(), entry]))
  const candidateQuarantined = normalizedCandidates.filter(plugin => blocked.has(repoKey(plugin.owner, plugin.name))).map(plugin => ({
    id: plugin.id,
    url: plugin.url,
    trustLevel: 'quarantined',
    reason: blocked.get(repoKey(plugin.owner, plugin.name)).reason || 'Blocked by registry maintainers',
  }))
  const eligibleCandidates = normalizedCandidates.filter(plugin => !blocked.has(repoKey(plugin.owner, plugin.name)))
  const discovered = eligibleCandidates.filter(plugin => plugin.installable)
  const pendingReview = eligibleCandidates.filter(plugin => !plugin.installable).map(plugin => ({
    id: plugin.id,
    url: plugin.url,
    trustLevel: 'pending_review',
    reason: 'package.json does not declare a valid dsh.bundle object',
    stars: plugin.stars,
  }))
  const governed = applyGovernance(mergePlugins(curated, discovered), blocklist, overrides)
  const plugins = governed.plugins
  const quarantined = [...new Map([...candidateQuarantined, ...governed.quarantined].map(plugin => [plugin.id.toLowerCase(), plugin])).values()]
  const publishedCurated = plugins.filter(plugin => plugin.source === 'curated').length
  const publishedDiscovered = plugins.filter(plugin => plugin.source === 'discovered').length

  const document = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    categories: curatedRegistry.categories,
    stats: {
      topicCandidates: uniqueRepositories.length,
      curated: publishedCurated,
      automaticallyDiscovered: publishedDiscovered,
      published: plugins.length,
      manifestRejected: pendingReview.length,
      pendingReview: pendingReview.length,
      quarantined: quarantined.length,
      discoveryMode: TOKEN ? 'complete' : 'recent',
    },
    sources: {
      curated: CURATED_URL,
      discovery: 'https://github.com/topics/dsh-plugin',
    },
    plugins,
  }

  const contract = validateRegistry(document)
  if (contract.errors.length) throw new Error(`Registry contract failed:\n- ${contract.errors.join('\n- ')}`)
  const healthErrors = validateHealth(document, previous)
  if (healthErrors.length) throw new Error(`Registry health gate blocked this snapshot:\n- ${healthErrors.join('\n- ')}\nSet DSH_SYNC_ALLOW_UNSAFE=1 only for an intentional reset.`)

  const audit = {
    schemaVersion: 1,
    generatedAt: document.generatedAt,
    stats: {
      pendingReview: pendingReview.length,
      quarantined: quarantined.length,
    },
    pendingReview,
    quarantined,
  }

  await mkdir(dirname(OUTPUT), { recursive: true })
  await mkdir(dirname(AUDIT_OUTPUT), { recursive: true })
  await writeFile(OUTPUT, `${JSON.stringify(document, null, 2)}\n`)
  await writeFile(AUDIT_OUTPUT, `${JSON.stringify(audit, null, 2)}\n`)
  console.log(`Registry synced: ${plugins.length} published (${publishedCurated} curated + ${publishedDiscovered} manifest verified), ${pendingReview.length} pending review, ${quarantined.length} quarantined, ${contract.warnings.length} description warnings.`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
