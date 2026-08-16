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

// 合并而非整文件替换：快照中暂时不存在（如已归档/被隔离）的既有条目必须保留，
// 否则一次导出就会把 vendored 目录里手工维护的条目永久删掉。
// 仅把缺失文件当成空目录；损坏的 catalog 必须拒绝写入，避免覆盖掉要保住的条目。
let existing
try {
  existing = JSON.parse(await readFile(OUTPUT, 'utf8'))
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
  existing = { plugins: [] }
}
const exportedIds = new Set(plugins.map(plugin => String(plugin.id).toLowerCase()))
const kept = (existing.plugins || []).filter(entry => !exportedIds.has(String(entry?.id || '').toLowerCase()))
if (kept.length) {
  console.warn(`Kept ${kept.length} vendored entries absent from the snapshot (likely unpublished, archived, or quarantined): ${kept.map(entry => entry.id).join(', ')}`)
}

await writeFile(OUTPUT, `${JSON.stringify({ updated: registry.generatedAt, plugins: [...plugins, ...kept] }, null, 2)}\n`)
console.log(`Vendored ${plugins.length} curated plugins into ${OUTPUT}${kept.length ? ` (${kept.length} existing entries preserved)` : ''}.`)
