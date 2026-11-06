import { readFile, writeFile, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import semver from 'semver'
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'
import { parseInstallCommand, githubSpecIsPinned } from '../assets/install-command.js'
import { validateBundleManifest } from '../assets/bundle-manifest.js'
import { bundleDirectoryFromUrl, parseGithubRepositoryUrl } from './registry-core.mjs'

const INDEX_URL = 'https://plugin.dshdesk.com/data/plugin-index.json'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value)

/* dshRange adapted from DeepSeek Harness dsh-v0.2.1-rc.5:
 * https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/apps/plugin-market-generator/src/packages.ts
 * MIT License — Copyright (c) 2026 DeepSeek
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
export function dshRange(manifest) {
  const declared = isObject(manifest.engines) ? manifest.engines.dsh : undefined
  const current = new Set(['workspace:*', 'workspace:^', 'workspace:~'])
  const ranges = typeof declared === 'string' ? [declared]
    : Object.entries(isObject(manifest.peerDependencies) ? manifest.peerDependencies : {})
      .flatMap(([name, range]) => /^@deepseek-ai\/dsh(?:-|$)/u.test(name) && typeof range === 'string' && !current.has(range) ? [range] : [])
  const used = [...new Set(ranges.map(range => range.trim()))].filter(range => range !== '*')
  if (used.length === 0) return undefined
  let combinations = [[]]
  for (const range of used) {
    if (range === '' || range.startsWith('workspace:') || semver.validRange(range) === null) {
      return new Error(`DSH range ${JSON.stringify(range)} is not a valid SemVer range`)
    }
    const alternatives = new semver.Range(range, { includePrerelease: true }).set
      .map(set => set.map(comparator => comparator.value).filter(Boolean))
    if (combinations.length * alternatives.length > 256) return new Error('DSH peer ranges combine into more than 256 alternatives')
    combinations = combinations.flatMap(prefix => alternatives.map(alternative => [...new Set([...prefix, ...alternative])]))
      .filter(combination => semver.minVersion(new semver.Range(combination.join(' ') || '*', { includePrerelease: true })) !== null)
  }
  if (combinations.length === 0) return new Error(`no DSH version satisfies every DSH peer range: ${used.join(', ')}`)
  const written = [...new Set(combinations.map(combination => combination.join(' ') || '*'))]
  if (written.includes('*')) return undefined
  return used.length === 1 ? used[0] : written.join(' || ')
}

function candidateOf(plugin) {
  if (plugin.verification?.manifest !== 'shape_validated' || plugin.verification?.patch !== 'exists') return { reason: 'not_verified' }
  const install = parseInstallCommand(plugin.install)
  if (plugin.profile !== 'web' || install?.profile !== 'web') return { reason: 'not_web' }
  if (!install.spec.startsWith('github:')) return { reason: 'not_github' }
  if (!githubSpecIsPinned(install.spec, plugin.verifiedCommit)) return { reason: 'not_pinned' }
  const repo = parseGithubRepositoryUrl(plugin.url)
  const fullName = install.spec.slice('github:'.length).split('#')[0]
  if (!repo || `${repo.owner}/${repo.repository}`.toLowerCase() !== fullName.toLowerCase()) return { reason: 'repository_mismatch' }
  const directory = bundleDirectoryFromUrl(plugin.url)
  // A qualified id only identifies a basename; it cannot recover a lost monorepo path.
  if (String(plugin.id).includes('#') && !directory) return { reason: 'directory_unknown' }
  if (directory && directory.split('/').some(part => part === '.' || part === '..' || !/^[A-Za-z0-9._@+-]+$/.test(part))) return { reason: 'directory_invalid' }
  if (typeof plugin.packageName !== 'string' || !plugin.packageName.trim()) return { reason: 'package_name_missing' }
  return { plugin, fullName, directory, commit: plugin.verifiedCommit, url: `https://github.com/${repo.owner}/${repo.repository}` }
}

function sourceKey(source) {
  return `${source.url.toLowerCase()}\n${source.path || ''}\n${source.commit}`
}

function snapshotOrigin(plugin) {
  const repo = parseGithubRepositoryUrl(plugin.url)
  if (!repo) return undefined
  const directory = bundleDirectoryFromUrl(plugin.url)
  if (String(plugin.id).includes('#') && !directory) return undefined
  return `https://github.com/${repo.owner}/${repo.repository}`.toLowerCase() + `\n${directory}`
}

function withDisplay(entry, plugin) {
  // Empty translations are normal in the website snapshot; omit them, but let
  // the official parser surface malformed non-empty display values globally.
  const description = isObject(plugin.description)
    ? Object.fromEntries(Object.entries(plugin.description).filter(([, value]) => typeof value !== 'string' || value.trim()))
    : plugin.description
  const hasDescription = isObject(description) ? Object.keys(description).length > 0 : Boolean(description)
  return {
    ...entry,
    ...(plugin.name ? { title: plugin.name } : {}),
    ...(hasDescription ? { description } : {}),
    ...(plugin.owner ? { author: plugin.owner } : {}),
    ...(plugin.icon ? { icon: plugin.icon } : {}),
    metadata: { ...(plugin.category ? { category: plugin.category } : {}) },
  }
}

function previousEntries(previous) {
  const entries = new Map()
  if (!previous) return entries
  for (const plugin of parseMarketIndex(previous, INDEX_URL).plugins) {
    for (const version of plugin.versions) {
      if (version.source.type === 'git') entries.set(sourceKey(version.source), {
        name: plugin.name,
        repository: { url: version.source.url, ...(version.source.path ? { directory: version.source.path } : {}) },
        versions: [version],
      })
    }
  }
  return entries
}

async function fetchBatch(batch, fetchImpl, token) {
  const fields = batch.map((item, index) => {
    const [owner, name] = item.fullName.split('/')
    const file = `${item.commit}:${item.directory ? `${item.directory}/` : ''}package.json`
    return `r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
      commit: object(expression: ${JSON.stringify(item.commit)}) { ... on Commit { oid committedDate } }
      manifest: object(expression: ${JSON.stringify(file)}) { ... on Blob { text } }
    }`
  })
  const response = await fetchImpl('https://api.github.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: `query { ${fields.join('\n')} }` }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`GitHub index metadata request failed (HTTP ${response.status})`)
  const payload = await response.json()
  const absent = new Set()
  for (const error of payload.errors || []) {
    const alias = error.path?.[0]
    if (error.type === 'NOT_FOUND' && error.path?.length === 1 && /^r\d+$/.test(alias || '') && payload.data?.[alias] === null) absent.add(alias)
    else throw new Error('GitHub index metadata request returned GraphQL errors; previous index retained')
  }
  if (!isObject(payload.data)) throw new Error('GitHub index metadata response is incomplete')
  return batch.map((item, index) => {
    const alias = `r${index}`
    const data = payload.data[alias]
    if (absent.has(alias)) return { reason: 'repository_missing' }
    if (!isObject(data) || !Object.hasOwn(data, 'commit') || !Object.hasOwn(data, 'manifest')) throw new Error('GitHub index metadata response is incomplete')
    if (data.commit === null) return { reason: 'commit_missing' }
    if (data.manifest === null) return { reason: 'manifest_missing' }
    if (data.commit.oid !== item.commit || typeof data.commit.committedDate !== 'string' || typeof data.manifest.text !== 'string') throw new Error('GitHub index metadata response does not match the requested commit and file')
    const timestamp = Date.parse(data.commit.committedDate) / 1000
    if (!Number.isInteger(timestamp)) throw new Error('GitHub index metadata response has an invalid commit time')
    let manifest
    try { manifest = JSON.parse(data.manifest.text) } catch { return { reason: 'manifest_invalid' } }
    // Current upstream generator excludes private bundles, including Git sources.
    if (manifest?.private === true) return { reason: 'package_private' }
    const check = validateBundleManifest(manifest)
    if (!check.valid || check.profile !== 'web') return { reason: 'bundle_invalid' }
    if (manifest.name !== item.plugin.packageName) return { reason: 'package_name_mismatch' }
    const range = dshRange(manifest)
    if (range instanceof Error) return { reason: 'engines_invalid' }
    const source = { type: 'git', url: item.url, commit: item.commit, ...(item.directory ? { path: item.directory } : {}) }
    const entry = {
      name: manifest.name,
      repository: { url: item.url, ...(item.directory ? { directory: item.directory } : {}) },
      versions: [{ version: manifest.version, publishTimestamp: timestamp, source, ...(range ? { engines: { dsh: range } } : {}) }],
    }
    try {
      return { entry: parseMarketIndex({ format: 1, title: 'check', plugins: [entry] }, INDEX_URL).plugins[0] }
    } catch { return { reason: 'index_metadata_invalid' } }
  })
}

/** Export only the snapshot's verified Web Git targets; no package code is installed or executed. */
export async function exportPluginIndex({ snapshot, previous, fetchImpl = fetch, token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN } = {}) {
  if (!Array.isArray(snapshot?.plugins)) throw new Error('Registry snapshot must contain plugins')
  const stats = { input: snapshot.plugins.length, eligible: 0, cached: 0, fetched: 0, exported: 0, skipped: {} }
  const skip = reason => { stats.skipped[reason] = (stats.skipped[reason] || 0) + 1 }
  // Include npm and other published rows: omitting the canonical npm target must
  // not leave a different repository's same-name Git package as its replacement.
  const publishedOrigins = new Map()
  for (const plugin of snapshot.plugins) {
    const origin = snapshotOrigin(plugin)
    if (typeof plugin.packageName !== 'string' || !plugin.packageName || !origin) continue
    const origins = publishedOrigins.get(plugin.packageName) || new Set()
    origins.add(origin)
    publishedOrigins.set(plugin.packageName, origins)
  }
  const candidates = []
  for (const plugin of snapshot.plugins) {
    const candidate = candidateOf(plugin)
    if (candidate.reason) skip(candidate.reason)
    else candidates.push(candidate)
  }
  // A package name is its install identity. Never select a different repository by popularity.
  const identities = new Map()
  for (const item of candidates) {
    const name = item.plugin.packageName
    const origins = identities.get(name) || new Set()
    origins.add(sourceKey({ url: item.url, path: item.directory, commit: item.commit }))
    identities.set(name, origins)
  }
  const cached = previousEntries(previous)
  const pending = []
  const results = new Map()
  const names = new Set()
  for (const item of candidates) {
    const name = item.plugin.packageName
    if (identities.get(name).size > 1 || publishedOrigins.get(name)?.size > 1) { skip('package_name_conflict'); continue }
    if (names.has(name)) { skip('duplicate_target'); continue }
    names.add(name)
    stats.eligible++
    const key = sourceKey({ url: item.url, path: item.directory, commit: item.commit })
    const known = cached.get(key)
    if (known?.name === name) { results.set(item, known); stats.cached++ }
    else pending.push(item)
  }
  if (pending.length && !token) throw new Error('GITHUB_TOKEN or GH_TOKEN is required for uncached index metadata')
  const batches = []
  for (let offset = 0; offset < pending.length; offset += 40) batches.push(pending.slice(offset, offset + 40))
  let next = 0
  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++]
      const fetched = await fetchBatch(batch, fetchImpl, token)
      stats.fetched += batch.length
      fetched.forEach((result, index) => {
        if (result.reason) skip(result.reason)
        else results.set(batch[index], result.entry)
      })
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, worker))
  const plugins = candidates.flatMap(item => results.has(item) ? [withDisplay(results.get(item), item.plugin)] : [])
  const categories = Object.fromEntries(Object.entries(snapshot.categories || {}).map(([id, title]) => [id, { title }]))
  const index = parseMarketIndex({ format: 1, title: { en: 'DSH Desk Plugin Registry', zh: 'DSH Desk 插件目录' }, metadata: { categories }, plugins }, INDEX_URL)
  stats.exported = index.plugins.length
  return { index, stats }
}

/** Generate completely before replacing the previous artifact. Paths remain fixed relative to the repository. */
export async function runExport({ root = ROOT, fetchImpl, token } = {}) {
  const output = join(root, 'public/data/plugin-index.json')
  const snapshot = JSON.parse(await readFile(join(root, 'public/data/plugins.json'), 'utf8'))
  let previous
  try { previous = JSON.parse(await readFile(output, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const result = await exportPluginIndex({ snapshot, previous, fetchImpl, token })
  const temporary = `${output}.${process.pid}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(result.index, null, 2)}\n`, { flag: 'wx' })
    await rename(temporary, output)
  } finally { await rm(temporary, { force: true }) }
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runExport().then(({ stats }) => console.log(JSON.stringify(stats))).catch(error => {
    console.error(`Plugin index export failed: ${error.message}`)
    process.exitCode = 1
  })
}
