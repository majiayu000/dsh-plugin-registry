import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { inferCategory, mergeRegistryCategories } from './registry-core.mjs'
import { validateRegistry } from './validate-registry.mjs'

const OUTPUT = resolve(process.env.DSH_REGISTRY_OUTPUT || 'public/data/plugins.json')
const AUDIT_OUTPUT = resolve(process.env.DSH_REGISTRY_AUDIT_OUTPUT || 'public/data/registry-audit.json')

function classify(plugin) {
  return {
    ...plugin,
    // 与同步管线（normalizeCurated/normalizeDiscovered）一致：已声明的分类作为回退，
    // 只有命中明确规则时才改判，避免把已声明分类的条目批量重归到 'tools'。
    category: inferCategory(plugin, plugin.category || 'tools'),
  }
}

function categoryCounts(entries) {
  return Object.fromEntries([...entries.reduce((counts, entry) => {
    counts.set(entry.category, (counts.get(entry.category) || 0) + 1)
    return counts
  }, new Map())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}

const registry = JSON.parse(await readFile(OUTPUT, 'utf8'))
const audit = JSON.parse(await readFile(AUDIT_OUTPUT, 'utf8'))

registry.categories = mergeRegistryCategories(registry.categories)
registry.plugins = registry.plugins.map(classify)
audit.pendingReview = (audit.pendingReview || []).map(classify)

const validation = validateRegistry(registry)
if (validation.errors.length) throw new Error(`Registry contract failed:\n- ${validation.errors.join('\n- ')}`)

await writeFile(OUTPUT, `${JSON.stringify(registry, null, 2)}\n`)
await writeFile(AUDIT_OUTPUT, `${JSON.stringify(audit, null, 2)}\n`)

console.log('Published categories:', categoryCounts(registry.plugins))
console.log('Pending-review categories:', categoryCounts(audit.pendingReview))
