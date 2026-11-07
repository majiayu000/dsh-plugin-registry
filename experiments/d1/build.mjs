import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { buildSearchDocument } from '../shared/build-search-index.mjs'
import { QUERY_COLUMN as C } from '../shared/query-index.js'
import { blendSearchQuality } from '../../assets/registry-ranking.js'

export const columns = {
  pos: 'INTEGER PRIMARY KEY', id: 'TEXT', owner: 'TEXT', category: 'TEXT', source: 'TEXT',
  manifest: 'TEXT', language: 'TEXT', candidate: 'INTEGER', stars: 'REAL', forks: 'REAL',
  id_lower: 'TEXT', name_lower: 'TEXT', owner_lower: 'TEXT',
  description_all: 'TEXT', topics: 'TEXT', topic_words: 'TEXT', text_zh: 'TEXT', text_en: 'TEXT', card: 'TEXT',
}

function ranks(entries, compare) {
  const order = entries.map((_, i) => i).sort((a, b) => compare(entries[a], entries[b]))
  const result = []
  let rank = 0
  order.forEach((position, i) => {
    if (i && compare(entries[order[i - 1]], entries[position])) rank++
    result[position] = rank
  })
  return result
}

export function literal(value) {
  if (value == null) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (!value.isWellFormed()) throw new Error('D1 projection cannot preserve unpaired UTF-16 surrogates')
  if (value.includes('\0')) return `CAST(X'${Buffer.from(value).toString('hex')}' AS TEXT)`
  return `'${value.replaceAll("'", "''")}'`
}

// The index is only a candidate filter. Exact locale/substring predicates remain
// in query.js. Replacing NUL preserves candidates after embedded NUL characters.
export const indexSQL = `CREATE VIEW search_content AS SELECT pos,replace(text_zh,char(0),' ') AS text_zh,replace(text_en,char(0),' ') AS text_en FROM plugins;
CREATE VIRTUAL TABLE search_terms USING fts5(text_zh,text_en,
  content='search_content',content_rowid='pos',tokenize='trigram case_sensitive 1',detail=none,columnsize=0);
INSERT INTO search_terms(rowid,text_zh,text_en)
  SELECT pos,replace(text_zh,char(0),' '),replace(text_en,char(0),' ') FROM plugins;
CREATE TRIGGER plugins_insert AFTER INSERT ON plugins BEGIN
  INSERT INTO search_terms(rowid,text_zh,text_en) VALUES(new.pos,replace(new.text_zh,char(0),' '),replace(new.text_en,char(0),' '));
END;
CREATE TRIGGER plugins_delete AFTER DELETE ON plugins BEGIN
  INSERT INTO search_terms(search_terms,rowid,text_zh,text_en)
    VALUES('delete',old.pos,replace(old.text_zh,char(0),' '),replace(old.text_en,char(0),' '));
END;
CREATE TRIGGER plugins_text_update AFTER UPDATE ON plugins
WHEN old.text_zh IS NOT new.text_zh OR old.text_en IS NOT new.text_en BEGIN
  INSERT INTO search_terms(search_terms,rowid,text_zh,text_en)
    VALUES('delete',old.pos,replace(old.text_zh,char(0),' '),replace(old.text_en,char(0),' '));
  INSERT INTO search_terms(rowid,text_zh,text_en) VALUES(new.pos,replace(new.text_zh,char(0),' '),replace(new.text_en,char(0),' '));
END;`

// Rank tuple: [snapshot order, default rank, pushed rank, added rank, id rank, quality].
// Exactly 256 slots per block; missing/deleted identities occupy null slots.
export const RANK_BLOCK_SIZE = 256

export function readIdentities(db) {
  return new Map(db.prepare('SELECT id,pos FROM plugins').all().map(row => [row.id.toLowerCase(), row.pos]))
}

