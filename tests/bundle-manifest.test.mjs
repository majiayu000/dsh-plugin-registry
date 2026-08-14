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
  assert.match(validateBundleManifest('not json').reason, /valid JSON/)
  assert.match(validateBundleManifest({ dsh: { bundle: [] } }).reason, /must be an object/)
  assert.match(validateBundleManifest({ dsh: { bundle: {} } }).reason, /non-empty string/)
  assert.match(validateBundleManifest({ dsh: { bundle: { patch: '../outside.yml' } } }).reason, /safe relative path/)
})
