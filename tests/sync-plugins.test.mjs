import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { promisify } from 'node:util'

const run = promisify(execFile)
const repoRoot = resolve(import.meta.dirname, '..')

test('importing the sync module does not run the pipeline', async () => {
  // OUTPUT 在模块加载时解析；导入本身不发起网络请求、不写文件即证明 main() 有直接执行守卫
  process.env.DSH_REGISTRY_OUTPUT = join(await mkdtemp(join(tmpdir(), 'hr-sync-')), 'plugins.json')
  await import('../scripts/sync-plugins.mjs')
  delete process.env.DSH_REGISTRY_OUTPUT
})

test('a corrupt previous snapshot refuses to disable the health gate silently', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hr-sync-'))
  const output = join(root, 'plugins.json')
  await writeFile(output, '{ this is not json')
  const execution = run(process.execPath, ['scripts/sync-plugins.mjs'], {
    cwd: repoRoot,
    env: { ...process.env, DSH_REGISTRY_OUTPUT: output, DSH_REGISTRY_AUDIT_OUTPUT: join(root, 'audit.json') },
  })
  await assert.rejects(execution, error => {
    assert.match(String(error.stderr), /refusing to sync without a health baseline/)
    assert.equal(error.code, 1)
    return true
  })
})

async function syncFixture(t, { count = 400, bundle = false, curatedDirectory = '' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'hr-sync-partial-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'sources'))
  const curated = {
    id: 'acme/dsh-plugin-0', name: 'dsh-plugin-0', owner: 'acme',
    url: 'https://github.com/acme/dsh-plugin-0', category: 'tools',
    description: { en: 'DeepSeek Harness plugin' },
    install: 'dsh plugin --profile web add github:acme/dsh-plugin-0',
  }
  if (curatedDirectory) {
    curated.id += '#sample'
    curated.name += '#sample'
    curated.url += '/tree/main/' + curatedDirectory
  }
  for (const [file, value] of Object.entries({
    'curated.json': { plugins: [curated] },
    'blocklist.json': { repositories: [] },
    'overrides.json': { plugins: {} },
  })) await writeFile(join(root, 'sources', file), JSON.stringify(value))
  const mock = join(root, 'mock.mjs')
  await writeFile(mock, String.raw`
    import { appendFileSync, readFileSync } from 'node:fs'
    const scenario = JSON.parse(readFileSync('scenario.json', 'utf8'))
    const repositories = Array.from({ length: scenario.count }, (_, index) => ({
      nameWithOwner: 'acme/dsh-plugin-' + index,
      url: 'https://github.com/acme/dsh-plugin-' + index,
      description: 'DeepSeek Harness plugin', pushedAt: '2026-09-01T00:00:00Z',
      repositoryTopics: { nodes: [{ topic: { name: 'dsh-plugin' } }, { topic: { name: 'dsh' } }] },
    }))
    globalThis.fetch = async (url, options) => {
      if (url !== 'https://api.github.com/graphql') throw new Error('Unexpected network request: ' + url)
      const { query, variables } = JSON.parse(options.body)
      if (query.includes('RegistryRepositoryDiscovery')) {
        const offset = Number(variables.cursor || 0)
        const end = Math.min(offset + 100, repositories.length)
        return { ok: true, json: async () => ({ data: { search: {
          repositoryCount: repositories.length, nodes: repositories.slice(offset, end),
          pageInfo: { hasNextPage: end < repositories.length, endCursor: String(end) },
        } } }) }
      }
      const kind = query.includes('defaultBranchRef') ? 'manifest' : 'patch'
      const data = {}
      const errors = []
      for (const match of query.matchAll(/r(\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\) \{ object\(expression: "([^"]+)"/g)) {
        const [, index, owner, name, expression] = match
        const directory = expression.slice(5).split('/').slice(0, -1).join('/')
        const key = owner + '/' + name + (directory ? '#' + directory : '')
        appendFileSync('requests.jsonl', JSON.stringify({ kind, key }) + '\n')
        const partial = scenario['partial' + kind]?.includes(key)
        const missing = scenario['missing' + kind]?.includes(key)
        const invalid = scenario['invalid' + kind]?.includes(key)
        const manifest = { name, dsh: { bundle: { patch: './bundle.yaml', profile: 'web' },
          ...(scenario.bundle && name === 'dsh-plugin-2' && !directory ? { bundles: ['./bundles/sample'] } : {}),
        } }
        const text = kind === 'manifest'
          ? (invalid ? '{}' : JSON.stringify(manifest))
          : (invalid ? 'key: value' : '[]')
        data['r' + index] = {
          object: partial || missing ? null : { text },
          defaultBranchRef: { target: { oid: 'a'.repeat(40) } },
        }
        if (partial) errors.push({ message: 'Temporary blob failure', path: ['r' + index, 'object'] })
      }
      return { ok: true, json: async () => ({ data, ...(errors.length ? { errors } : {}) }) }
    }
  `)
  const output = join(root, 'plugins.json')
  const audit = join(root, 'audit.json')
  return {
    output, audit,
    async sync(scenario = {}) {
      await writeFile(join(root, 'scenario.json'), JSON.stringify({ count, bundle, ...scenario }))
      await writeFile(join(root, 'requests.jsonl'), '')
      const execution = await run(process.execPath, ['--import', mock, join(repoRoot, 'scripts/sync-plugins.mjs')], {
        cwd: root,
        env: { ...process.env, GITHUB_TOKEN: 'fixture-only', GH_TOKEN: '', DSH_MAX_PARTIAL_RATIO: '0.05',
          DSH_SYNC_ALLOW_UNSAFE: '', DSH_REGISTRY_OUTPUT: output, DSH_REGISTRY_AUDIT_OUTPUT: audit,
          DSH_REGISTRY_VERSION_OUTPUT: join(root, 'version.json') },
      })
      return {
        ...execution,
        document: JSON.parse(await readFile(output, 'utf8')),
        audit: JSON.parse(await readFile(audit, 'utf8')),
        requests: (await readFile(join(root, 'requests.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse),
      }
    },
  }
}

for (const kind of ['manifest', 'patch']) {
  test(`partial ${kind} blobs stay unchecked and recover without a repository push`, async t => {
    const fixture = await syncFixture(t)
    const affected = ['acme/dsh-plugin-0', 'acme/dsh-plugin-1']
    const partial = await fixture.sync({ ['partial' + kind]: affected })
    assert.match(partial.stderr, /GraphQL returned partial data/)
    assert.equal(partial.audit.pendingReview.length, 0)
    assert.ok(partial.document.plugins.some(plugin => plugin.id === 'acme/dsh-plugin-2'))
    assert.equal(partial.document.plugins.find(plugin => plugin.id === affected[0]).verification.manifest, 'not_checked')
    assert.ok(!partial.document.plugins.some(plugin => plugin.id === affected[1]))
    const recovered = await fixture.sync()
    assert.equal(recovered.document.plugins.length, 400)
    for (const key of affected) {
      assert.ok(recovered.requests.some(request => request.kind === kind && request.key === key))
      assert.equal(recovered.document.plugins.find(plugin => plugin.id === key).verification.patch, 'exists')
    }
  })

  test(`partial ${kind} blobs for discovered bundle directories are not audited as failures`, async t => {
    const fixture = await syncFixture(t, { bundle: true })
    const key = 'acme/dsh-plugin-2#bundles/sample'
    const partial = await fixture.sync({ ['partial' + kind]: [key] })
    assert.equal(partial.audit.pendingReview.length, 0)
    assert.ok(!partial.document.plugins.some(plugin => plugin.id.endsWith('#sample')))
    const recovered = await fixture.sync()
    assert.ok(recovered.requests.some(request => request.kind === kind && request.key === key))
    assert.ok(recovered.document.plugins.some(plugin => plugin.id === 'acme/dsh-plugin-2#sample'))
  })
}

test('definitive missing and invalid evidence is audited and rechecked with unchanged pushedAt', async t => {
  const fixture = await syncFixture(t)
  const rejected = ['acme/dsh-plugin-0', 'acme/dsh-plugin-1', 'acme/dsh-plugin-2', 'acme/dsh-plugin-3']
  const first = await fixture.sync({
    missingmanifest: [rejected[0]], invalidmanifest: [rejected[1]],
    missingpatch: [rejected[2]], invalidpatch: [rejected[3]],
  })
  assert.equal(first.audit.pendingReview.length, 4)
  assert.equal(first.document.stats.manifestRejected, 2)
  assert.equal(first.document.stats.patchRejected, 2)
  const recovered = await fixture.sync()
  assert.equal(recovered.document.plugins.length, 400)
  assert.equal(recovered.audit.pendingReview.length, 0)
  for (const key of rejected) assert.ok(recovered.requests.some(request => request.kind === 'manifest' && request.key === key))
})

for (const rejection of ['missingmanifest', 'invalidmanifest', 'missingpatch', 'invalidpatch']) {
  test(`cached ${rejection} in a curated directory is retried, while positive directory evidence is reused`, async t => {
    const fixture = await syncFixture(t, { count: 2, curatedDirectory: 'bundles/sample' })
    const key = 'acme/dsh-plugin-0#bundles/sample'
    const rejected = await fixture.sync({ [rejection]: [key] })
    assert.equal(rejected.audit.pendingReview.length, 1)
    const recovered = await fixture.sync()
    assert.ok(recovered.requests.some(request => request.kind === 'manifest' && request.key === key))
    assert.equal(recovered.document.plugins.find(plugin => plugin.id === 'acme/dsh-plugin-0#sample').verification.patch, 'exists')
    const unchanged = await fixture.sync()
    assert.ok(!unchanged.requests.some(request => request.key === key))
    assert.equal(unchanged.document.plugins.length, 2)
  })
}

test('excess partial responses still fail without replacing the previous snapshot or audit', async t => {
  const fixture = await syncFixture(t, { count: 2 })
  await fixture.sync({ missingmanifest: ['acme/dsh-plugin-1'] })
  const before = await Promise.all([readFile(fixture.output, 'utf8'), readFile(fixture.audit, 'utf8')])
  await assert.rejects(fixture.sync({ partialmanifest: ['acme/dsh-plugin-1'] }), error => {
    assert.equal(error.code, 1)
    assert.match(error.stderr, /refusing to publish a partially validated snapshot/)
    return true
  })
  assert.deepEqual(await Promise.all([readFile(fixture.output, 'utf8'), readFile(fixture.audit, 'utf8')]), before)
})
