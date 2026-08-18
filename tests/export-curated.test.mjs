import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { promisify } from 'node:util'

const run = promisify(execFile)
const repoRoot = resolve(import.meta.dirname, '..')

test('export merges into the vendored catalog and preserves entries absent from the snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hr-export-'))
  await mkdir(join(root, 'sources'), { recursive: true })
  const snapshot = join(root, 'plugins.json')
  const vendored = join(root, 'sources', 'curated.json')

  const published = {
    id: 'acme/live-plugin', name: 'live-plugin', owner: 'acme',
    url: 'https://github.com/acme/live-plugin',
    description: { zh: '在列插件', en: 'Listed plugin' }, category: 'tools',
    topics: [], install: 'dsh plugin --profile web add github:acme/live-plugin',
    icon: 'https://github.com/acme.png?size=96',
    addedAt: '2026-01-01T00:00:00.000Z', stars: 5, forks: 1,
    source: 'curated', trustLevel: 'curated',
    verification: { manifest: 'not_checked', patch: 'not_checked', installation: 'not_tested' },
  }
  await writeFile(snapshot, JSON.stringify({ generatedAt: '2026-08-16T00:00:00.000Z', plugins: [published] }))
  // 归档后被快照移除的条目：一次导出不允许把它从 vendored 目录里删掉
  const archived = {
    id: 'acme/archived-plugin', name: 'archived-plugin', owner: 'acme',
    url: 'https://github.com/acme/archived-plugin',
    description: { zh: '', en: '' }, category: 'tools', topics: [],
    install: 'dsh plugin --profile web add github:acme/archived-plugin',
    icon: 'https://github.com/acme.png?size=96', added: null, stars: 0, forks: 0,
  }
  await writeFile(vendored, JSON.stringify({ updated: '2026-01-01T00:00:00.000Z', plugins: [archived] }))

  await run(process.execPath, [join(repoRoot, 'scripts', 'export-curated.mjs'), snapshot], { cwd: root })
  const exported = JSON.parse(await readFile(vendored, 'utf8'))
  const ids = exported.plugins.map(plugin => plugin.id).sort()
  assert.deepEqual(ids, ['acme/archived-plugin', 'acme/live-plugin'])
  assert.equal(exported.updated, '2026-08-16T00:00:00.000Z')
})

const livePlugin = {
  id: 'acme/live-plugin', name: 'live-plugin', owner: 'acme',
  url: 'https://github.com/acme/live-plugin',
  description: { zh: '在列插件', en: 'Listed plugin' }, category: 'tools',
  topics: [], install: 'dsh plugin --profile web add github:acme/live-plugin',
  icon: 'https://github.com/acme.png?size=96',
  addedAt: '2026-01-01T00:00:00.000Z', stars: 5, forks: 1,
  source: 'curated', trustLevel: 'curated',
  verification: { manifest: 'not_checked', patch: 'not_checked', installation: 'not_tested' },
}

test('export refuses to overwrite a corrupt vendored catalog', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hr-export-bad-'))
  await mkdir(join(root, 'sources'), { recursive: true })
  const snapshot = join(root, 'plugins.json')
  const vendored = join(root, 'sources', 'curated.json')
  await writeFile(snapshot, JSON.stringify({ generatedAt: '2026-08-16T00:00:00.000Z', plugins: [livePlugin] }))
  const damaged = '{not-json'
  await writeFile(vendored, damaged)

  await assert.rejects(
    () => run(process.execPath, [join(repoRoot, 'scripts', 'export-curated.mjs'), snapshot], { cwd: root }),
    error => {
      assert.match(String(error.stderr || error.message), /SyntaxError|JSON/)
      return true
    },
  )
  assert.equal(await readFile(vendored, 'utf8'), damaged)
})

test('export starts a new vendored catalog when the file is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hr-export-new-'))
  await mkdir(join(root, 'sources'), { recursive: true })
  const snapshot = join(root, 'plugins.json')
  const vendored = join(root, 'sources', 'curated.json')
  await writeFile(snapshot, JSON.stringify({ generatedAt: '2026-08-16T00:00:00.000Z', plugins: [livePlugin] }))

  await run(process.execPath, [join(repoRoot, 'scripts', 'export-curated.mjs'), snapshot], { cwd: root })
  const exported = JSON.parse(await readFile(vendored, 'utf8'))
  assert.deepEqual(exported.plugins.map(plugin => plugin.id), ['acme/live-plugin'])
})