export function buildProjection(registry, audit, previousIdentities = new Map()) {
  const { index, cards } = buildSearchDocument(registry, audit)
  const defaults = new Map(index.orders.relevance.map((pos, rank) => [pos, rank]))
  const idRanks = ranks(index.entries, (a, b) => a[C.id].localeCompare(b[C.id]))
  const pushed = ranks(index.entries, (a, b) => b[C.pushedAt].localeCompare(a[C.pushedAt]))
  const added = ranks(index.entries, (a, b) => b[C.addedAt].localeCompare(a[C.addedAt]))
  const meta = { version: randomUUID(), generatedAt: index.generatedAt, count: registry.plugins.length, categories: registry.categories }
  let nextPos = 0
  for (const pos of previousIdentities.values()) nextPos = Math.max(nextPos, pos + 1)
  const identities = new Map()
  const positions = index.entries.map(entry => {
    const id = entry[C.id].toLowerCase()
    if (identities.has(id)) throw new Error(`Duplicate plugin identity: ${id}`)
    const pos = previousIdentities.get(id) ?? nextPos++
    identities.set(id, pos)
    return pos
  })
  const blocks = new Map()
  const rows = index.entries.map((entry, order) => {
    const pos = positions[order]
    const block = Math.floor(pos / RANK_BLOCK_SIZE)
    if (!blocks.has(block)) blocks.set(block, Array(RANK_BLOCK_SIZE).fill(null))
    blocks.get(block)[pos % RANK_BLOCK_SIZE] = [order, defaults.get(order), pushed[order], added[order], idRanks[order], blendSearchQuality(1, entry[C.score])]
    const text = locale => {
      const offset = locale === 'zh' ? 0 : 2
      const [start, length] = entry[C.descriptionRanges].slice(offset, offset + 2)
      const category = registry.categories[entry[C.category]]
      return [entry[C.idLower] ?? entry[C.id], entry[C.description].slice(start, start + length),
        entry[C.ownerLower] ?? entry[C.owner], category ? category[locale] || category.zh || category.en || entry[C.category] : entry[C.category],
        entry[C.extra], entry[C.topics]].join(' ').toLowerCase()
    }
    return [pos, entry[C.id], entry[C.owner], entry[C.category], entry[C.source], entry[C.manifest], entry[C.language],
      Number(entry[C.candidate]), entry[C.stars], entry[C.forks] || 0,
      entry[C.idLower] ?? entry[C.id], entry[C.name], entry[C.ownerLower] ?? entry[C.owner],
      entry[C.description], entry[C.topics], ' ' + entry[C.topics].split(/\s+/).join(' ') + ' ', text('zh'), text('en'),
      JSON.stringify(cards[entry[C.id].toLowerCase()])]
  })
  const rankBlocks = [...blocks].sort((a, b) => a[0] - b[0]).map(([block, values]) => [block, JSON.stringify(values)])
  const homePages = []
  for (let start = 0; start < index.home.length; start += 30) {
    homePages.push([start / 30, JSON.stringify(index.home.slice(start, start + 30).map(order => positions[order]))])
  }
  const statements = [
    `CREATE TABLE plugins (${Object.entries(columns).map(([name, type]) => `${name} ${type}`).join(',')});`,
    'CREATE TABLE build (id INTEGER PRIMARY KEY, document TEXT);',
    'CREATE TABLE rank_blocks (block INTEGER PRIMARY KEY, document TEXT NOT NULL);',
    'CREATE TABLE home_pages (page INTEGER PRIMARY KEY, document TEXT NOT NULL);',
    `INSERT INTO build VALUES (1,${literal(JSON.stringify(meta))});`,
  ]
  for (const [table, tableRows] of [['plugins', rows], ['rank_blocks', rankBlocks], ['home_pages', homePages]]) {
      let values = [], bytes = 0
      for (const row of tableRows) {
        const value = '(' + row.map(literal).join(',') + ')'
        const size = Buffer.byteLength(value)
        if (size > 90000) throw new Error('A projection row exceeds the D1 SQL statement budget')
        if (bytes + size > 90000) { statements.push(`INSERT INTO ${table} VALUES ` + values.join(',') + ';'); values = []; bytes = 0 }
        values.push(value); bytes += size + 1
      }
      if (values.length) statements.push(`INSERT INTO ${table} VALUES ` + values.join(',') + ';')
  }
  statements.push(indexSQL, 'PRAGMA optimize;')
  return { sql: statements.join('\n'), meta, index, rows, rankBlocks, homePages, identities, rowCount: rows.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const registry = JSON.parse(await readFile('public/data/plugins.json', 'utf8'))
  const audit = JSON.parse(await readFile('public/data/registry-audit.json', 'utf8'))
  const projection = buildProjection(registry, audit)
  const directory = resolve('.generated/d1')
  await mkdir(directory, { recursive: true })
  await writeFile(`${directory}/seed.sql`, projection.sql)
  await writeFile(`${directory}/meta.json`, JSON.stringify(projection.meta))
  await rm(`${directory}/local.sqlite`, { force: true })
  const db = new DatabaseSync(`${directory}/local.sqlite`)
  db.exec('BEGIN'); db.exec(projection.sql); db.exec('COMMIT')
  const size = db.prepare('SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()').get()
  db.close()
  console.log(JSON.stringify({ rows: projection.rowCount, sqlBytes: Buffer.byteLength(projection.sql), databaseBytes: size.bytes, version: projection.meta.version }))
}
