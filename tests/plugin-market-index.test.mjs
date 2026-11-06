import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import semver from 'semver'
import { marketInstallTarget, parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'
import { dshRange, exportPluginIndex, runExport } from '../scripts/export-plugin-index.mjs'

const SHA = '1234567890123456789012345678901234567890'
const DATE = '2026-10-04T12:00:00Z'
function plugin(overrides = {}) {
  return {
    id: 'owner/bundle', packageName: '@owner/bundle', profile: 'web',
    url: 'https://github.com/owner/bundle', verifiedCommit: SHA,
    install: `dsh plugin --profile web add github:owner/bundle#${SHA}`,
    verification: { manifest: 'shape_validated', patch: 'exists' },
    latestRelease: { tag: 'v99.0.0', publishedAt: '2030-01-01T00:00:00Z' },
    ...overrides,
  }
}
function manifest(overrides = {}) {
  return { name: '@owner/bundle', version: '1.2.3', description: 'A bundle', dsh: { bundle: { patch: './cordis.patch.yml' } }, ...overrides }
}
function metadata(value = manifest()) {
  return { commit: { oid: SHA, committedDate: DATE }, manifest: { text: JSON.stringify(value) } }
}
function github(value = metadata(), observe = () => {}) {
  return async (url, options) => {
    const { query } = JSON.parse(options.body)
    observe(query, url, options)
    const aliases = [...query.matchAll(/(r\d+): repository/g)].map(match => match[1])
    return { ok: true, json: async () => ({ data: Object.fromEntries(aliases.map(alias => [alias, value])) }) }
  }
}
async function generate(plugins = [plugin()], value = manifest(), extra = {}) {
  return exportPluginIndex({ snapshot: { plugins }, token: 'test-token', fetchImpl: github(metadata(value)), ...extra })
}

test('root Git export preserves the verified SHA, reads package version and committer time', async () => {
  let query
  const { index, stats } = await generate(undefined, undefined, { fetchImpl: github(metadata(), value => { query = value }) })
  const record = index.plugins[0]
  assert.equal(record.name, '@owner/bundle')
  assert.equal(record.versions[0].version, '1.2.3')
  assert.equal(record.versions[0].publishTimestamp, Date.parse(DATE) / 1000)
  assert.equal(record.versions[0].source.commit, SHA)
  assert.match(query, new RegExp(`${SHA}:package.json`))
  assert.doesNotMatch(query, /HEAD|defaultBranchRef/)
  assert.equal(marketInstallTarget(record.name, record.versions[0]).spec, `git+https://github.com/owner/bundle.git#${SHA}`)
  assert.equal(stats.exported, 1)
})

test('monorepo path is taken from the full tree URL; basename-only entries are skipped', async () => {
  const child = plugin({ id: 'owner/bundle#child', url: 'https://github.com/owner/bundle/tree/main/packages/deep/child' })
  let query
  const { index } = await generate([child], undefined, { fetchImpl: github(metadata(), value => { query = value }) })
  assert.match(query, new RegExp(`${SHA}:packages/deep/child/package.json`))
  assert.equal(index.plugins[0].repository.directory, 'packages/deep/child')
  assert.equal(index.plugins[0].versions[0].source.path, 'packages/deep/child')
  assert.equal(marketInstallTarget(index.plugins[0].name, index.plugins[0].versions[0]).spec, `git+https://github.com/owner/bundle.git#${SHA}&path:/packages/deep/child`)
  const skipped = await generate([plugin({ id: 'owner/bundle#child' })])
  assert.equal(skipped.stats.skipped.directory_unknown, 1)
  assert.equal(skipped.stats.fetched, 0)
})

test('npm, unpinned, unverified, non-Web and mismatched repositories are not converted', async () => {
  const candidates = [
    plugin({ install: 'dsh plugin --profile web add @owner/bundle' }),
    plugin({ install: 'dsh plugin --profile web add github:owner/bundle#main' }),
    plugin({ verification: { manifest: 'shape_validated', patch: 'missing' } }),
    plugin({ profile: 'headless' }),
    plugin({ url: 'https://github.com/another/bundle' }),
  ]
  const result = await generate(candidates, undefined, { fetchImpl: () => assert.fail('no network for ineligible rows') })
  assert.equal(result.index.plugins.length, 0)
  assert.deepEqual(result.stats.skipped, { not_github: 1, not_pinned: 1, not_verified: 1, not_web: 1, repository_mismatch: 1 })
})

test('same package name from different repositories excludes every conflicting row', async () => {
  const other = plugin({ id: 'other/bundle', url: 'https://github.com/other/bundle', install: `dsh plugin --profile web add github:other/bundle#${SHA}` })
  const result = await generate([plugin(), other], undefined, { fetchImpl: () => assert.fail('collisions need no fetch') })
  assert.equal(result.stats.skipped.package_name_conflict, 2)
  assert.equal(result.stats.exported, 0)
})

test('published npm package blocks a different repository using the same package name', async () => {
  const canonical = plugin({ id: 'canonical/bundle', url: 'https://github.com/canonical/bundle', install: 'dsh plugin --profile web add @owner/bundle' })
  const result = await generate([plugin(), canonical], undefined, { fetchImpl: () => assert.fail('cross-source conflict must not fetch') })
  assert.deepEqual(result.stats.skipped, { not_github: 1, package_name_conflict: 1 })
  assert.equal(result.stats.exported, 0)
  const sameRepository = plugin({ install: 'dsh plugin --profile web add @owner/bundle' })
  assert.equal((await generate([plugin(), sameRepository])).stats.exported, 1)
})

test('private manifests are excluded even when the snapshot verified a public Git repository', async () => {
  const result = await generate(undefined, manifest({ private: true }))
  assert.equal(result.stats.skipped.package_private, 1)
  assert.equal(result.stats.exported, 0)
  assert.equal((await generate(undefined, manifest({ private: false }))).stats.exported, 1)
})

test('native index preserves website display metadata and refreshes it when package evidence is cached', async () => {
  const row = plugin({ name: 'Visible bundle', owner: 'owner', category: 'tools', description: { en: 'Searchable English', zh: '可搜索的中文' }, icon: 'https://example.org/icon.svg' })
  const snapshot = { categories: { tools: { en: 'Tools', zh: '工具' } }, plugins: [row] }
  const initial = await generate(undefined, undefined, { snapshot })
  const entry = initial.index.plugins[0]
  assert.deepEqual(entry.description, row.description)
  assert.equal(entry.title, row.name)
  assert.equal(entry.author, row.owner)
  assert.equal(entry.icon, row.icon)
  assert.equal(entry.metadata.category, 'tools')
  assert.deepEqual(initial.index.metadata.categories.tools.title, snapshot.categories.tools)
  const next = { ...row, description: { en: 'Edited English', zh: '更新中文' }, icon: 'https://example.org/new.svg' }
  const cached = await generate(undefined, undefined, { snapshot: { ...snapshot, plugins: [next] }, previous: initial.index, token: '', fetchImpl: () => assert.fail('same package evidence should be reused') })
  assert.equal(cached.stats.cached, 1)
  assert.deepEqual(cached.index.plugins[0].description, next.description)
  assert.equal(cached.index.plugins[0].icon, next.icon)
  const empty = await generate([plugin({ description: { en: '', zh: '' } })])
  assert.equal(Object.hasOwn(empty.index.plugins[0], 'description'), false)
  await assert.rejects(generate([plugin({ description: { en: 42 } })]), /description.en/)
  await assert.rejects(generate([plugin({ category: 'undeclared' })]), /undeclared/)
})

test('identical targets deduplicate; conflicting commits for one package are not chosen arbitrarily', async () => {
  const duplicate = await generate([plugin(), plugin()])
  assert.equal(duplicate.stats.exported, 1)
  assert.equal(duplicate.stats.skipped.duplicate_target, 1)
  const otherSha = 'f'.repeat(40)
  const conflict = await generate([plugin(), plugin({ verifiedCommit: otherSha, install: `dsh plugin --profile web add github:owner/bundle#${otherSha}` })])
  assert.equal(conflict.stats.exported, 0)
  assert.equal(conflict.stats.skipped.package_name_conflict, 2)
})

test('official DSH range semantics keep explicit precedence, workspace peers and prerelease intersection', () => {
  assert.equal(dshRange({ engines: { dsh: '^0.2.0' }, peerDependencies: { '@deepseek-ai/dsh': '^9.0.0' } }), '^0.2.0')
  assert.equal(dshRange({ peerDependencies: { '@deepseek-ai/dsh': 'workspace:*', '@deepseek-ai/dsh-api': 'workspace:^', '@deepseek-ai/dsh-ui': 'workspace:~', other: '^99.0.0' } }), undefined)
  const range = dshRange({ peerDependencies: { '@deepseek-ai/dsh': '>=0.2.0-rc.1 <0.3.0', '@deepseek-ai/dsh-ui': '>=0.2.1-rc.1 <0.2.2' } })
  assert.equal(semver.satisfies('0.2.1-rc.5', range, { includePrerelease: true }), true)
  assert.equal(semver.satisfies('0.2.0', range, { includePrerelease: true }), false)
  assert.ok(dshRange({ peerDependencies: { '@deepseek-ai/dsh': '^1.0.0', '@deepseek-ai/dsh-ui': '^2.0.0' } }) instanceof Error)
  assert.ok(dshRange({ engines: { dsh: 'workspace:^0.2.0' } }) instanceof Error)
})

test('missing/invalid version, invalid engines and changed package identity are skipped, never inferred', async () => {
  for (const [value, reason] of [
    [manifest({ version: undefined }), 'index_metadata_invalid'],
    [manifest({ version: 'v1.2.3' }), 'index_metadata_invalid'],
    [manifest({ engines: { dsh: 'not-a-range' } }), 'engines_invalid'],
    [manifest({ name: '@different/package' }), 'package_name_mismatch'],
    [manifest({ dsh: {} }), 'bundle_invalid'],
  ]) {
    const result = await generate([plugin()], value)
    assert.equal(result.stats.skipped[reason], 1)
    assert.equal(result.stats.exported, 0)
  }
  const result = await generate([plugin()], manifest({ engines: { dsh: '>=0.2.0' } }))
  assert.equal(result.index.plugins[0].versions[0].engines.dsh, '>=0.2.0')
})

test('cache reuse requires the same repository, directory, commit and package name', async () => {
  const initial = await generate()
  const cached = await generate(undefined, undefined, { previous: initial.index, token: '', fetchImpl: () => assert.fail('unchanged commit must use cache') })
  assert.equal(cached.stats.cached, 1)
  assert.deepEqual(cached.index, initial.index)
  const changed = SHA.replace(/^1/, 'a')
  const entry = plugin({ verifiedCommit: changed, install: `dsh plugin --profile web add github:owner/bundle#${changed}` })
  const value = { ...metadata(), commit: { oid: changed, committedDate: DATE } }
  const refreshed = await generate([entry], undefined, { previous: initial.index, fetchImpl: github(value) })
  assert.equal(refreshed.stats.fetched, 1)
  assert.equal(refreshed.index.plugins[0].versions[0].source.commit, changed)
  const child = plugin({ id: 'owner/bundle#nested', url: 'https://github.com/owner/bundle/tree/main/packages/nested' })
  assert.equal((await generate([child], undefined, { previous: initial.index })).stats.fetched, 1)
})

test('GraphQL absent objects are skipped; unknown failures and incomplete data abort', async () => {
  const missing = await generate(undefined, undefined, { fetchImpl: github({ commit: metadata().commit, manifest: null }) })
  assert.equal(missing.stats.skipped.manifest_missing, 1)
  const absent = await generate(undefined, undefined, { fetchImpl: async () => ({ ok: true, json: async () => ({ data: { r0: null }, errors: [{ type: 'NOT_FOUND', path: ['r0'] }] }) }) })
  assert.equal(absent.stats.skipped.repository_missing, 1)
  for (const fetchImpl of [
    async () => { throw new Error('network disconnected') },
    async () => ({ ok: false, status: 429 }),
    async () => ({ ok: true, json: async () => ({ data: { r0: null }, errors: [{ type: 'RATE_LIMITED', path: ['r0'] }] }) }),
    async () => ({ ok: true, json: async () => ({ data: {} }) }),
    github({ ...metadata(), commit: { oid: 'f'.repeat(40), committedDate: DATE } }),
  ]) await assert.rejects(generate(undefined, undefined, { fetchImpl }))
})

test('metadata requests batch at most 40 entries with bounded concurrency and preserve snapshot ordering', async () => {
  let active = 0
  let maximum = 0
  const sizes = []
  const plugins = Array.from({ length: 171 }, (_, i) => plugin({ id: `owner/repo${i}`, packageName: `package-${i}`, url: `https://github.com/owner/repo${i}`, install: `dsh plugin --profile web add github:owner/repo${i}#${SHA}` }))
  const fetchImpl = async (_url, options) => {
    active++
    maximum = Math.max(maximum, active)
    const { query } = JSON.parse(options.body)
    const matches = [...query.matchAll(/(r\d+): repository\(owner: "owner", name: "repo(\d+)"\)/g)]
    sizes.push(matches.length)
    await new Promise(resolve => setTimeout(resolve, 5))
    active--
    return { ok: true, json: async () => ({ data: Object.fromEntries(matches.map(([, alias, i]) => [alias, metadata(manifest({ name: `package-${i}` }))])) }) }
  }
  const result = await generate(plugins, undefined, { fetchImpl })
  assert.deepEqual(sizes, [40, 40, 40, 40, 11])
  assert.equal(maximum, 4)
  assert.deepEqual(result.index.plugins.map(p => p.name), plugins.map(p => p.packageName))
})

test('failed refresh leaves the old artifact byte-for-byte intact; successful refresh is parseable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plugin-index-test-'))
  try {
    const dir = join(root, 'public/data')
    await mkdir(dir, { recursive: true })
    const old = JSON.stringify({ format: 1, title: 'previous index', plugins: [] }, null, 2) + '\n'
    await writeFile(join(dir, 'plugins.json'), JSON.stringify({ plugins: [plugin()] }))
    await writeFile(join(dir, 'plugin-index.json'), old)
    await assert.rejects(runExport({ root, token: 'test-token', fetchImpl: async () => { throw new Error('network unavailable') } }), /network unavailable/)
    assert.equal(await readFile(join(dir, 'plugin-index.json'), 'utf8'), old)
    assert.deepEqual((await readdir(dir)).sort(), ['plugin-index.json', 'plugins.json'])
    await runExport({ root, token: 'test-token', fetchImpl: github() })
    const saved = JSON.parse(await readFile(join(dir, 'plugin-index.json'), 'utf8'))
    assert.equal(parseMarketIndex(saved, 'https://example.org/index.json').plugins[0].versions[0].source.commit, SHA)
  } finally { await rm(root, { recursive: true, force: true }) }
})
