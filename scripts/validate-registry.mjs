import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { repoKey } from './registry-core.mjs'

const INSTALL_PREFIX = 'dsh plugin --profile web add '
const GITHUB_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/

function parseGithubRepositoryUrl(value) {
  const match = String(value || '').match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+)(?:\/tree\/[^/]+\/.+)?\/?$/)
  if (!match || !GITHUB_OWNER_PATTERN.test(match[1]) || !GITHUB_REPOSITORY_PATTERN.test(match[2])) return null
  return { owner: match[1], repository: match[2] }
}

export function validateRegistry(registry) {
  const errors = []
  const warnings = []
  const ids = new Set()
  const repositories = new Set()
  const categories = new Set(Object.keys(registry?.categories || {}))

  if (registry?.schemaVersion !== 1) errors.push('schemaVersion must be 1.')
  if (!registry?.generatedAt || Number.isNaN(Date.parse(registry.generatedAt))) errors.push('generatedAt must be a valid ISO date.')
  if (!registry?.categories || typeof registry.categories !== 'object' || Array.isArray(registry.categories)) errors.push('categories must be an object.')
  if (!registry?.stats || typeof registry.stats !== 'object' || Array.isArray(registry.stats)) errors.push('stats must be an object.')
  if (!registry?.sources || typeof registry.sources !== 'object' || Array.isArray(registry.sources)) errors.push('sources must be an object.')
  if (!Array.isArray(registry?.plugins)) return { errors: [...errors, 'plugins must be an array.'], warnings }

  registry.plugins.forEach((plugin, index) => {
    const label = `plugins[${index}]`
    if (!String(plugin?.name || '').trim()) errors.push(`${label}.name is required.`)
    if (!String(plugin?.owner || '').trim()) errors.push(`${label}.owner is required.`)
    if (!plugin?.description || typeof plugin.description.zh !== 'string' || typeof plugin.description.en !== 'string') errors.push(`${label}.description must contain zh and en strings.`)
    const repositoryUrl = parseGithubRepositoryUrl(plugin?.url)
    const key = repositoryUrl ? repoKey(repositoryUrl.owner, repositoryUrl.repository) : ''
    const idRepository = String(plugin?.id || '').split('#')[0].toLowerCase()
    if (!plugin?.id || idRepository !== key) errors.push(`${label}.id must match the GitHub repository URL.`)
    if (repositoryUrl && String(plugin?.owner).toLowerCase() !== repositoryUrl.owner.toLowerCase()) errors.push(`${label}.owner must match the GitHub repository URL.`)
    if (ids.has(String(plugin?.id).toLowerCase())) errors.push(`${label}.id is duplicated: ${plugin.id}.`)
    ids.add(String(plugin?.id).toLowerCase())
    if (!repositoryUrl) errors.push(`${label}.url must be a valid GitHub repository URL.`)
    if (key && repositories.has(key) && !String(plugin.id).includes('#')) errors.push(`${label} duplicates repository ${key}.`)
    if (key) repositories.add(key)
    if (!/^https:\/\//.test(plugin?.icon || '')) errors.push(`${label}.icon must be an HTTPS URL.`)
    if (!categories.has(plugin?.category)) errors.push(`${label}.category is unknown: ${plugin?.category}.`)
    if (!Number.isInteger(plugin?.stars) || plugin.stars < 0) errors.push(`${label}.stars must be a non-negative integer.`)
    if (!Number.isInteger(plugin?.forks) || plugin.forks < 0) errors.push(`${label}.forks must be a non-negative integer.`)
    if (!['curated', 'discovered'].includes(plugin?.source)) errors.push(`${label}.source is invalid.`)
    const expectedTrust = plugin?.source === 'curated' ? 'curated' : 'manifest_verified'
    if (plugin?.trustLevel !== expectedTrust) errors.push(`${label}.trustLevel must be ${expectedTrust}.`)
    if (plugin?.verified !== true || plugin?.installable !== true) errors.push(`${label} must be verified and installable.`)
    const installTarget = String(plugin?.install || '').slice(INSTALL_PREFIX.length)
    if (!String(plugin?.install || '').startsWith(INSTALL_PREFIX) || !/^[^\s]+$/.test(installTarget)) errors.push(`${label}.install is invalid.`)
    if (plugin?.source === 'discovered' && installTarget.toLowerCase() !== `github:${plugin.id}`.toLowerCase()) errors.push(`${label}.install must target its repository ID.`)
    if (!plugin?.description?.zh && !plugin?.description?.en) warnings.push(`${label} has no description: ${plugin?.id}.`)
  })

  return { errors, warnings }
}

async function main() {
  const input = resolve(process.argv[2] || 'public/data/plugins.json')
  const registry = JSON.parse(await readFile(input, 'utf8'))
  const result = validateRegistry(registry)
  result.warnings.forEach(warning => console.warn(`warning: ${warning}`))
  if (result.errors.length) throw new Error(`Registry contract failed:\n- ${result.errors.join('\n- ')}`)
  console.log(`Registry contract valid: ${registry.plugins.length} plugins, ${result.warnings.length} warnings.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
