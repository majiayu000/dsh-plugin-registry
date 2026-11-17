import { applyDiversity, blendSearchQuality, RANKING_CONFIG } from '../../assets/registry-ranking.js'
import { relevanceScore } from '../../assets/registry-search.js'

// Fixed tuple layout shared with the builder; no field-name repetition per row.
export const QUERY_COLUMN = Object.freeze({
  id: 0, owner: 1, category: 2, source: 3, manifest: 4, language: 5,
  stars: 6, forks: 7, pushedAt: 8, addedAt: 9, candidate: 10, pending: 11,
  score: 12, idLower: 13, name: 14, ownerLower: 15, description: 16,
  topics: 17, descriptionRanges: 18, extra: 19, topicWords: 20,
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
function createTopRows(limit, compare) {
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
  return {
    heap,
    full: () => heap.length >= limit,
    worst: () => heap[0],
    push(row) {
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
    },
    sorted: () => heap.sort(compare),
  }
}

// Largest value relevanceScore can add for one term: either an exact id/name
// match (120, which returns immediately) or every partial bonus (70+35+20+10+8).
const MAX_TERM_RELEVANCE = 143

/* Same placement rule as applyDiversity. Its output begins with every row the
   first pass accepts, so a page inside that first pass can stop early. Returns
   null when the first pass cannot fill the requested prefix. */
function diversityPrefix(rows, need, config = RANKING_CONFIG) {
  const { window, maxPerOwner, maxConsecutive } = config.diversity
  const headSeats = new Map()
  const out = []
  let runOwner, run = 0
  for (const row of rows) {
    const owner = row[C.owner]
    if (out.length < window && (headSeats.get(owner) || 0) >= maxPerOwner) continue
    const tail = runOwner === owner ? run : 0
    if (tail >= maxConsecutive) continue
    if (out.length < window) headSeats.set(owner, (headSeats.get(owner) || 0) + 1)
    out.push(row)
    run = tail + 1
    runOwner = owner
    if (out.length >= need) return out
  }
  return null
}

/* relevanceScore from assets/registry-search.js over one stored row, without
   building a per-row object or splitting topics. Older documents without
   topicWords fall back to the shared browser function. Tests compare both. */
function relevance(entry, terms, padded) {
  const id = entry[C.idLower] ?? entry[C.id]
  const name = entry[C.name]
  const words = entry[C.topicWords]
  if (words === undefined) {
    return relevanceScore({ id, name, owner: entry[C.ownerLower] ?? entry[C.owner], description: entry[C.description], topics: entry[C.topics] }, terms)
  }
  let score = 0
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i]
    if (id === term || name === term) { score += 120; continue }
    if (name.startsWith(term)) score += 70
    else if (name.includes(term)) score += 45
    if (id.startsWith(term)) score += 35
    else if (id.includes(term)) score += 24
    if (words.includes(padded[i])) score += 20
    else if (entry[C.topics].includes(term)) score += 12
    if ((entry[C.ownerLower] ?? entry[C.owner]).includes(term)) score += 10
    if (entry[C.description].includes(term)) score += 8
  }
  return score
}

/* Upper bound of relevance() from the short id/name fields only: the topic,
   owner and description bonuses (20+10+8) are assumed present. */
function relevanceUpperBound(entry, terms) {
  const id = entry[C.idLower] ?? entry[C.id]
  const name = entry[C.name]
  let score = 0
  for (const term of terms) {
    if (id === term || name === term) { score += 120; continue }
    score += (name.startsWith(term) ? 70 : name.includes(term) ? 45 : 0)
      + (id.startsWith(term) ? 35 : id.includes(term) ? 24 : 0) + 38
  }
  return score
}

function blendedScore(entry, terms, padded) {
  return blendSearchQuality(relevance(entry, terms, padded), entry[C.score])
}

const ALL = 'all'
function listingAccepts(index, listing, position) {
  if (listing === ALL || !index.lowSignal) return true
  return listing === 'low_signal' ? index.lowSignal[position] === 1 : index.lowSignal[position] !== 1
}

/**
 * Preserve the browser's full filter/sort order, then return one page of ids.
 * `listing` is the browser's standard/low_signal/all choice. Omitting it keeps
 * the pre-listing semantics (all) so older experiments remain comparable.
 */
