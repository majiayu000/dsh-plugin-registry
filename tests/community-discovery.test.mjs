import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { communityRepositoryCandidates } from '../scripts/sync-plugins.mjs'

const run = promisify(execFile)
const syncScript = resolve(import.meta.dirname, '../scripts/sync-plugins.mjs')
const communityUrl = 'https://awesome-dsh-plugin.com/plugins.json'
const documentOf = plugins => ({ updated: '2026-11-07', count: plugins.length, plugins })

test('community discovery extracts repository identities only, deduplicates roots and excludes invalid/private entries', () => {
  const input = documentOf([
    { url: 'https://github.com/Acme/dsh-bundle', install: 'untrusted command', trustLevel: 'curated' },
    { url: 'https://github.com/acme/dsh-bundle/tree/main/packages/child' },
    { url: 'https://github.com/acme/private', private: true },
    { url: 'https://github.com/acme/also-private', isPrivate: true },
    { url: 'https://gitlab.com/acme/bundle' },
    { url: 'https://github.com.evil.example/acme/bundle' },
    { url: 'https://token@github.com/acme/bundle' },
    { url: 'https://github.com/acme/bundle?private=true' },
    { url: 'https://github.com/acme/bundle/issues/1' },
    { url: 'javascript:alert(1)' },
  ])
  assert.deepEqual(communityRepositoryCandidates(input), [{ full_name: 'acme/dsh-bundle' }])
  for (const value of [null, [], { plugins: [] }, documentOf([null]), documentOf([{}]), { ...documentOf([]), count: 1 }, { ...documentOf([]), updated: 'unknown' }]) {
    assert.throws(() => communityRepositoryCandidates(value), /incomplete or unknown/)
  }
})

