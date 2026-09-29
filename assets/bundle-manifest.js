import { INSTALL_PROFILES } from './install-command.js'

const PINNED_COMMIT_SHA = /^[0-9a-f]{40}$/
// Query and fragment delimiters retarget the contents API; whitespace and controls do not survive a path segment.
const FORBIDDEN_DECODED_SEGMENT = /[?#&=[\]\s\u0000-\u001F\u007F]/u

function isSafeDecodedPathSegment(segment) {
  if (typeof segment !== 'string' || segment === '') return false

  let decoded
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    return false
  }

  return decoded !== ''
    && decoded !== '.'
    && decoded !== '..'
    && !decoded.includes('%')
    && !decoded.includes('\\')
    && !decoded.includes('/')
    && !FORBIDDEN_DECODED_SEGMENT.test(decoded)
}

export function isPinnedCommitSha(value) {
  return typeof value === 'string' && PINNED_COMMIT_SHA.test(value)
}

export function unpinnedRefCheck() {
  return {
    valid: false,
    reason_code: 'ref_unpinned',
    reason: 'The default branch could not be pinned to a commit.',
  }
}

export function githubContentsUrl(repository, relativePath, ref) {
  const parts = String(repository).split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new TypeError('repository must be owner/name')
  }
  const [owner, repo] = parts
  const normalized = String(relativePath).replace(/^\.\//, '').replace(/\/+$/, '')
  const encodedPath = normalized.split('/').map(segment => encodeURIComponent(decodeURIComponent(segment))).join('/')
  const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`)
  if (isPinnedCommitSha(ref)) url.searchParams.set('ref', ref)
  return url.href
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || !value.startsWith('./')) return false
  // Trailing slashes are common for monorepo bundle directories (./packages/foo/);
  // strip them before segment checks so split('/') does not yield an empty segment.
  const remainder = value.slice(2).replace(/\/+$/, '')
  if (!remainder) return false
  return remainder.split('/').every(isSafeDecodedPathSegment)
}

function isSafeRelativeDirectory(value) {
  return isSafeRelativePath(value)
}

export function listBundleDirectories(value) {
  let manifest = value
  if (typeof value === 'string') {
    try {
      manifest = JSON.parse(value)
    } catch {
      return []
    }
  }
  const bundles = manifest?.dsh?.bundles
  if (!Array.isArray(bundles)) return []
  return [...new Set(bundles.filter(isSafeRelativeDirectory).map(path => path.replace(/^\.\//, '').replace(/\/+$/, '')))]
}

export function validateBundleManifest(value) {
  let manifest = value
  if (typeof value === 'string') {
    try {
      manifest = JSON.parse(value)
    } catch {
      return { valid: false, reason_code: 'invalid_json', reason: 'package.json is not valid JSON.' }
    }
  }

  const bundle = manifest?.dsh?.bundle
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    return { valid: false, reason_code: 'bundle_not_object', reason: 'dsh.bundle must be an object.' }
  }

  const patch = bundle.patch
  if (typeof patch !== 'string' || !patch.trim()) {
    return { valid: false, reason_code: 'patch_missing', reason: 'dsh.bundle.patch must be a non-empty string.' }
  }
  if (!isSafeRelativePath(patch)) {
    return { valid: false, reason_code: 'patch_unsafe', reason: 'dsh.bundle.patch must be a safe relative path beginning with "./".' }
  }

  const profile = bundle.profile
  if (profile !== undefined && !INSTALL_PROFILES.includes(profile)) {
    return { valid: false, reason_code: 'profile_invalid', reason: 'dsh.bundle.profile must be web, tui, or headless.' }
  }

  const packageName = typeof manifest?.name === 'string' && manifest.name.trim() ? manifest.name.trim() : undefined
  return {
    valid: true,
    patch,
    profile: profile || 'web',
    ...(packageName ? { packageName } : {}),
  }
}
