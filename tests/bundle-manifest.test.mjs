import assert from 'node:assert/strict'
import test from 'node:test'
import { validateBundleManifest } from '../assets/bundle-manifest.js'

test('bundle manifest returns the validated patch path', () => {
  assert.deepEqual(
    validateBundleManifest({ dsh: { bundle: { patch: './cordis.patch.yml' } } }),
    { valid: true, patch: './cordis.patch.yml' },
  )
})

test('bundle manifest explains malformed package data', () => {
  assert.equal(validateBundleManifest('not json').reason_code, 'invalid_json')
  assert.equal(validateBundleManifest({ dsh: { bundle: [] } }).reason_code, 'bundle_not_object')
  assert.equal(validateBundleManifest({ dsh: { bundle: {} } }).reason_code, 'patch_missing')
  assert.equal(validateBundleManifest({ dsh: { bundle: { patch: '../outside.yml' } } }).reason_code, 'patch_unsafe')
})
