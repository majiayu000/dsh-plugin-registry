import { applyDiversity, blendSearchQuality } from '../../assets/registry-ranking.js'
import { relevanceScore } from '../../assets/registry-search.js'

// Fixed tuple layout shared with the builder; no field-name repetition per row.
export const QUERY_COLUMN = Object.freeze({
  id: 0, owner: 1, category: 2, source: 3, manifest: 4, language: 5,
  stars: 6, forks: 7, pushedAt: 8, addedAt: 9, candidate: 10, pending: 11,
  score: 12, idLower: 13, name: 14, ownerLower: 15, description: 16,
  topics: 17, descriptionRanges: 18, extra: 19,
})
const C = QUERY_COLUMN

function localizedCategory(categories, key, locale) {
  const value = categories[key]
  return String(value ? (value[locale] || value.zh || value.en || key) : key).toLowerCase()
}

function descriptionIncludes(entry, term, locale) {
  const offset = locale === 'en' ? 2 : 0
  const start = entry[C.descriptionRanges][offset]
  const length = entry[C.descriptionRanges][offset + 1]
  const match = entry[C.description].indexOf(term, start)
  return match >= start && match >= 0 && match + term.length <= start + length
}

/** Preserve the browser's full filter/sort order, then return one page of ids. */
export function queryIndex(index, options = {}) {
  const query = String(options.q || '')
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const locale = options.locale === 'en' || options.locale === 'en-US' ? 'en' : 'zh'
  const category = options.category || 'all'
  const source = options.source || 'all'
  const manifest = options.manifest || 'all'
  const language = options.language || 'all'
  const sort = options.sort || 'relevance'
  const categories = new Map()
  let rows = index.entries.filter(entry => {
    if (entry[C.candidate] && manifest !== 'not_validated') return false
    if (category !== 'all' && entry[C.category] !== category) return false
    if (source !== 'all' && entry[C.source] !== source) return false
    if (manifest !== 'all' && entry[C.manifest] !== manifest) return false
    if (language !== 'all' && entry[C.language] !== language) return false
    if (!terms.length) return true
    const key = entry[C.category]
    if (!categories.has(key)) categories.set(key, localizedCategory(index.categories, key, locale))
    const categoryText = categories.get(key)
    return terms.every(term => (entry[C.idLower] ?? entry[C.id]).includes(term)
      || (entry[C.ownerLower] ?? entry[C.owner]).includes(term)
      || entry[C.topics].includes(term)
      || entry[C.extra].includes(term)
      || categoryText.includes(term)
      || descriptionIncludes(entry, term, locale))
  })
  // The browser ranks matches first even for an explicit sort; stable ties in
  // that later sort must retain relevance order rather than snapshot order.
  if (terms.length) {
    const relevance = new Map(rows.map(entry => [entry, blendSearchQuality(relevanceScore({
      id: entry[C.idLower] ?? entry[C.id], name: entry[C.name],
      owner: entry[C.ownerLower] ?? entry[C.owner], description: entry[C.description], topics: entry[C.topics],
    }, terms), entry[C.score])]))
    rows.sort((a, b) => relevance.get(b) - relevance.get(a) || b[C.stars] - a[C.stars] || a[C.id].localeCompare(b[C.id]))
  }
  if (!query && sort === 'relevance') {
    rows.sort((a, b) => Number(a[C.pending]) - Number(b[C.pending]) || b[C.score] - a[C.score] || String(a[C.id] || '').localeCompare(String(b[C.id] || '')))
    rows = applyDiversity(rows.map(entry => ({ owner: entry[C.owner], entry }))).map(item => item.entry)
  } else if (sort !== 'relevance' || !query) {
    rows.sort((a, b) => {
      if (sort === 'forks') return b[C.forks] - a[C.forks]
      if (sort === 'new') return String(b[C.pushedAt] || '').localeCompare(String(a[C.pushedAt] || ''))
      if (sort === 'added') return String(b[C.addedAt] || '').localeCompare(String(a[C.addedAt] || ''))
      if (sort === 'manifest') {
        const delta = Number(b[C.manifest] === 'shape_validated') - Number(a[C.manifest] === 'shape_validated')
        if (delta) return delta
      }
      return b[C.stars] - a[C.stars]
    })
  }
  const page = Math.max(1, Math.floor(Number(options.page) || 1))
  const pageSize = Math.max(1, Math.floor(Number(options.pageSize) || 30))
  const offset = (page - 1) * pageSize
  return { total: rows.length, ids: rows.slice(offset, offset + pageSize).map(entry => entry[C.id]) }
}
