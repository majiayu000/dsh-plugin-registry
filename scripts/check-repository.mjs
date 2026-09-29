import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { githubContentsUrl, isPinnedCommitSha, unpinnedRefCheck, validateBundleManifest } from '../assets/bundle-manifest.js'
import { validateBundlePatch } from '../assets/bundle-patch.js'

function printResult(label, result) {
  const status = result.valid ? 'pass' : 'fail'
  const detail = result.valid
    ? (result.patch || result.names?.join(', ') || 'ok')
    : `${result.reason_code}: ${result.reason}`
  console.log(`${status}\t${label}\t${detail}`)
}

export async function checkLocalPlugin(directory) {
  const root = resolve(directory)
  const manifestText = await readFile(resolve(root, 'package.json'), 'utf8')
  const manifest = validateBundleManifest(manifestText)
  if (!manifest.valid) return { ok: false, manifest, patch: null }
  const patchText = await readFile(resolve(root, manifest.patch), 'utf8')
  const patch = validateBundlePatch(patchText)
  return { ok: patch.valid, manifest, patch }
}

function githubStatusResult(status) {
  return { ok: false, manifest: { valid: false, reason_code: 'package_missing', reason: `GitHub returned ${status}` }, patch: null }
}

export async function checkGitHubPlugin(repository, fetcher = fetch) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'harness-registry-check',
  }
  const rawHeaders = {
    accept: 'application/vnd.github.raw+json',
    'user-agent': 'harness-registry-check',
  }
  const encodedRepository = String(repository).split('/').map(encodeURIComponent).join('/')
  const repoResponse = await fetcher(`https://api.github.com/repos/${encodedRepository}`, { headers })
  if (!repoResponse.ok) return githubStatusResult(repoResponse.status)
  const metadata = await repoResponse.json()
  const branch = metadata?.default_branch
  let sha = null
  if (typeof branch === 'string' && branch) {
    const branchResponse = await fetcher(`https://api.github.com/repos/${encodedRepository}/branches/${encodeURIComponent(branch)}`, { headers })
    if (branchResponse.ok) {
      const branchData = await branchResponse.json()
      sha = branchData?.commit?.sha
    } else if (branchResponse.status !== 404) {
      return githubStatusResult(branchResponse.status)
    }
  }
  if (!isPinnedCommitSha(sha)) {
    return { ok: false, manifest: unpinnedRefCheck(), patch: unpinnedRefCheck() }
  }
  const packageResponse = await fetcher(githubContentsUrl(repository, 'package.json', sha), { headers: rawHeaders })
  if (!packageResponse.ok) return githubStatusResult(packageResponse.status)
  const manifest = validateBundleManifest(await packageResponse.text())
  if (!manifest.valid) return { ok: false, manifest, patch: null }
  const patchResponse = await fetcher(githubContentsUrl(repository, manifest.patch, sha), { headers: rawHeaders })
  if (!patchResponse.ok) {
    return { ok: false, manifest, patch: { valid: false, reason_code: 'patch_file_missing', reason: `GitHub returned ${patchResponse.status}` } }
  }
  const patch = validateBundlePatch(await patchResponse.text())
  return { ok: patch.valid, manifest, patch }
}

async function main() {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: npm run check:plugin -- <./local-plugin | owner/repo>')
    process.exitCode = 1
    return
  }
  const result = target.includes('/') && !target.startsWith('.') && !target.startsWith('/')
    ? await checkGitHubPlugin(target)
    : await checkLocalPlugin(target)
  printResult('manifest', result.manifest)
  if (result.patch) printResult('patch', result.patch)
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
