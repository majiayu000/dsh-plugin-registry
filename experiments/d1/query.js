import { applyDiversity } from '../../assets/registry-ranking.js'

export function requestOptions(url) {
  const value = key => (url.searchParams.get(key) || '').trim()
  const options = { q: value('q'), locale: value('locale') || 'zh', category: value('category') || 'all',
    source: value('source') || 'all', manifest: value('manifest') || 'all', language: value('language') || 'all',
    sort: value('sort') || 'relevance', page: Number(value('page') || 1), version: url.searchParams.get('version') }
  if (options.q.length > 200 || options.category.length > 100 || options.language.length > 100
    || !Number.isSafeInteger(options.page) || options.page < 1 || options.page > 100000
    || !['zh', 'en'].includes(options.locale) || !['all', 'curated', 'discovered'].includes(options.source)
    || !['all', 'shape_validated', 'not_checked', 'not_validated'].includes(options.manifest)
    || !['relevance', 'stars', 'forks', 'new', 'added', 'manifest'].includes(options.sort)) return null
  return options
}

const textScore = `(SELECT COALESCE(SUM(CASE WHEN p.id_lower=t.value OR p.name_lower=t.value THEN 120 ELSE
  CASE WHEN instr(p.name_lower,t.value)=1 THEN 70 WHEN instr(p.name_lower,t.value)>0 THEN 45 ELSE 0 END +
  CASE WHEN instr(p.id_lower,t.value)=1 THEN 35 WHEN instr(p.id_lower,t.value)>0 THEN 24 ELSE 0 END +
  CASE WHEN instr(p.topic_words,' '||t.value||' ')>0 THEN 20 WHEN instr(p.topics,t.value)>0 THEN 12 ELSE 0 END +
  CASE WHEN instr(p.owner_lower,t.value)>0 THEN 10 ELSE 0 END +
  CASE WHEN instr(p.description_all,t.value)>0 THEN 8 ELSE 0 END END),0) FROM terms t) * p.quality`

export async function search(db, options) {
  const metrics = { rowsRead: 0, rowsWritten: 0, sqlMs: 0, queries: 0 }
  async function read(sql, parameters = []) {
    const result = await db.prepare(sql).bind(...parameters).all()
    metrics.rowsRead += result.meta?.rows_read || 0
    metrics.rowsWritten += result.meta?.rows_written || 0
    metrics.sqlMs += result.meta?.duration || 0
    metrics.queries++
    return result.results
  }
  const [build] = await read('SELECT document FROM build WHERE id=1')
  const meta = JSON.parse(build.document)
  if (options.version !== null && options.version !== meta.version) return { status: 409, error: 'Directory updated; restart pagination', version: meta.version, metrics }
  const terms = options.q.toLowerCase().split(/\s+/).filter(Boolean)
  const conditions = [], parameters = []
  if (options.manifest !== 'not_validated') conditions.push('p.candidate=0')
  for (const field of ['category', 'source', 'manifest', 'language']) {
    if (options[field] !== 'all') { conditions.push(`p.${field}=?`); parameters.push(options[field]) }
  }
  const unfiltered = ['category', 'source', 'manifest', 'language'].every(field => options[field] === 'all')
  const offset = (options.page - 1) * 30
  let total, positions
  if (!terms.length && options.sort === 'relevance' && unfiltered) {
    positions = (await read('SELECT pos FROM plugins WHERE pos<? ORDER BY pos LIMIT 30 OFFSET ?', [meta.count, offset])).map(row => row.pos)
    total = meta.count
  } else if (!terms.length && options.sort === 'relevance') {
    // Diversity depends on the filtered set. Filtering a globally diversified
    // list is not equivalent, so this experiment measures the small-row pass.
    const rows = await read(`SELECT pos,owner FROM plugins p WHERE ${conditions.join(' AND ') || '1'} ORDER BY default_rank`, parameters)
    total = rows.length
    positions = applyDiversity(rows).slice(offset, offset + 30).map(row => row.pos)
  } else {
    const sort = { relevance: '', stars: 'stars DESC,', forks: 'forks DESC,', new: 'pushed_rank,', added: 'added_rank,', manifest: 'CASE WHEN manifest=\'shape_validated\' THEN 1 ELSE 0 END DESC,stars DESC,' }[options.sort]
    const order = terms.length ? `${sort}relevance DESC,stars DESC,id_rank,original_order`
      : `${sort}original_order`
    if (terms.length) conditions.push(`NOT EXISTS (SELECT 1 FROM terms t WHERE instr(p.text_${options.locale},t.value)=0)`)
    const sql = `WITH terms AS (SELECT value FROM json_each(?)), matched AS MATERIALIZED (
      SELECT pos,original_order,stars,forks,manifest,pushed_rank,added_rank,id_rank,${terms.length ? textScore : '0'} AS relevance
      FROM plugins p WHERE ${conditions.join(' AND ') || '1'})
      SELECT count(*) AS total,(SELECT json_group_array(pos) FROM
        (SELECT pos FROM matched ORDER BY ${order} LIMIT 30 OFFSET ?)) AS positions FROM matched`
    const [result] = await read(sql, [JSON.stringify(terms), ...parameters, offset])
    total = result.total
    positions = JSON.parse(result.positions)
  }
  const cards = positions.length ? await read(`SELECT p.card FROM json_each(?) j JOIN plugins p ON p.pos=j.value ORDER BY j.key`, [JSON.stringify(positions)]) : []
  if (cards.length !== positions.length) throw new Error('Missing result cards')
  return { version: meta.version, generatedAt: meta.generatedAt, total, page: options.page, pageSize: 30,
    items: cards.map(row => JSON.parse(row.card)), categories: meta.categories, metrics }
}
