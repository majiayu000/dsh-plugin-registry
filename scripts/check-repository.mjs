import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateBundleManifest } from '../assets/bundle-manifest.js'
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

async function checkGitHubPlugin(repository) {
  const headers = {
    accept: 'application/vnd.github.raw+json',
    'user-agent': 'harness-registry-check',
  }
  const packageResponse = await fetch(`https://api.github.com/repos/${repository}/contents/package.json`, { headers })
  if (!packageResponse.ok) {
    return { ok: false, manifest: { valid: false, reason_code: 'package_missing', reason: `GitHub returned ${packageResponse.status}` }, patch: null }
  }
  const manifest = validateBundleManifest(await packageResponse.text())
  if (!manifest.valid) return { ok: false, manifest, patch: null }
  const patchResponse = await fetch(`https://api.github.com/repos/${repository}/contents/${manifest.patch.replace(/^\.\//, '')}`, { headers })
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