async function fixture(t, { mode = 'normal', authenticated = true, previous } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'registry-community-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'sources'))
  const manual = name => ({ id: `acme/${name}`, name, owner: 'acme', url: `https://github.com/acme/${name}`, category: 'tools', description: { en: 'Human curated description', zh: '人工说明' }, install: `dsh plugin --profile web add github:acme/${name}` })
  const curated = JSON.stringify({ plugins: authenticated ? [manual('dsh-manual'), manual('dsh-private'), manual('dsh-unknown'), manual('dsh-missing')] : [] })
  await writeFile(join(root, 'sources/curated.json'), curated)
  await writeFile(join(root, 'sources/blocklist.json'), JSON.stringify({ repositories: [{ repo: 'acme/dsh-blocked', reason: 'Manually excluded' }] }))
  await writeFile(join(root, 'sources/overrides.json'), JSON.stringify({ plugins: {} }))
  await writeFile(join(root, 'scenario.json'), JSON.stringify({ mode }))
  const output = join(root, 'plugins.json')
  if (previous) await writeFile(output, previous)
  const mock = join(root, 'mock.mjs')
  await writeFile(mock, String.raw`
    import { appendFileSync, readFileSync } from 'node:fs'
    const { mode } = JSON.parse(readFileSync('scenario.json', 'utf8'))
    globalThis.setTimeout = callback => { queueMicrotask(callback); return 0 }
    const names = ['topic', 'community', 'manual', 'fork', 'archived', 'private', 'unknown', 'invalid', 'blocked']
    const repositories = names.map(name => ({
      nameWithOwner: 'acme/dsh-' + name, url: 'https://github.com/acme/dsh-' + name,
      description: 'DSH bundle ' + name, pushedAt: '2026-11-06T00:00:00Z',
      stargazerCount: 10, forkCount: 0, isPrivate: name === 'private',
      isArchived: name === 'archived', isFork: name === 'fork',
      repositoryTopics: { nodes: name === 'topic' ? [{ topic: { name: 'dsh-plugin' } }] : [] },
    }))
    delete repositories.find(repo => repo.nameWithOwner.endsWith('unknown')).isPrivate
    function log(value) { appendFileSync('requests.jsonl', JSON.stringify(value) + '\n') }
    globalThis.fetch = async (url, options) => {
      if (url === 'https://awesome-dsh-plugin.com/plugins.json') {
        log({ kind: 'community', authorization: Boolean(options.headers.authorization) })
        if (mode === 'network') throw new Error('community upstream unavailable')
        if (mode === 'invalid-json') return { ok: true, json: async () => { throw new SyntaxError('Unexpected end of JSON input') } }
        const plugins = repositories.map(repo => ({ url: repo.url, private: false, install: 'untrusted', trustLevel: 'curated' }))
        plugins.push({ url: 'https://github.com/ACME/dsh-topic/tree/main/nested' })
        return { ok: true, json: async () => ({ updated: '2026-11-07', count: plugins.length + (mode === 'truncated' ? 1 : 0), plugins }) }
      }
      if (url.startsWith('https://api.github.com/search/repositories?')) {
        log({ kind: 'rest' })
        return { ok: true, json: async () => ({ items: [{ full_name: 'acme/dsh-topic', html_url: 'https://github.com/acme/dsh-topic', private: false, topics: ['dsh-plugin'] }] }) }
      }
      if (url !== 'https://api.github.com/graphql') throw new Error('Unexpected request')
      if (!options.headers.authorization) throw new Error('GitHub token was not retained')
      const { query } = JSON.parse(options.body)
      if (query.includes('RegistryRepositoryDiscovery')) {
        return { ok: true, json: async () => ({ data: { search: { repositoryCount: 1, nodes: [{ nameWithOwner: 'acme/dsh-topic' }], pageInfo: { hasNextPage: false, endCursor: '1' } } } }) }
      }
      if (query.includes('RegistryRepositoryMetadata')) {
        if (!query.includes('isPrivate')) throw new Error('Repository visibility was not requested')
        const data = {}
        for (const [, alias, owner, name] of query.matchAll(/(r\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g)) {
          log({ kind: 'hydrate', repository: owner + '/' + name })
          data[alias] = repositories.find(repo => repo.nameWithOwner.toLowerCase() === (owner + '/' + name).toLowerCase()) || null
        }
        return { ok: true, json: async () => ({ data }) }
      }
      const data = {}
      for (const [, alias, owner, name, expression] of query.matchAll(/(r\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\) \{ object\(expression: "([^"]+)"/g)) {
        log({ kind: 'verify', repository: owner + '/' + name, expression })
        const text = expression.endsWith('package.json')
          ? JSON.stringify({ name, dsh: name === 'dsh-invalid' ? {} : { bundle: { patch: './bundle.yaml' } } })
          : '- insert: []'
        data[alias] = { object: { text }, defaultBranchRef: { target: { oid: 'a'.repeat(40) } } }
      }
      return { ok: true, json: async () => ({ data }) }
    }
  `)
  const execution = run(process.execPath, ['--import', mock, syncScript], {
    cwd: root,
    env: { ...process.env, GITHUB_TOKEN: authenticated ? 'fixture-only' : '', GH_TOKEN: '', DSH_MAX_PARTIAL_RATIO: '0.05', DSH_SYNC_ALLOW_UNSAFE: '',
      DSH_REGISTRY_OUTPUT: output, DSH_REGISTRY_AUDIT_OUTPUT: join(root, 'audit.json'), DSH_REGISTRY_VERSION_OUTPUT: join(root, 'version.json') },
  })
  return { root, curated, output, execution, requests: async () => (await readFile(join(root, 'requests.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse) }
}

test('no-topic community repositories use ordinary hydration, manifest/patch validation and governance', async t => {
  const result = await fixture(t)
  await result.execution
  const snapshot = JSON.parse(await readFile(result.output, 'utf8'))
  const audit = JSON.parse(await readFile(join(result.root, 'audit.json'), 'utf8'))
  const requests = await result.requests()
  assert.equal(snapshot.stats.topicCandidates, 1)
  assert.equal(snapshot.stats.communityCandidates, 5)
  assert.equal(snapshot.stats.discoveryMode, 'complete')
  assert.equal(snapshot.sources.community, communityUrl)
  assert.deepEqual(new Set(snapshot.plugins.map(p => p.id)), new Set(['acme/dsh-topic', 'acme/dsh-community', 'acme/dsh-manual']))
  const discovered = snapshot.plugins.find(p => p.id === 'acme/dsh-community')
  assert.equal(discovered.source, 'discovered')
  assert.equal(discovered.trustLevel, 'manifest_verified')
  assert.equal(discovered.verification.patch, 'exists')
  assert.deepEqual(discovered.topics, [])
  assert.match(discovered.install, /github:acme\/dsh-community#a{40}$/)
  assert.equal(requests.filter(r => r.kind === 'hydrate' && r.repository === 'acme/dsh-topic').length, 1)
  assert.ok(requests.some(r => r.kind === 'verify' && r.repository === 'acme/dsh-community' && r.expression.endsWith('bundle.yaml')))
  assert.ok(audit.pendingReview.some(p => p.id === 'acme/dsh-invalid'))
  assert.ok(!snapshot.plugins.some(p => /fork|archived|private|unknown|missing|blocked/.test(p.id)))
  assert.ok(![...audit.pendingReview, ...audit.quarantined].some(p => /private|unknown|missing/.test(p.id)))
  assert.ok(!requests.some(r => r.kind === 'verify' && /fork|archived|private|unknown|missing/.test(r.repository)))
  assert.equal(requests.find(r => r.kind === 'community').authorization, false)
  assert.equal(snapshot.plugins.find(p => p.id === 'acme/dsh-manual').source, 'curated')
  assert.equal(snapshot.plugins.find(p => p.id === 'acme/dsh-manual').description.en, 'Human curated description')
  assert.equal(await readFile(join(result.root, 'sources/curated.json'), 'utf8'), result.curated)
})

for (const mode of ['network', 'invalid-json', 'truncated']) {
  test(`community ${mode} failure preserves the previous snapshot`, async t => {
    const previous = JSON.stringify({ schemaVersion: 2, generatedAt: '2026-11-01T00:00:00Z', plugins: [] }) + '\n'
    const result = await fixture(t, { mode, previous })
    await assert.rejects(result.execution)
    assert.equal(await readFile(result.output, 'utf8'), previous)
    const requests = await result.requests()
    assert.ok(requests.every(r => r.kind === 'community'))
    assert.equal(requests.length, mode === 'truncated' ? 1 : 3)
  })
}

test('unauthenticated limited mode never admits bare community identities', async t => {
  const result = await fixture(t, { authenticated: false })
  await result.execution
  const snapshot = JSON.parse(await readFile(result.output, 'utf8'))
  assert.equal(snapshot.stats.discoveryMode, 'recent')
  assert.equal(snapshot.stats.communityCandidates, 0)
  assert.equal(Object.hasOwn(snapshot.sources, 'community'), false)
  assert.ok((await result.requests()).every(r => r.kind === 'rest'))
  assert.ok(!snapshot.plugins.some(p => p.id === 'acme/dsh-community'))
})