export function queryIndex(index, options = {}) {
  const query = String(options.q || '')
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const locale = options.locale === 'en' || options.locale === 'en-US' ? 'en' : 'zh'
  const category = options.category || ALL
  const source = options.source || ALL
  const manifest = options.manifest || ALL
  const language = options.language || ALL
  const listing = options.listing || ALL
  const sort = options.sort || 'relevance'
  const page = Math.max(1, Math.floor(Number(options.page) || 1))
  const pageSize = Math.max(1, Math.floor(Number(options.pageSize) || 30))
  const offset = (page - 1) * pageSize
  const need = offset + pageSize
  if (!query && sort === 'relevance' && [category, source, manifest, language].every(value => value === ALL)) {
    const home = index.homes?.[listing] ?? (listing === ALL ? index.home : null)
    if (!home) throw new Error(`Unknown listing ${listing}`)
    return { total: home.length, ids: home.slice(offset, offset + pageSize).map(position => index.entries[position][C.id]) }
  }
  const categories = new Map()
  const positions = terms.length ? candidates(index, terms)
    : query && sort === 'relevance' ? Array.from(index.entries.keys()) : index.orders[sort]
  const entries = index.entries
  const matches = position => {
    const entry = entries[position]
    if (entry[C.candidate] && manifest !== 'not_validated') return false
    if (category !== ALL && entry[C.category] !== category) return false
    if (source !== ALL && entry[C.source] !== source) return false
    if (manifest !== ALL && entry[C.manifest] !== manifest) return false
    if (language !== ALL && entry[C.language] !== language) return false
    if (!listingAccepts(index, listing, position)) return false
    if (!terms.length) return true
    const key = entry[C.category]
    if (!categories.has(key)) categories.set(key, localizedCategory(index.categories, key, locale))
    const categoryText = categories.get(key)
    const id = entry[C.idLower] ?? entry[C.id], owner = entry[C.ownerLower] ?? entry[C.owner]
    for (const term of terms) {
      if (!(id.includes(term) || owner.includes(term) || entry[C.topics].includes(term) || entry[C.extra].includes(term)
        || categoryText.includes(term) || descriptionIncludes(entry, term, locale))) return false
    }
    return true
  }
  const matched = positions.filter(matches)
  const total = matched.length
  if (offset >= total) return { total, ids: [] }

  if (!terms.length) {
    let rows = matched
    if (!query && sort === 'relevance') {
      // Filtered recommendation keeps diversity across the filtered set.
      const ordered = rows.map(position => entries[position])
      const prefix = diversityPrefix(ordered, need)
      const diversified = prefix || applyDiversity(ordered.map(entry => ({ owner: entry[C.owner], entry }))).map(item => item.entry)
      return { total, ids: diversified.slice(offset, offset + pageSize).map(entry => entry[C.id]) }
    }
    return { total, ids: rows.slice(offset, offset + pageSize).map(position => entries[position][C.id]) }
  }

  // Explicit sort is primary, relevance breaks its ties. Combining these
  // comparators preserves the browser's two stable sorts without sorting twice.
  // Ranks are precomputed for documents that carry them (dense, ascending).
  const ranks = index.ranks
  const primary = sort === 'relevance' ? null : ranks ? ranks[sort] : null
  const idRank = ranks?.id
  const compare = (a, b) => (sort === 'relevance' ? 0 : primary ? primary[a.position] - primary[b.position] : compareQueryRows(a.entry, b.entry, sort))
    || b.score - a.score || b.entry[C.stars] - a.entry[C.stars]
    || (idRank ? idRank[a.position] - idRank[b.position] : a.entry[C.id].localeCompare(b.entry[C.id])) || a.position - b.position
  const padded = terms.map(term => ` ${term} `)
  const score = position => ({ entry: entries[position], position, score: blendedScore(entries[position], terms, padded) })
  const top = createTopRows(need, compare)
  if (need >= total || !ranks || !index.quality) {
    for (const position of matched) top.push(score(position))
  } else if (sort === 'relevance') {
    // Visit matches by descending quality. relevance <= bound, so once the
    // bound's blend is strictly below the current K-th score no later row
    // (with equal or lower quality) can enter the page prefix.
    const mark = new Uint8Array(entries.length)
    for (const position of matched) mark[position] = 1
    const bound = MAX_TERM_RELEVANCE * terms.length
    for (const position of index.quality) {
      if (!mark[position]) continue
      const entry = entries[position]
      if (top.full() && blendSearchQuality(bound, entry[C.score]) < top.worst().score) break
      // Cheap id/name bound first; long descriptions are read only if needed.
      if (top.full() && blendSearchQuality(relevanceUpperBound(entry, terms), entry[C.score]) < top.worst().score) continue
      const value = blendedScore(entry, terms, padded)
      // Relevance order is score-first, so a strictly lower score cannot enter.
      if (top.full() && value < top.worst().score) continue
      top.push({ entry, position, score: value })
    }
  } else {
    // Matches in primary-key order: collect until K rows are held and the
    // next row's primary key is strictly worse than the K-th collected row.
    const mark = new Uint8Array(entries.length)
    for (const position of matched) mark[position] = 1
    let collected = 0, boundary
    for (const position of index.orders[sort]) {
      if (!mark[position]) continue
      if (collected >= need && primary[position] !== boundary) break
      top.push(score(position))
      collected++
      if (collected === need) boundary = primary[position]
    }
  }
  const rows = top.sorted()
  return { total, ids: rows.slice(offset, offset + pageSize).map(row => row.entry[C.id]) }
}
