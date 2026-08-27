import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  buildRepositoryMetadataQuery,
  discoverGitHubRepositories,
  mapGraphqlRepository,
  mapGraphqlRepositoryMetadataBatch,
  mapRestRepository,
  REPOSITORY_DISCOVERY_QUERY,
  REPOSITORY_METADATA_BATCH_SIZE,
} from './github-discovery.mjs'
import { listBundleDirectories, validateBundleManifest } from '../assets/bundle-manifest.js'
import { validateBundlePatch } from '../assets/bundle-patch.js'
import { hasDshCandidateContext } from '../assets/candidate-relevance.js'
import {
  applyGovernance,
  bundleDirectoryFromUrl,
  hasPublishableGithubIdentity,
  mergeRegistryCategories,
  mergePlugins,
  normalizeCurated,
  normalizeDiscovered,
  repoKey,
  repositoryKey,
  toPublicPlugin,
  validateHealth,
  verificationCacheKey,
} from './registry-core.mjs'
import { validateRegistry } from './validate-registry.mjs'

const CURATED_SOURCE = resolve('sources/curated.json')
const GITHUB_API = 'https://api.github.com'
const OUTPUT = resolve(process.env.DSH_REGISTRY_OUTPUT || 'public/data/plugins.json')
const AUDIT_OUTPUT = resolve(process.env.DSH_REGISTRY_AUDIT_OUTPUT || 'public/data/registry-audit.json')
const VERSION_OUTPUT = resolve(process.env.DSH_REGISTRY_VERSION_OUTPUT || 'public/data/version.json')
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

export async function fetchJson(url, options = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers },
        signal: options.signal || AbortSignal.timeout(30_000),
      })
      if (response.ok) return await response.json()
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

export async function loadPrevious() {
  try {
    return JSON.parse(await readFile(OUTPUT, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    // 损坏的上次快照不能静默当作"没有基线"：那会绕过 health gate 覆盖发布数据。
    throw new Error(`Previous registry snapshot at ${OUTPUT} is unreadable; refusing to sync without a health baseline: ${error.message}`)
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

async function loadCurated() {
  const curated = JSON.parse(await readFile(CURATED_SOURCE, 'utf8'))
  if (!Array.isArray(curated.plugins)) {
    throw new Error(`Vendored curated source must provide a plugins array: ${CURATED_SOURCE}`)
  }
  return curated
}

const graphqlRequests = { total: 0, partial: 0 }

async function githubGraphql(query, variables, options = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchJson(`${GITHUB_API}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (!response.errors?.length) {
      graphqlRequests.total += 1
      return response.data
    }
    const message = response.errors.map(error => error.message).join('; ')
    if (options.allowPartial && response.data) {
      graphqlRequests.total += 1
      graphqlRequests.partial += 1
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

async function loadCuratedRepositoryMetadata(repositoryKeys) {
  if (!TOKEN || repositoryKeys.length === 0) return new Map()

  const batches = []
  for (let offset = 0; offset < repositoryKeys.length; offset += REPOSITORY_METADATA_BATCH_SIZE) {
    batches.push(repositoryKeys.slice(offset, offset + REPOSITORY_METADATA_BATCH_SIZE))
  }
  const metadata = new Map()
  let nextBatch = 0

  async function worker() {
    while (nextBatch < batches.length) {
      const batch = batches[nextBatch]
      nextBatch += 1
      try {
        const data = await githubGraphql(buildRepositoryMetadataQuery(batch), {}, { allowPartial: true })
        for (const [key, value] of mapGraphqlRepositoryMetadataBatch(data, batch)) metadata.set(key, value)
      } catch (error) {
        console.warn(`Curated repository metadata unavailable for batch; keeping curated fallbacks: ${error.message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, () => worker()))
  return metadata
}

async function discoverRepositories() {
  if (!TOKEN) {
    console.warn('No GitHub token found; syncing the 100 most recently updated candidates only.')
    const params = new URLSearchParams({ q: 'topic:dsh-plugin', sort: 'updated', order: 'desc', per_page: String(MAX_UNAUTHENTICATED_CANDIDATES) })
    return (await fetchJson(`${GITHUB_API}/search/repositories?${params}`)).items.map(mapRestRepository)
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
      } else if (progress.type === 'resplit') {
        console.warn(`Discovery window ${progress.range} returned ${progress.fetched}/${progress.totalCount} unique repositories; splitting further.`)
      } else if (progress.type === 'error-split') {
        console.warn(`Discovery window ${progress.range} failed with ${progress.error}; splitting further (${progress.remainingErrorSplits} recovery splits left).`)
      } else {
        console.warn(`Discovery index drift for ${progress.range}: fetched ${progress.fetched}, initially reported ${progress.totalCount}; accepting within tolerance ${progress.allowedDrift}.`)
      }
    },
  })
}

function githubFullName(plugin) {
  const match = String(plugin?.url || '').match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+)/)
  return match ? `${match[1]}/${match[2]}` : String(plugin?.id || '').split('#')[0]
}

