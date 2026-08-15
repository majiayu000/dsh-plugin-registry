import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateRegistry } from './validate-registry.mjs'

const GITHUB_API = 'https://api.github.com/graphql'
const OUTPUT = resolve(process.env.DSH_REGISTRY_OUTPUT || 'public/data/plugins.json')
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
const BATCH_SIZE = 40

if (!TOKEN) throw new Error('GITHUB_TOKEN or GH_TOKEN is required to backfill repository languages.')

function repositoryParts(plugin) {
  const [owner, name] = String(plugin.id || '').split('#')[0].split('/')
  return owner && name ? { owner, name } : null
}

async function fetchBatch(batch) {
  const fields = batch.map(({ plugin }, aliasIndex) => {
    const repository = repositoryParts(plugin)
    return `r${aliasIndex}: repository(owner: ${JSON.stringify(repository.owner)}, name: ${JSON.stringify(repository.name)}) { primaryLanguage { name } }`
  }).join('\n')
  const response = await fetch(GITHUB_API, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
      'user-agent': 'harness-registry-language-backfill',
    },
    body: JSON.stringify({ query: `query { ${fields} }` }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`GitHub GraphQL ${response.status}: ${response.statusText}`)
  const result = await response.json()
  if (!result.data) throw new Error(result.errors?.[0]?.message || 'GitHub GraphQL returned no data.')
  return result.data
}

const registry = JSON.parse(await readFile(OUTPUT, 'utf8'))
const pending = registry.plugins
  .map((plugin, index) => ({ plugin, index }))
  .filter(({ plugin }) => !plugin.language && repositoryParts(plugin))

for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
  const batch = pending.slice(offset, offset + BATCH_SIZE)
  const data = await fetchBatch(batch)
  batch.forEach(({ plugin }, aliasIndex) => {
    plugin.language = data[`r${aliasIndex}`]?.primaryLanguage?.name || ''
  })
  console.log(`Language metadata: ${Math.min(offset + batch.length, pending.length)}/${pending.length}`)
}

registry.generatedAt = new Date().toISOString()
const validation = validateRegistry(registry)
if (validation.errors.length) throw new Error(`Registry contract failed:\n- ${validation.errors.join('\n- ')}`)
await writeFile(OUTPUT, `${JSON.stringify(registry, null, 2)}\n`)
console.log(`Language backfill complete: ${registry.plugins.filter(plugin => plugin.language).length}/${registry.plugins.length} repositories identified.`)
