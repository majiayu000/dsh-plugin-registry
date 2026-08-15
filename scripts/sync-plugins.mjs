import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { discoverGitHubRepositories, mapGraphqlRepository, REPOSITORY_DISCOVERY_QUERY } from './github-discovery.mjs'
import { validateBundleManifest } from '../assets/bundle-manifest.js'
import { hasDshCandidateContext } from '../assets/candidate-relevance.js'
import {
  applyGovernance,
  hasBundleManifest,
  mergeRegistryCategories,
  mergePlugins,
  normalizeCurated,
  normalizeDiscovered,
  repoKey,
  repositoryKey,
  toPublicPlugin,
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

async function loadPreviousAudit() {
  try {
    return JSON.parse(await readFile(AUDIT_OUTPUT, 'utf8'))
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

async function githubGraphql(query, variables, options = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchJson(`${GITHUB_API}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (!response.errors?.length) return response.data
    const message = response.errors.map(error => error.message).join('; ')
    if (options.allowPartial && response.data) {
      console.warn(`GitHub GraphQL returned partial data: ${message}`)
      return response.data
    }
    if (attempt === 2) throw new Error(`GitHub GraphQL failed: ${message}`)
    console.warn(`GitHub GraphQL warning; retrying (${attempt + 1}/3): ${message}`)
    await sleep(2_000 * (attempt + 1))
  }
  throw new Error('GitHub GraphQL failed without a response.')
}

async function githubSearchPage({ searchQuery, cursor }) {
  const data = await githubGraphql(REPOSITORY_DISCOVERY_QUERY, { searchQuery, cursor })
  return {
    repositoryCount: data.search.repositoryCount,
    repositories: data.search.nodes.filter(Boolean).map(mapGraphqlRepository),
    pageInfo: data.search.pageInfo,
    rateLimit: data.rateLimit,
  }
}

async function discoverRepositories() {
  if (!TOKEN) {
    console.warn('No GitHub token found; syncing the 100 most recently updated candidates only.')
    const params = new URLSearchParams({ q: 'topic:dsh-plugin', sort: 'updated', order: 'desc', per_page: String(MAX_UNAUTHENTICATED_CANDIDATES) })
    return (await fetchJson(`${GITHUB_API}/search/repositories?${params}`)).items
  }
  console.log('Starting complete GitHub topic discovery with GraphQL pagination.')
  return discoverGitHubRepositories({
    searchPage: githubSearchPage,
    onProgress(progress) {
      const remaining = progress.rateLimit?.remaining ?? '?'
      if (progress.type === 'window') {
        console.log(`Discovery window ${progress.range}: ${progress.totalCount} repositories (depth ${progress.depth}, rate limit ${remaining} remaining).`)
      } else if (progress.type === 'page') {
        console.log(`Discovery page ${progress.page}: ${progress.fetched}/${progress.totalCount} for ${progress.range} (rate limit ${remaining} remaining).`)
      } else {
        console.warn(`Discovery index drift for ${progress.range}: fetched ${progress.fetched}, initially reported ${progress.totalCount}; accepting within tolerance ${progress.allowedDrift}.`)
      }
    },
  })
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
      const data = await githubGraphql(`query { ${fields} }`, {}, { allowPartial: true })
      batch.forEach((repo, index) => manifests.set(repoKey(...repo.full_name.split('/')), data?.[`r${index}`]?.object?.text || ''))
      completed += batch.length
      if (completed === batch.length || completed === repositories.length || completed % 400 < batchSize) {
        console.log(`Manifest validation: ${completed}/${repositories.length}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, () => worker()))
  return manifests
}

async function loadBundlePatches(candidates) {
  if (!TOKEN || candidates.length === 0) return new Map()
  const results = new Map()
  const batchSize = 40
  const batches = []
  for (let offset = 0; offset < candidates.length; offset += batchSize) batches.push(candidates.slice(offset, offset + batchSize))
  let nextBatch = 0

  async function worker() {
    while (nextBatch < batches.length) {
      const batch = batches[nextBatch]
      nextBatch += 1
      const fields = batch.map((candidate, index) => {
        const [owner, name] = candidate.repository.full_name.split('/')
        const expression = `HEAD:${candidate.patch.slice(2)}`
        return `r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { object(expression: ${JSON.stringify(expression)}) { ... on Blob { byteSize } } }`
      }).join('\n')
      const data = await githubGraphql(`query { ${fields} }`, {}, { allowPartial: true })
      batch.forEach((candidate, index) => {
        results.set(candidate.repository.full_name.toLowerCase(), Boolean(data?.[`r${index}`]?.object))
      })
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, () => worker()))
  return results
}

async function main() {
  const [previous, previousAudit] = await Promise.all([loadPrevious(), loadPreviousAudit()])
  const [blocklist, overrides] = await Promise.all([loadConfig(BLOCKLIST), loadConfig(OVERRIDES)])
  const curatedRegistry = await loadCurated(previous)
  const repositories = await discoverRepositories()
  console.log(`Discovery complete: ${repositories.length} topic candidates.`)
  const uniqueRepositories = [...new Map(repositories.map(repo => [repo.full_name.toLowerCase(), repo])).values()]
    .filter(repo => !repo.archived && !repo.fork)

  const curatedKeys = new Set(curatedRegistry.plugins.map(repositoryKey))
  const newCandidates = uniqueRepositories.filter(repo => !curatedKeys.has(repo.full_name.toLowerCase()))
  const repositoryByKey = new Map(uniqueRepositories.map(repo => [repo.full_name.toLowerCase(), repo]))
  const manifestCache = new Map()
  for (const plugin of previous?.plugins || []) {
    manifestCache.set(repositoryKey(plugin), {
      pushedAt: plugin.pushedAt,
      shapeValid: plugin.verification?.manifest === 'shape_validated',
      patchStatus: plugin.verification?.patch,
    })
  }
  for (const plugin of previousAudit?.pendingReview || []) {
    const patchMissing = String(plugin.reason || '').startsWith('dsh.bundle.patch does not resolve')
    manifestCache.set(plugin.id.toLowerCase(), {
      pushedAt: plugin.pushedAt,
      shapeValid: patchMissing,
      patchStatus: patchMissing ? 'missing' : undefined,
    })
  }
  const candidatesToValidate = uniqueRepositories.filter(repo => {
    const cached = manifestCache.get(repo.full_name.toLowerCase())
    return cached?.pushedAt !== repo.pushed_at || (cached.shapeValid && !cached.patchStatus)
  })
  console.log(`Manifest cache: ${uniqueRepositories.length - candidatesToValidate.length} unchanged, ${candidatesToValidate.length} to validate.`)
  const manifests = await loadPackageManifests(candidatesToValidate)
  const bundleCandidates = candidatesToValidate.flatMap(repository => {
    const check = validateBundleManifest(manifests.get(repository.full_name.toLowerCase()))
    return check.valid ? [{ repository, patch: check.patch }] : []
  })
  const bundlePatches = await loadBundlePatches(bundleCandidates)

  const metadata = new Map(uniqueRepositories.map(repo => [repo.full_name.toLowerCase(), {
    stargazerCount: repo.stargazers_count,
    forkCount: repo.forks_count,
    language: repo.language || '',
    license: repo.license || '',
    latestRelease: repo.latest_release ? {
      tag: repo.latest_release.tag || '',
      publishedAt: repo.latest_release.published_at || null,
    } : null,
    pushedAt: repo.pushed_at,
    isArchived: repo.archived,
    repositoryTopics: { nodes: (repo.topics || []).map(name => ({ topic: { name } })) },
    avatarUrl: repo.owner?.avatar_url,
  }]))
  function repositoryVerification(repository) {
    const key = repository.full_name.toLowerCase()
    const cached = manifestCache.get(key)
    const unchanged = cached?.pushedAt === repository.pushed_at && (!cached.shapeValid || cached.patchStatus)
    const manifestShapeValid = unchanged ? cached.shapeValid : hasBundleManifest(manifests.get(key))
    const patchExists = unchanged
      ? (cached.patchStatus === 'exists' ? true : (cached.patchStatus === 'missing' ? false : null))
      : bundlePatches.get(key)
    return { manifestShapeValid, patchExists }
  }

  const curated = curatedRegistry.plugins.map(plugin => {
    const key = repositoryKey(plugin)
    const normalized = normalizeCurated(plugin, metadata.get(key))
    const repository = repositoryByKey.get(key)
    if (!repository) return normalized
    const evidence = repositoryVerification(repository)
    if (!evidence.manifestShapeValid) return normalized
    return {
      ...normalized,
      verification: {
        manifest: 'shape_validated',
        patch: evidence.patchExists === true ? 'exists' : (evidence.patchExists === false ? 'missing' : 'not_checked'),
        installation: 'not_tested',
      },
    }
  })
  const normalizedCandidates = newCandidates
    .map(repo => {
      const evidence = repositoryVerification(repo)
      return normalizeDiscovered(repo, evidence.manifestShapeValid, evidence.patchExists)
    })
  const blocked = new Map((blocklist.repositories || []).map(entry => [String(entry.repo).toLowerCase(), entry]))
  const candidateQuarantined = normalizedCandidates.flatMap(plugin => {
    const block = blocked.get(repoKey(plugin.owner, plugin.name))
    if (block) return [{
      id: plugin.id,
      url: plugin.url,
      trustLevel: 'quarantined',
      reason: block.reason || 'Blocked by registry maintainers',
    }]
    if (!plugin.listingEligible && !hasDshCandidateContext(plugin)) return [{
      id: plugin.id,
      url: plugin.url,
      trustLevel: 'quarantined',
      reason: 'Only the dsh-plugin discovery topic was present; no additional DSH relevance signal was found',
    }]
    return []
  })
  const eligibleCandidates = normalizedCandidates.filter(plugin => {
    return !blocked.has(repoKey(plugin.owner, plugin.name)) && (plugin.listingEligible || hasDshCandidateContext(plugin))
  })
  const discovered = eligibleCandidates.filter(plugin => plugin.listingEligible)
  const pendingReview = eligibleCandidates.filter(plugin => !plugin.listingEligible).map(plugin => ({
    id: plugin.id,
    name: plugin.name,
    owner: plugin.owner,
    url: plugin.url,
    description: plugin.description,
    category: plugin.category,
    trustLevel: 'pending_review',
    reason: plugin.verification.patch === 'missing'
      ? 'dsh.bundle.patch does not resolve to a file at repository HEAD'
      : 'package.json does not declare a valid dsh.bundle object',
    stars: plugin.stars,
    forks: plugin.forks,
    language: plugin.language,
    pushedAt: plugin.pushedAt,
    topics: plugin.topics,
    icon: plugin.icon,
  }))
  const governed = applyGovernance(mergePlugins(curated, discovered), blocklist, overrides)
  const plugins = governed.plugins.map(toPublicPlugin)
  const quarantined = [...new Map([...candidateQuarantined, ...governed.quarantined].map(plugin => [plugin.id.toLowerCase(), plugin])).values()]
  const publishedCurated = plugins.filter(plugin => plugin.source === 'curated').length
  const publishedDiscovered = plugins.filter(plugin => plugin.source === 'discovered').length

  const document = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    categories: mergeRegistryCategories(curatedRegistry.categories),
    stats: {
      topicCandidates: uniqueRepositories.length,
      curated: publishedCurated,
      automaticallyDiscovered: publishedDiscovered,
      patchFilesConfirmed: plugins.filter(plugin => plugin.verification.patch === 'exists').length,
      published: plugins.length,
      manifestRejected: pendingReview.filter(plugin => !String(plugin.reason).startsWith('dsh.bundle.patch')).length,
      patchRejected: pendingReview.filter(plugin => String(plugin.reason).startsWith('dsh.bundle.patch')).length,
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
