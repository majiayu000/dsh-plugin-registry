import assert from 'node:assert/strict'
import test from 'node:test'
import { listBundleDirectories, validateBundleManifest } from '../assets/bundle-manifest.js'

test('bundle manifest returns the validated patch path and default profile', () => {
  assert.deepEqual(
    validateBundleManifest({ name: 'dsh-hello-plugin', dsh: { bundle: { patch: './cordis.patch.yml' } } }),
    { valid: true, patch: './cordis.patch.yml', profile: 'web', packageName: 'dsh-hello-plugin' },
  )
})

test('bundle manifest can declare a non-web profile', () => {
  assert.deepEqual(
    validateBundleManifest({ dsh: { bundle: { patch: './cordis.patch.yml', profile: 'tui' } } }),
    { valid: true, patch: './cordis.patch.yml', profile: 'tui' },
  )
  assert.equal(validateBundleManifest({ dsh: { bundle: { patch: './cordis.patch.yml', profile: 'desktop' } } }).reason_code, 'profile_invalid')
})

test('root package.json may declare additional bundle directories', () => {
  assert.deepEqual(
    listBundleDirectories({ dsh: { bundles: ['./packages/foo', './packages/bar', '../outside'] } }),
    ['packages/foo', 'packages/bar'],
  )
  assert.deepEqual(listBundleDirectories({ dsh: { bundle: { patch: './cordis.patch.yml' } } }), [])
})

test('bundle manifest explains malformed package data', () => {
  assert.equal(validateBundleManifest('not json').reason_code, 'invalid_json')
  assert.equal(validateBundleManifest({ dsh: { bundle: [] } }).reason_code, 'bundle_not_object')
  assert.equal(validateBundleManifest({ dsh: { bundle: {} } }).reason_code, 'patch_missing')
  assert.equal(validateBundleManifest({ dsh: { bundle: { patch: '../outside.yml' } } }).reason_code, 'patch_unsafe')
})
