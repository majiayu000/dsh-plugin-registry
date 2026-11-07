import { columns, literal } from './build.mjs'

// Offline planning/local transactional validation only. No cloud credentials or
// executor: a production publisher must make the same atomic version check.
export function planDelta(db, projection) {
  const previous = JSON.parse(db.prepare('SELECT document FROM build WHERE id=1').get().document)
  const names = Object.keys(columns)
  // node:sqlite text reads truncate at NUL; a BLOB round-trip preserves the
  // exact UTF-8 string for delta comparisons. This changes no stored values.
  const fields = names.map(name => columns[name] === 'TEXT' ? `CAST(${name} AS BLOB) AS ${name}` : name)
  const oldRows = new Map(db.prepare(`SELECT ${fields.join(',')} FROM plugins`).all()
    .map(row => [row.pos, names.map(name => row[name] instanceof Uint8Array ? new TextDecoder().decode(row[name]) : row[name])]))
  const oldIdentities = new Map([...oldRows.values()].map(row => [row[names.indexOf('id')].toLowerCase(), row[0]]))
  const upserts = []
  const textColumns = ['text_zh', 'text_en'].map(name => names.indexOf(name))
  let textChanges = 0, inserted = 0, updated = 0
  for (const row of projection.rows) {
    const identity = row[names.indexOf('id')].toLowerCase()
    if (oldIdentities.has(identity) && oldIdentities.get(identity) !== row[0]) throw new Error('Projection must preserve existing plugin positions')
    const old = oldRows.get(row[0])
    if (JSON.stringify(old) !== JSON.stringify(row)) {
      upserts.push(row)
      if (old) updated++; else inserted++
      if (!old || textColumns.some(i => old[i] !== row[i])) textChanges++
    }
    oldRows.delete(row[0])
  }
  const derived = {}
  for (const [table, key, rows] of [['rank_blocks', 'block', projection.rankBlocks], ['home_pages', 'page', projection.homePages]]) {
    const old = new Map(db.prepare(`SELECT ${key},document FROM ${table}`).all().map(row => [row[key], row.document]))
    const upserts = []
    for (const row of rows) {
      if (old.get(row[0]) !== row[1]) upserts.push(row)
      old.delete(row[0])
    }
    derived[table] = { upserts, deletes: [...old.keys()] }
  }
  const { version: oldVersion, ...oldMeta } = previous
  const { version: newVersion, ...newMeta } = projection.meta
  const changed = upserts.length || oldRows.size || Object.values(derived).some(table => table.upserts.length || table.deletes.length) || JSON.stringify(oldMeta) !== JSON.stringify(newMeta)
  if (changed && oldVersion === newVersion) throw new Error('Changed projection requires a new version')
  return { baseVersion: oldVersion, meta: changed ? projection.meta : previous,
    upserts, derived, deletes: [...oldRows.keys()], changed: Boolean(changed),
    stats: { inserted, updated, deleted: oldRows.size, textChanges, rankBlockWrites: derived.rank_blocks.upserts.length + derived.rank_blocks.deletes.length, homePageWrites: derived.home_pages.upserts.length + derived.home_pages.deletes.length, metadataWrites: Number(Boolean(changed)) } }
}

export function applyDeltaLocal(db, plan) {
  // This validates real SQLite rollback and FTS triggers, not D1 publication.
  db.exec('BEGIN IMMEDIATE')
  try {
    const current = JSON.parse(db.prepare('SELECT document FROM build WHERE id=1').get().document)
    if (current.version !== plan.baseVersion) throw new Error('Stale delta base')
    const names = Object.keys(columns)
    for (const pos of plan.deletes) db.prepare('DELETE FROM plugins WHERE pos=?').run(pos)
    for (const row of plan.upserts) {
      db.exec(`INSERT INTO plugins (${names.join(',')}) VALUES (${row.map(literal).join(',')})
        ON CONFLICT(pos) DO UPDATE SET ${names.slice(1).map(name => `${name}=excluded.${name}`).join(',')}`)
    }
    for (const [table, key] of [['rank_blocks', 'block'], ['home_pages', 'page']]) {
      for (const id of plan.derived[table].deletes) db.prepare(`DELETE FROM ${table} WHERE ${key}=?`).run(id)
      for (const row of plan.derived[table].upserts) {
        db.prepare(`INSERT INTO ${table} VALUES (?,?) ON CONFLICT(${key}) DO UPDATE SET document=excluded.document`).run(...row)
      }
    }
    if (plan.changed) db.prepare('UPDATE build SET document=? WHERE id=1').run(JSON.stringify(plan.meta))
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