function targetKey(fullName, directory = '') {
  return verificationCacheKey(fullName, directory)
}

function packageExpression(directory = '') {
  return directory ? `HEAD:${directory}/package.json` : 'HEAD:package.json'
}

function patchExpression(patch, directory = '') {
  const file = String(patch || '').replace(/^\.\//, '')
  return directory ? `HEAD:${directory}/${file}` : `HEAD:${file}`
}

async function loadPackageManifests(targets) {
  if (!TOKEN || targets.length === 0) return { manifests: new Map(), headCommits: new Map() }
  const manifests = new Map()
  const headCommits = new Map()
  const batchSize = 40
  const batches = []
  for (let offset = 0; offset < targets.length; offset += batchSize) batches.push(targets.slice(offset, offset + batchSize))
  let nextBatch = 0
  let completed = 0

  async function worker() {
    while (nextBatch < batches.length) {
      const batch = batches[nextBatch]
      nextBatch += 1
      const fields = batch.map((target, index) => {
        const [owner, name] = target.full_name.split('/')
        return `r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { object(expression: ${JSON.stringify(packageExpression(target.directory))}) { ... on Blob { text } } defaultBranchRef { target { ... on Commit { oid } } } }`
      }).join('\n')
      const data = await githubGraphql(`query { ${fields} }`, {}, { allowPartial: true })
      batch.forEach((target, index) => {
        const key = targetKey(target.full_name, target.directory)
        manifests.set(key, data?.[`r${index}`]?.object?.text || '')
        const oid = data?.[`r${index}`]?.defaultBranchRef?.target?.oid
        if (typeof oid === 'string' && /^[0-9a-f]{40}$/.test(oid)) headCommits.set(key, oid)
      })
      completed += batch.length
      if (completed === batch.length || completed === targets.length || completed % 400 < batchSize) {
        console.log(`Manifest validation: ${completed}/${targets.length}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, () => worker()))
  return { manifests, headCommits }
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
        const [owner, name] = candidate.full_name.split('/')
        return `r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { object(expression: ${JSON.stringify(patchExpression(candidate.patch, candidate.directory))}) { ... on Blob { text } } }`
      }).join('\n')
      const data = await githubGraphql(`query { ${fields} }`, {}, { allowPartial: true })
      batch.forEach((candidate, index) => {
        const text = data?.[`r${index}`]?.object?.text
        if (typeof text !== 'string') {
          results.set(candidate.key, false)
          return
        }
        const check = validateBundlePatch(text)
        results.set(candidate.key, check.valid ? true : 'invalid')
      })
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, () => worker()))
  return results
}

async function main() {
  const [previous, previousAudit] = await Promise.all([loadPrevious(), loadPreviousAudit()])
  const [blocklist, overrides] = await Promise.all([loadConfig(BLOCKLIST), loadConfig(OVERRIDES)])
  const curatedRegistry = await loadCurated()
  const repositories = await discoverRepositories()
  console.log(`Discovery complete: ${repositories.length} topic candidates.`)
  const uniqueRepositories = [...new Map(repositories.map(repo => [repo.full_name.toLowerCase(), repo])).values()]
    .filter(repo => !repo.archived && !repo.fork)

  const curatedKeys = new Set(curatedRegistry.plugins.map(repositoryKey))
  const newCandidates = uniqueRepositories.filter(repo => !curatedKeys.has(repo.full_name.toLowerCase()))
  const repositoryByKey = new Map(uniqueRepositories.map(repo => [repo.full_name.toLowerCase(), repo]))
  const curatedRepositoryKeys = [...new Set(curatedRegistry.plugins.map(repositoryKey))]
  const missingCuratedRepositoryKeys = curatedRepositoryKeys.filter(key => !repositoryByKey.has(key))
  const curatedRepositoryMetadata = await loadCuratedRepositoryMetadata(missingCuratedRepositoryKeys)
  if (missingCuratedRepositoryKeys.length > 0) {
    console.log(`Curated metadata: ${curatedRepositoryMetadata.size}/${missingCuratedRepositoryKeys.length} repository roots resolved.`)
  }
  const metadata = new Map([
    ...uniqueRepositories.map(repo => [repo.full_name.toLowerCase(), {
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
    }]),
    ...curatedRepositoryMetadata,
  ])
  const manifestCache = new Map()
  for (const plugin of previous?.plugins || []) {
    const cached = {
      pushedAt: plugin.pushedAt,
      shapeValid: plugin.verification?.manifest === 'shape_validated',
      patchStatus: plugin.verification?.patch,
      verifiedCommit: typeof plugin.verifiedCommit === 'string' ? plugin.verifiedCommit : undefined,
      profile: plugin.profile,
      packageName: plugin.packageName,
    }
    manifestCache.set(String(plugin.id).toLowerCase(), cached)
    manifestCache.set(verificationCacheKey(repositoryKey(plugin), bundleDirectoryFromUrl(plugin.url)), cached)
  }
  for (const plugin of previousAudit?.pendingReview || []) {
    const patchMissing = String(plugin.reason || '').startsWith('dsh.bundle.patch does not resolve')
    const patchInvalid = String(plugin.reason || '').startsWith('dsh.bundle.patch is not a valid')
    manifestCache.set(String(plugin.id).toLowerCase(), {
      pushedAt: plugin.pushedAt,
      shapeValid: patchMissing || patchInvalid,
      patchStatus: patchMissing ? 'missing' : (patchInvalid ? 'invalid' : undefined),
    })
  }

  function pushedAtFor(fullName) {
    return metadata.get(String(fullName).toLowerCase())?.pushedAt
      || repositoryByKey.get(String(fullName).toLowerCase())?.pushed_at
      || null
  }

  const rootTargets = uniqueRepositories.map(repo => ({ full_name: repo.full_name, directory: '' }))
  const curatedTargets = curatedRegistry.plugins.map(plugin => ({
    full_name: githubFullName(plugin),
    directory: bundleDirectoryFromUrl(plugin.url),
    id: plugin.id,
  }))
  const initialTargets = [...new Map([...rootTargets, ...curatedTargets].map(target => [targetKey(target.full_name, target.directory), target])).values()]
  const targetsToValidate = initialTargets.filter(target => {
    const cached = manifestCache.get(target.id?.toLowerCase()) || manifestCache.get(targetKey(target.full_name, target.directory))
    const pushedAt = pushedAtFor(target.full_name)
    return cached?.pushedAt !== pushedAt || (cached.shapeValid && !cached.patchStatus)
  })
  console.log(`Manifest cache: ${initialTargets.length - targetsToValidate.length} unchanged, ${targetsToValidate.length} to validate.`)
  const { manifests, headCommits } = await loadPackageManifests(targetsToValidate)

  const extraTargets = []
  for (const repo of uniqueRepositories) {
    const rootText = manifests.get(targetKey(repo.full_name, ''))
    if (!rootText) continue
    for (const directory of listBundleDirectories(rootText)) {
      const key = targetKey(repo.full_name, directory)
      if (manifests.has(key) || extraTargets.some(target => targetKey(target.full_name, target.directory) === key)) continue
      extraTargets.push({ full_name: repo.full_name, directory })
    }
  }
  if (extraTargets.length) {
    const extra = await loadPackageManifests(extraTargets)
    for (const [key, value] of extra.manifests) manifests.set(key, value)
    for (const [key, value] of extra.headCommits) headCommits.set(key, value)
  }

  const allTargets = [...initialTargets, ...extraTargets]
  const fetchedKeys = new Set([...manifests.keys()])
  const bundleCandidates = allTargets.flatMap(target => {
    const key = targetKey(target.full_name, target.directory)
    if (!fetchedKeys.has(key)) return []
    const check = validateBundleManifest(manifests.get(key))
    return check.valid ? [{ ...target, key, patch: check.patch, packageName: check.packageName, profile: check.profile }] : []
  })
  const bundlePatches = await loadBundlePatches(bundleCandidates)
  const bundleMeta = new Map(bundleCandidates.map(candidate => [candidate.key, candidate]))

  const partialRatio = graphqlRequests.total ? graphqlRequests.partial / graphqlRequests.total : 0
  const maxPartialRatio = Number(process.env.DSH_MAX_PARTIAL_RATIO ?? 0.05)
  if (partialRatio > maxPartialRatio) {
    throw new Error(`GitHub GraphQL returned partial data for ${graphqlRequests.partial}/${graphqlRequests.total} requests (limit ${maxPartialRatio}); refusing to publish a partially validated snapshot.`)
  }

  function targetVerification(fullName, directory = '', id = '') {
    const key = targetKey(fullName, directory)
    const cached = manifestCache.get(String(id).toLowerCase()) || manifestCache.get(key)
    const pushedAt = pushedAtFor(fullName)
    const fetched = fetchedKeys.has(key)
    const unchanged = !fetched && cached && cached.pushedAt === pushedAt && (!cached.shapeValid || cached.patchStatus)
    if (unchanged) {
      return {
        checked: true,
        manifestShapeValid: cached.shapeValid,
        patchExists: cached.patchStatus === 'exists' ? true : (cached.patchStatus === 'missing' ? false : (cached.patchStatus === 'invalid' ? 'invalid' : null)),
        verifiedCommit: cached.verifiedCommit,
        profile: cached.profile,
        packageName: cached.packageName,
      }
    }
    if (!fetched) {
      return { checked: false, manifestShapeValid: false, patchExists: null, verifiedCommit: cached?.verifiedCommit }
    }
    const check = validateBundleManifest(manifests.get(key))
    const meta = bundleMeta.get(key)
    return {
      checked: true,
      manifestShapeValid: check.valid,
      patchExists: check.valid ? (bundlePatches.has(key) ? bundlePatches.get(key) : null) : null,
      verifiedCommit: headCommits.get(key),
      profile: check.profile || meta?.profile,
      packageName: check.packageName || meta?.packageName,
    }
  }

  const curated = curatedRegistry.plugins.map(plugin => {
    const key = repositoryKey(plugin)
    const directory = bundleDirectoryFromUrl(plugin.url)
    const evidence = TOKEN
      ? targetVerification(githubFullName(plugin), directory, plugin.id)
      : { checked: false }
    return normalizeCurated(plugin, metadata.get(key), evidence)
  })
  const discoveredRoots = newCandidates.flatMap(repo => {
    const evidence = targetVerification(repo.full_name, '', repo.full_name)
    const root = normalizeDiscovered(repo, evidence.manifestShapeValid, evidence.patchExists, evidence.verifiedCommit, {
      profile: evidence.profile,
      packageName: evidence.packageName,
    })
    const extras = extraTargets
      .filter(target => target.full_name.toLowerCase() === repo.full_name.toLowerCase())
      .map(target => {
        const extra = targetVerification(target.full_name, target.directory, `${target.full_name}#${target.directory}`)
        return normalizeDiscovered(repo, extra.manifestShapeValid, extra.patchExists, extra.verifiedCommit, {
          directory: target.directory,
          profile: extra.profile,
          packageName: extra.packageName,
          url: repo.html_url,
        })
      })
    return [root, ...extras]
  })
  const normalizedCandidates = discoveredRoots
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
  function pendingReason(plugin) {
    if (plugin.verification.patch === 'missing') return 'dsh.bundle.patch does not resolve to a file at repository HEAD'
    if (plugin.verification.patch === 'invalid') return 'dsh.bundle.patch is not a top-level YAML array'
    return 'package.json does not declare a valid dsh.bundle object'
  }
  const pendingReview = [
    ...eligibleCandidates.filter(plugin => !plugin.listingEligible),
    ...curated.filter(plugin => !plugin.listingEligible),
  ].map(plugin => ({
    id: plugin.id,
    name: plugin.name,
    owner: plugin.owner,
    url: plugin.url,
    description: plugin.description,
    category: plugin.category,
    trustLevel: 'pending_review',
    reason: pendingReason(plugin),
    stars: plugin.stars,
    forks: plugin.forks,
    language: plugin.language,
    pushedAt: plugin.pushedAt,
    topics: plugin.topics,
    icon: plugin.icon,
  }))
  const unpublishable = [...curated, ...discovered].filter(plugin => (
    plugin.listingEligible && !plugin.archived && !hasPublishableGithubIdentity(plugin)
  ))
  if (unpublishable.length) {
    console.warn(`Skipping ${unpublishable.length} installable plugins with an unpublishable GitHub identity: ${unpublishable.map(plugin => plugin.id || plugin.url || '(missing)').join(', ')}`)
  }
  const governed = applyGovernance(mergePlugins(curated, discovered), blocklist, overrides)
  const plugins = governed.plugins.map(toPublicPlugin)
  const quarantined = [...new Map([...candidateQuarantined, ...governed.quarantined].map(plugin => [plugin.id.toLowerCase(), plugin])).values()]
  const publishedCurated = plugins.filter(plugin => plugin.source === 'curated').length
  const publishedDiscovered = plugins.filter(plugin => plugin.source === 'discovered').length
  const blockedRepos = new Map((blocklist.repositories || []).map(entry => [String(entry.repo).toLowerCase(), entry]))
  const curatedSource = curatedRegistry.plugins.filter(plugin => !blockedRepos.has(repositoryKey(plugin))).length

  const document = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    categories: mergeRegistryCategories(curatedRegistry.categories),
    stats: {
      topicCandidates: uniqueRepositories.length,
      curated: publishedCurated,
      curatedSource,
      automaticallyDiscovered: publishedDiscovered,
      patchFilesConfirmed: plugins.filter(plugin => plugin.verification.patch === 'exists').length,
      published: plugins.length,
      manifestRejected: pendingReview.filter(plugin => !String(plugin.reason).startsWith('dsh.bundle.patch')).length,
      patchRejected: pendingReview.filter(plugin => String(plugin.reason).startsWith('dsh.bundle.patch')).length,
      pendingReview: pendingReview.length,
      quarantined: quarantined.length,
      discoveryMode: TOKEN ? 'complete' : 'recent',
      ...(process.env.DSH_SYNC_ALLOW_UNSAFE === '1' ? { healthGateOverridden: true } : {}),
    },
    sources: {
      curated: 'sources/curated.json',
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
  // 极小的版本戳：浏览器用它做新鲜度门控，避免每次导航都重新拉取并解析整份快照。
  await writeFile(VERSION_OUTPUT, `${JSON.stringify({ schemaVersion: 1, generatedAt: document.generatedAt })}\n`)
  console.log(`Registry synced: ${plugins.length} published (${publishedCurated} curated + ${publishedDiscovered} manifest verified), ${pendingReview.length} pending review, ${quarantined.length} quarantined, ${contract.warnings.length} description warnings.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
