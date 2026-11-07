import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { buildSearchDocument } from '../../scripts/build-search-index.mjs'
import { QUERY_COLUMN as C } from '../../functions/lib/query-index.js'
import { blendSearchQuality } from '../../assets/registry-ranking.js'

export const columns = {
  pos: 'INTEGER PRIMARY KEY', original_order: 'INTEGER', id: 'TEXT', owner: 'TEXT', category: 'TEXT', source: 'TEXT',
  manifest: 'TEXT', language: 'TEXT', candidate: 'INTEGER', stars: 'REAL', forks: 'REAL',
  default_rank: 'INTEGER', pushed_rank: 'INTEGER', added_rank: 'INTEGER', id_rank: 'INTEGER',
  quality: 'REAL', id_lower: 'TEXT', name_lower: 'TEXT', owner_lower: 'TEXT',
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

export function buildProjection(registry, audit) {
  const { index, cards } = buildSearchDocument(registry, audit)
  const defaults = new Map(index.orders.relevance.map((pos, rank) => [pos, rank]))
  const home = new Map(index.home.map((pos, rank) => [pos, rank]))
  const idRanks = ranks(index.entries, (a, b) => a[C.id].localeCompare(b[C.id]))
  const pushed = ranks(index.entries, (a, b) => b[C.pushedAt].localeCompare(a[C.pushedAt]))
  const added = ranks(index.entries, (a, b) => b[C.addedAt].localeCompare(a[C.addedAt]))
  const meta = { version: randomUUID(), generatedAt: index.generatedAt, count: registry.plugins.length, categories: registry.categories }
  const rows = index.entries.map((entry, pos) => {
    const text = locale => {
      const offset = locale === 'zh' ? 0 : 2
      const [start, length] = entry[C.descriptionRanges].slice(offset, offset + 2)
      const category = registry.categories[entry[C.category]]
      return [entry[C.idLower] ?? entry[C.id], entry[C.description].slice(start, start + length),
        entry[C.ownerLower] ?? entry[C.owner], category ? category[locale] || category.zh || category.en || entry[C.category] : entry[C.category],
        entry[C.extra], entry[C.topics]].join(' ').toLowerCase()
    }
    // Store published rows in home order using SQLite's existing rowid index.
    // Retain snapshot order separately for stable query-sort ties.
    return [home.get(pos) ?? pos, pos, entry[C.id], entry[C.owner], entry[C.category], entry[C.source], entry[C.manifest], entry[C.language],
      Number(entry[C.candidate]), entry[C.stars], entry[C.forks] || 0, defaults.get(pos), pushed[pos], added[pos], idRanks[pos],
      blendSearchQuality(1, entry[C.score]), entry[C.idLower] ?? entry[C.id], entry[C.name], entry[C.ownerLower] ?? entry[C.owner],
      entry[C.description], entry[C.topics], ' ' + entry[C.topics].split(/\s+/).join(' ') + ' ', text('zh'), text('en'),
      JSON.stringify(cards[entry[C.id].toLowerCase()])]
  })
  const statements = [
    `CREATE TABLE plugins (${Object.entries(columns).map(([name, type]) => `${name} ${type}`).join(',')});`,
    'CREATE TABLE build (id INTEGER PRIMARY KEY, document TEXT);',
    `INSERT INTO build VALUES (1,${literal(JSON.stringify(meta))});`,
  ]
  let values = [], bytes = 0
  for (const row of rows) {
    const value = '(' + row.map(literal).join(',') + ')'
    const size = Buffer.byteLength(value)
    if (size > 90000) throw new Error('A projection row exceeds the D1 SQL statement budget')
    if (bytes + size > 90000) { statements.push('INSERT INTO plugins VALUES ' + values.join(',') + ';'); values = []; bytes = 0 }
    values.push(value); bytes += size + 1
  }
  if (values.length) statements.push('INSERT INTO plugins VALUES ' + values.join(',') + ';')
  statements.push(indexSQL, 'PRAGMA optimize;')
  return { sql: statements.join('\n'), meta, index, rows, rowCount: rows.length }
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
