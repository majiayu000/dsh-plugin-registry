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

export function compareQueryRows(a, b, sort) {
  if (sort === 'relevance') return Number(a[C.pending]) - Number(b[C.pending]) || b[C.score] - a[C.score] || a[C.id].localeCompare(b[C.id])
  if (sort === 'forks') return b[C.forks] - a[C.forks]
  if (sort === 'new') return b[C.pushedAt].localeCompare(a[C.pushedAt])
  if (sort === 'added') return b[C.addedAt].localeCompare(a[C.addedAt])
  if (sort === 'manifest') {
    const delta = Number(b[C.manifest] === 'shape_validated') - Number(a[C.manifest] === 'shape_validated')
    if (delta) return delta
  }
  return b[C.stars] - a[C.stars]
}

function candidates(index, terms) {
  // Every matching row must contain every fragment. Start with the smallest
  // posting list, then retain the exact field/locale predicate below.
  let shortest
  for (const term of terms) {
    const width = Math.min(2, term.length)
    for (let start = 0; start <= term.length - width; start++) {
      const posting = index.grams[term.slice(start, start + width)]
      if (!posting) return []
      if (!shortest || posting.length < shortest.length) shortest = posting
    }
  }
  const bytes = atob(shortest)
  const positions = []
  let position = 0, delta = 0, shift = 0
  for (let offset = 0; offset < bytes.length; offset++) {
    const byte = bytes.charCodeAt(offset)
    delta |= (byte & 127) << shift
    if (byte & 128) shift += 7
    else { position += delta >>> 0; positions.push(position); delta = 0; shift = 0 }
  }
  return positions
}

// Keep only the requested prefix in a max-heap; a broad one-letter query
// need not sort every matching row merely to return its first 30 results.
function firstRows(rows, limit, compare) {
  if (limit >= rows.length) return rows.sort(compare)
  const heap = []
  function sink() {
    let parent = 0
    while (parent * 2 + 1 < heap.length) {
      let child = parent * 2 + 1
      if (child + 1 < heap.length && compare(heap[child + 1], heap[child]) > 0) child++
      if (compare(heap[parent], heap[child]) >= 0) break
      ;[heap[parent], heap[child]] = [heap[child], heap[parent]]
      parent = child
    }
  }
  for (const row of rows) {
    if (heap.length < limit) {
      heap.push(row)
      let child = heap.length - 1
      while (child > 0) {
        const parent = (child - 1) >> 1
        if (compare(heap[parent], heap[child]) >= 0) break
        ;[heap[parent], heap[child]] = [heap[child], heap[parent]]
        child = parent
      }
    } else if (compare(row, heap[0]) < 0) { heap[0] = row; sink() }
  }
  return heap.sort(compare)
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
  const page = Math.max(1, Math.floor(Number(options.page) || 1))
  const pageSize = Math.max(1, Math.floor(Number(options.pageSize) || 30))
  const offset = (page - 1) * pageSize
  if (!query && sort === 'relevance' && [category, source, manifest, language].every(value => value === 'all')) {
    return { total: index.home.length, ids: index.home.slice(offset, offset + pageSize).map(position => index.entries[position][C.id]) }
  }
  const categories = new Map()
  const positions = terms.length ? candidates(index, terms)
    : query && sort === 'relevance' ? Array.from(index.entries.keys()) : index.orders[sort]
  let rows = positions.map(position => index.entries[position]).filter(entry => {
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
  const total = rows.length
  if (offset >= total) return { total, ids: [] }
  // Explicit sort is primary, relevance breaks its ties. Combining these
  // comparators preserves the browser's two stable sorts without sorting twice.
  if (terms.length) {
    const scored = rows.map((entry, order) => ({ entry, order, score: blendSearchQuality(relevanceScore({
      id: entry[C.idLower] ?? entry[C.id], name: entry[C.name],
      owner: entry[C.ownerLower] ?? entry[C.owner], description: entry[C.description], topics: entry[C.topics],
    }, terms), entry[C.score]) }))
    rows = firstRows(scored, offset + pageSize, (a, b) => (sort === 'relevance' ? 0 : compareQueryRows(a.entry, b.entry, sort))
      || b.score - a.score || b.entry[C.stars] - a.entry[C.stars]
      || a.entry[C.id].localeCompare(b.entry[C.id]) || a.order - b.order).map(row => row.entry)
  }
  if (!query && sort === 'relevance') {
    rows = applyDiversity(rows.map(entry => ({ owner: entry[C.owner], entry }))).map(item => item.entry)
  }
  return { total, ids: rows.slice(offset, offset + pageSize).map(entry => entry[C.id]) }
}
