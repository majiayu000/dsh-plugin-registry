import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Regenerates sources/curated.json from the published snapshot so the curated
// catalog stays vendored in-repo (and reviewable in git) instead of depending
// on a remote host. Run after hand-editing curated entries in plugins.json:
//   npm run export:curated
const SNAPSHOT = resolve(process.argv[2] || 'public/data/plugins.json')
const OUTPUT = resolve('sources/curated.json')

const registry = JSON.parse(await readFile(SNAPSHOT, 'utf8'))
const plugins = registry.plugins
  .filter(plugin => plugin.source === 'curated')
  .map(plugin => ({
    id: plugin.id,
    name: plugin.name,
    url: plugin.url,
    description: plugin.description,
    category: plugin.category,
    topics: plugin.topics || [],
    ...(plugin.special ? { special: true } : {}),
    ...(plugin.recommendationSource ? { recommendationSource: plugin.recommendationSource } : {}),
    install: plugin.install,
    icon: plugin.icon,
    added: plugin.addedAt ?? null,
    stars: plugin.stars ?? 0,
    forks: plugin.forks ?? 0,
  }))

await writeFile(OUTPUT, `${JSON.stringify({ updated: registry.generatedAt, plugins }, null, 2)}\n`)
console.log(`Vendored ${plugins.length} curated plugins into ${OUTPUT}.`)
