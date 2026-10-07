import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const run = promisify(execFile)
const syncScript = resolve(import.meta.dirname, '../scripts/sync-plugins.mjs')

for (const count of [1_000, 1_002]) {
  test(`complete sync discovers ${count} repositories without hydrating oversized first pages`, async t => {
    const root = await mkdtemp(join(tmpdir(), 'hr-sync-discovery-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    await mkdir(join(root, 'sources'))
    for (const [file, value] of Object.entries({
      'curated.json': { plugins: [] },
      'blocklist.json': { repositories: [] },
      'overrides.json': { plugins: {} },
    })) await writeFile(join(root, 'sources', file), JSON.stringify(value))

    const mock = join(root, 'mock.mjs')
    await writeFile(mock, String.raw`
      import { appendFileSync } from 'node:fs'
      // Exercise retry exhaustion without sleeping or contacting GitHub.
      globalThis.setTimeout = callback => { queueMicrotask(callback); return 0 }
      const count = Number(process.env.FIXTURE_COUNT)
      const created = Date.parse('2026-09-01T00:00:00Z')
      const repositories = Array.from({ length: count }, (_, index) => ({
        nameWithOwner: 'acme/dsh-plugin-' + index,
        url: 'https://github.com/acme/dsh-plugin-' + index,
        description: 'DeepSeek Harness plugin',
        pushedAt: '2026-09-01T00:00:00Z',
        repositoryTopics: { nodes: [{ topic: { name: 'dsh-plugin' } }] },
      }))
      globalThis.fetch = async (url, options) => {
        if (url !== 'https://api.github.com/graphql') throw new Error('Unexpected network request: ' + url)
        const { query, variables } = JSON.parse(options.body)
        if (query.includes('RegistryRepositoryDiscovery')) {
          const size = /first: (\d+), after:/.exec(query)?.[1] || variables.pageSize
          const range = variables.searchQuery.split('created:')[1].split('..').map(Date.parse)
          const matches = repositories.filter((_, index) => created + index * 1000 >= range[0] && created + index * 1000 <= range[1])
          const offset = Number(variables.cursor || 0)
          const end = Math.min(offset + Number(size), matches.length, 1000)
          appendFileSync('requests.jsonl', JSON.stringify({ size: Number(size), cursor: variables.cursor, count: matches.length }) + '\n')
          if (matches.length > 1000 && Number(size) > 1) {
            return { ok: false, status: 502, statusText: 'Bad Gateway' }
          }
          return { ok: true, json: async () => ({ data: { search: {
            repositoryCount: matches.length, nodes: matches.slice(offset, end),
            pageInfo: { hasNextPage: end < Math.min(matches.length, 1000), endCursor: String(end) },
          } } }) }
        }
        const data = {}
        for (const match of query.matchAll(/r(\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\) \{ object\(expression: "([^"]+)"/g)) {
          const [, index, , name, expression] = match
          const text = expression.endsWith('package.json')
            ? JSON.stringify({ name, dsh: { bundle: { patch: './bundle.yaml', profile: 'web' } } })
            : '[]'
          data['r' + index] = { object: { text }, defaultBranchRef: { target: { oid: 'a'.repeat(40) } } }
        }
        return { ok: true, json: async () => ({ data }) }
      }
    `)
    const output = join(root, 'plugins.json')
    const execution = await run(process.execPath, ['--import', mock, syncScript], {
      cwd: root,
      env: { ...process.env, GITHUB_TOKEN: 'fixture-only', GH_TOKEN: '', FIXTURE_COUNT: String(count),
        DSH_MAX_PARTIAL_RATIO: '0.05', DSH_SYNC_ALLOW_UNSAFE: '', DSH_REGISTRY_OUTPUT: output,
        DSH_REGISTRY_AUDIT_OUTPUT: join(root, 'audit.json'), DSH_REGISTRY_VERSION_OUTPUT: join(root, 'version.json') },
    })
    const document = JSON.parse(await readFile(output, 'utf8'))
    const requests = (await readFile(join(root, 'requests.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
    assert.equal(document.stats.discoveryMode, 'complete')
    assert.equal(document.stats.topicCandidates, count)
    assert.equal(document.plugins.length, count)
    assert.equal(new Set(document.plugins.map(plugin => plugin.id)).size, count)
    assert.ok(document.plugins.every(plugin => plugin.verifiedCommit === 'a'.repeat(40) && plugin.verification.patch === 'exists'))
    assert.ok(requests.filter(request => request.cursor === null).every(request => request.size === 1))
    assert.ok(requests.some(request => request.cursor === '1' && request.size === 100))
    assert.ok(requests.filter(request => request.cursor !== null).every(request => request.size === 100 && request.count <= 1000))
    assert.doesNotMatch(execution.stderr, /retrying|recovery splits left/)
  })
}
