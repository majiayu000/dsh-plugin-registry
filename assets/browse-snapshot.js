export const BROWSE_PLUGIN_FIELDS = [
  'id',
  'name',
  'owner',
  'description',
  'category',
  'stars',
  'forks',
  'language',
  'license',
  'latestRelease',
  'pushedAt',
  'addedAt',
  'source',
  'trustLevel',
  'verification',
  'profile',
  'packageName',
  'verifiedCommit',
  'topics',
  'icon',
  'special',
  'recommendationSource',
  'origin',
]

export function toBrowseDocument(registry) {
  return {
    schemaVersion: 1,
    generatedAt: registry.generatedAt ?? null,
    categories: registry.categories || {},
    stats: registry.stats || {},
    fields: BROWSE_PLUGIN_FIELDS,
    plugins: (registry.plugins || []).map(plugin => BROWSE_PLUGIN_FIELDS.map(field => plugin[field] ?? null)),
  }
}

export function fromBrowseDocument(document) {
  if (!document || document.schemaVersion !== 1 || !Array.isArray(document.fields) || !Array.isArray(document.plugins)) {
    throw new Error('Invalid browse snapshot')
  }
  const fields = document.fields
  const plugins = document.plugins.map(row => {
    if (!Array.isArray(row)) throw new Error('Invalid browse plugin row')
    return Object.fromEntries(fields.map((field, index) => [field, row[index]]))
  })
  return {
    schemaVersion: 2,
    generatedAt: document.generatedAt,
    categories: document.categories || {},
    stats: document.stats || {},
    plugins,
  }
}
