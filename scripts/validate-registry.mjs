import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { INSTALL_PROFILES, githubSpecIsPinned, parseInstallCommand } from '../assets/install-command.js'
import { parseGithubRepositoryUrl, repoKey } from './registry-core.mjs'

const INSTALL_PATTERN = /^dsh plugin --profile (web|tui|headless) add ([^\s]+)$/
const ICON_PATTERN = /^https:\/\/(?:github\.com|avatars\.githubusercontent\.com)\//
const VERIFIED_COMMIT_PATTERN = /^[0-9a-f]{40}$/

export function validateRegistry(registry) {
  const errors = []
  const warnings = []
  const ids = new Set()
  const repositoryIds = new Map()
  const categories = new Set(Object.keys(registry?.categories || {}))

  if (registry?.schemaVersion !== 2) errors.push('schemaVersion must be 2.')
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
    if (!plugin?.id || idRepository !== key) errors.push(`${label}.id must match the GitHub repository URL (${plugin?.id} vs ${plugin?.url}).`)
    if (repositoryUrl && String(plugin?.owner).toLowerCase() !== repositoryUrl.owner.toLowerCase()) errors.push(`${label}.owner must match the GitHub repository URL.`)
    if (ids.has(String(plugin?.id).toLowerCase())) errors.push(`${label}.id is duplicated: ${plugin.id}.`)
    ids.add(String(plugin?.id).toLowerCase())
    if (!repositoryUrl) errors.push(`${label}.url must be a valid GitHub repository URL.`)
    const existingRepositoryIds = repositoryIds.get(key) || new Set()
    if (key && existingRepositoryIds.size && !String(plugin.id).includes('#') && [...existingRepositoryIds].some(id => !id.includes('#'))) {
      errors.push(`${label} duplicates repository ${key}.`)
    }
    if (key) {
      existingRepositoryIds.add(String(plugin.id).toLowerCase())
      repositoryIds.set(key, existingRepositoryIds)
    }
    if (!ICON_PATTERN.test(plugin?.icon || '')) errors.push(`${label}.icon must be an HTTPS URL hosted on github.com or avatars.githubusercontent.com.`)
    if (!categories.has(plugin?.category)) errors.push(`${label}.category is unknown: ${plugin?.category}.`)
    if (!Number.isInteger(plugin?.stars) || plugin.stars < 0) errors.push(`${label}.stars must be a non-negative integer.`)
    if (!Number.isInteger(plugin?.forks) || plugin.forks < 0) errors.push(`${label}.forks must be a non-negative integer.`)
    if (plugin?.language !== undefined && typeof plugin.language !== 'string') errors.push(`${label}.language must be a string.`)
    if (plugin?.special !== undefined && typeof plugin.special !== 'boolean') errors.push(`${label}.special must be a boolean.`)
    if (plugin?.recommendationSource !== undefined && plugin.recommendationSource !== 'x') errors.push(`${label}.recommendationSource is invalid.`)
    if (plugin?.origin !== undefined && plugin.origin !== 'issue') errors.push(`${label}.origin must be "issue" when present.`)
    if (plugin?.origin === 'issue' && plugin?.source !== 'curated') errors.push(`${label}.origin "issue" requires source "curated" (issue submissions are human-reviewed).`)
    if (plugin?.license !== undefined && typeof plugin.license !== 'string') errors.push(`${label}.license must be a string.`)
    if (plugin?.latestRelease !== undefined && plugin.latestRelease !== null) {
      if (typeof plugin.latestRelease !== 'object' || typeof plugin.latestRelease.tag !== 'string') errors.push(`${label}.latestRelease is invalid.`)
      if (plugin.latestRelease?.publishedAt !== null && (typeof plugin.latestRelease?.publishedAt !== 'string' || Number.isNaN(Date.parse(plugin.latestRelease.publishedAt)))) errors.push(`${label}.latestRelease.publishedAt is invalid.`)
    }
    if (plugin?.pushedAt !== undefined && plugin.pushedAt !== null && (typeof plugin.pushedAt !== 'string' || Number.isNaN(Date.parse(plugin.pushedAt)))) {
      errors.push(`${label}.pushedAt must be a valid ISO date or null.`)
    }
    if (plugin?.verifiedCommit !== undefined && !VERIFIED_COMMIT_PATTERN.test(plugin.verifiedCommit)) {
      errors.push(`${label}.verifiedCommit must be a 40-character commit SHA.`)
    }
    if (!['curated', 'discovered'].includes(plugin?.source)) errors.push(`${label}.source is invalid.`)
    const expectedTrust = plugin?.source === 'curated' ? 'curated' : 'manifest_verified'
    if (plugin?.trustLevel !== expectedTrust) errors.push(`${label}.trustLevel must be ${expectedTrust}.`)
    if (Object.hasOwn(plugin || {}, 'verified') || Object.hasOwn(plugin || {}, 'installable')) {
      errors.push(`${label} must not use the ambiguous verified or installable fields.`)
    }
    const allowedManifestStatuses = plugin?.source === 'curated' ? ['not_checked', 'shape_validated'] : ['shape_validated']
    if (!allowedManifestStatuses.includes(plugin?.verification?.manifest)) errors.push(`${label}.verification.manifest is invalid for ${plugin?.source}.`)
    const allowedPatchStatuses = plugin?.verification?.manifest === 'shape_validated' ? ['not_checked', 'exists', 'missing', 'invalid'] : ['not_checked']
    if (!allowedPatchStatuses.includes(plugin?.verification?.patch)) errors.push(`${label}.verification.patch is invalid.`)
    if (plugin?.verification?.installation !== 'not_tested') errors.push(`${label}.verification.installation must be not_tested.`)
    if (!INSTALL_PATTERN.test(String(plugin?.install || ''))) errors.push(`${label}.install is invalid.`)
    const parsedInstall = parseInstallCommand(plugin?.install)
    if (plugin?.profile !== undefined && !INSTALL_PROFILES.includes(plugin.profile)) errors.push(`${label}.profile is invalid.`)
    if (plugin?.profile && parsedInstall && plugin.profile !== parsedInstall.profile) errors.push(`${label}.profile must match the install command.`)
    if (plugin?.packageName !== undefined && (typeof plugin.packageName !== 'string' || !plugin.packageName.trim())) errors.push(`${label}.packageName must be a non-empty string.`)
    if (plugin?.verifiedCommit && parsedInstall && /^github:/i.test(parsedInstall.spec) && !githubSpecIsPinned(parsedInstall.spec, plugin.verifiedCommit)) {
      errors.push(`${label}.install must pin the github spec to verifiedCommit.`)
    }
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
