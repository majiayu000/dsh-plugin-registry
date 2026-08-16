import { INSTALL_PROFILES } from './install-command.js'

function isSafeRelativeDirectory(value) {
  return typeof value === 'string'
    && value.startsWith('./')
    && !value.includes('\\')
    && !value.split('/').includes('..')
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
  if (!patch.startsWith('./') || patch.includes('\\') || patch.split('/').includes('..')) {
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
