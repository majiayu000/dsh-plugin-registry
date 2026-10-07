import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { checkGitHubPlugin, checkLocalPlugin } from '../scripts/check-repository.mjs'

const PINNED_SHA = '0123456789abcdef0123456789abcdef01234567'

function githubFetcher({ defaultBranch = 'main', branchStatus = 200, branchSha = PINNED_SHA, packageBody, packageStatus = 200, patchBody = '- insert:\n    - id: hello\n      name: demo\n', patchStatus = 200, calls }) {
  return async url => {
    calls.push(String(url))
    const parsed = new URL(url)
    if (parsed.pathname === '/repos/acme/plugin') return Response.json({ default_branch: defaultBranch })
    if (parsed.pathname === `/repos/acme/plugin/branches/${encodeURIComponent(defaultBranch)}`) {
      return new Response(JSON.stringify(branchStatus === 200 ? { commit: { sha: branchSha } } : {}), { status: branchStatus })
    }
    if (parsed.pathname === '/repos/acme/plugin/contents/package.json') {
      return new Response(JSON.stringify(packageBody), { status: packageStatus })
    }
    if (parsed.pathname.startsWith('/repos/acme/plugin/contents/')) return new Response(patchBody, { status: patchStatus })
    throw new Error(`Unexpected request: ${url}`)
  }
}

test('local plugin check accepts a valid bundle and patch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-check-'))
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: 'dsh-hello-plugin',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  await writeFile(join(root, 'cordis.patch.yml'), '- insert:\n    - id: hello\n      name: dsh-hello-plugin\n')
  const result = await checkLocalPlugin(root)
  assert.equal(result.ok, true)
  assert.equal(result.manifest.patch, './cordis.patch.yml')
})

test('local plugin check accepts an empty YAML array overlay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-check-'))
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: 'dsh-hello-plugin',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  await writeFile(join(root, 'cordis.patch.yml'), '[]\n')
  const result = await checkLocalPlugin(root)
  assert.equal(result.ok, true)
  assert.deepEqual(result.patch.names, [])
})

test('github plugin check pins both contents reads to the default branch sha', async () => {
  const calls = []
  const result = await checkGitHubPlugin('acme/plugin', githubFetcher({
    calls,
    packageBody: { dsh: { bundle: { patch: './cordis.patch.yml' } } },
  }))
  assert.equal(result.ok, true)
  const contents = calls.filter(url => url.includes('/contents/')).map(url => new URL(url))
  assert.deepEqual(contents.map(url => url.pathname), [
    '/repos/acme/plugin/contents/package.json',
    '/repos/acme/plugin/contents/cordis.patch.yml',
  ])
  for (const url of contents) assert.equal(url.searchParams.get('ref'), PINNED_SHA)
})

test('github plugin check does not request an attacker ref from the patch path', async () => {
  const calls = []
  const result = await checkGitHubPlugin('acme/plugin', githubFetcher({
    calls,
    packageBody: { dsh: { bundle: { patch: './ok.yml?ref=deadbeef' } } },
  }))
  assert.equal(result.ok, false)
  assert.equal(result.manifest.reason_code, 'patch_unsafe')
  assert.equal(result.patch, null)
  const contents = calls.filter(url => url.includes('/contents/'))
  assert.equal(contents.length, 1)
  assert.equal(new URL(contents[0]).searchParams.get('ref'), PINNED_SHA)
  assert.equal(calls.some(url => url.includes('deadbeef')), false)
})

test('github plugin check skips contents when the branch sha cannot be pinned', async () => {
  const calls = []
  const result = await checkGitHubPlugin('acme/plugin', githubFetcher({
    calls,
    branchStatus: 404,
    packageBody: { dsh: { bundle: { patch: './cordis.patch.yml' } } },
  }))
  assert.equal(result.ok, false)
  assert.equal(result.manifest.reason_code, 'ref_unpinned')
  assert.equal(result.patch.reason_code, 'ref_unpinned')
  assert.equal(calls.some(url => url.includes('/contents/')), false)
})

test('github plugin check reports non-404 branch errors without reading contents', async () => {
  const calls = []
  const result = await checkGitHubPlugin('acme/plugin', githubFetcher({
    calls,
    branchStatus: 403,
    packageBody: { dsh: { bundle: { patch: './cordis.patch.yml' } } },
  }))
  assert.equal(result.ok, false)
  assert.equal(result.patch, null)
  assert.match(result.manifest.reason, /403/)
  assert.equal(calls.some(url => url.includes('/contents/')), false)
})

test('github plugin check encodes the branch name before lookup', async () => {
  const calls = []
  const branch = 'release/1.0?ref=deadbeef'
  const result = await checkGitHubPlugin('acme/plugin', githubFetcher({
    calls,
    defaultBranch: branch,
    packageBody: { dsh: { bundle: { patch: './cordis.patch.yml' } } },
  }))
  assert.equal(result.ok, true)
  const branchUrl = new URL(calls.find(url => url.includes('/branches/')))
  assert.equal(branchUrl.pathname, `/repos/acme/plugin/branches/${encodeURIComponent(branch)}`)
  assert.equal(branchUrl.searchParams.get('ref'), null)
  assert.equal(calls.some(url => new URL(url).searchParams.get('ref') === 'deadbeef'), false)
})
