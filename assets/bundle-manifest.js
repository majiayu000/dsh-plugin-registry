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

  return { valid: true, patch }
}
