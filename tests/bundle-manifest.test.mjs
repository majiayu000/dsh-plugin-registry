import assert from 'node:assert/strict'
import test from 'node:test'
import { githubContentsUrl, listBundleDirectories, validateBundleManifest } from '../assets/bundle-manifest.js'

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

test('percent-encoded traversal is rejected for bundle patch paths', () => {
  assert.equal(validateBundleManifest({ dsh: { bundle: { patch: './cordis.patch.yml' } } }).valid, true)
  assert.equal(validateBundleManifest({ dsh: { bundle: { patch: './foo/../bar.yml' } } }).reason_code, 'patch_unsafe')
  assert.equal(validateBundleManifest({ dsh: { bundle: { patch: './%2e%2e/secret.yml' } } }).reason_code, 'patch_unsafe')
  assert.equal(validateBundleManifest({ dsh: { bundle: { patch: './foo/%2e%2e/bar.yml' } } }).reason_code, 'patch_unsafe')
  assert.equal(validateBundleManifest({ dsh: { bundle: { patch: './%2E%2E/secret.yml' } } }).reason_code, 'patch_unsafe')
  assert.equal(validateBundleManifest({ dsh: { bundle: { patch: './..%2fsecret.yml' } } }).reason_code, 'patch_unsafe')
})

test('percent-encoded traversal is rejected for bundle directories', () => {
  assert.deepEqual(
    listBundleDirectories({
      dsh: {
        bundles: [
          './packages/foo',
          './%2e%2e/secret',
          './foo/%2e%2e/bar',
          './%2E%2E/secret',
          './..%2fsecret',
        ],
      },
    }),
    ['packages/foo'],
  )
})

test('trailing slashes on bundle directories remain accepted', () => {
  assert.deepEqual(
    listBundleDirectories({
      dsh: {
        bundles: [
          './packages/foo/',
          './packages/bar//',
          './',
          './%2e%2e/',
        ],
      },
    }),
    ['packages/foo', 'packages/bar'],
  )
  assert.equal(validateBundleManifest({ dsh: { bundle: { patch: './cordis.patch.yml/' } } }).valid, true)
  assert.equal(validateBundleManifest({ dsh: { bundle: { patch: './' } } }).reason_code, 'patch_unsafe')
})

test('patch paths cannot smuggle a contents query, fragment, or whitespace', () => {
  const malicious = [
    './ok.yml?ref=deadbeef',
    './ok.yml#frag',
    './my patch.yml',
    './ok&x.yml',
    './ok=1.yml',
    './ok[0].yml',
    './ok].yml',
    './ok\ty.yml',
    './ok\ny.yml',
    './ok\u0000.yml',
    './ok\u001f.yml',
    './ok\u007f.yml',
    './ok\u00a0.yml',
    './ok.yml%3Fref%3Ddeadbeef',
    './ok.yml%23frag',
  ]
  for (const patch of malicious) {
    assert.equal(validateBundleManifest({ dsh: { bundle: { patch } } }).reason_code, 'patch_unsafe', patch)
  }
  assert.deepEqual(listBundleDirectories({
    dsh: {
      bundles: [
        './packages/foo/',
        './packages/bar//',
        './cordis.patch.yml',
        ...malicious,
      ],
    },
  }), ['packages/foo', 'packages/bar', 'cordis.patch.yml'])
})

test('patch paths keep safe punctuation and non-ASCII names', () => {
  for (const patch of ['./a+b.yml', './a@b.yml', './a:b.yml', './a.b-c_d.yml', './补丁.yml', './cordis.patch.yml', './cordis.patch.yml/']) {
    assert.equal(validateBundleManifest({ dsh: { bundle: { patch } } }).valid, true, patch)
  }
  assert.deepEqual(
    listBundleDirectories({ dsh: { bundles: ['./补丁/', './a+b@c:d-e_f/'] } }),
    ['补丁', 'a+b@c:d-e_f'],
  )
})

test('githubContentsUrl encodes segments and pins only a 40-character lowercase sha', () => {
  const sha = '0123456789abcdef0123456789abcdef01234567'
  assert.equal(
    githubContentsUrl('octo/dsh.plugin', './packages/foo/', sha),
    `https://api.github.com/repos/octo/dsh.plugin/contents/packages/foo?ref=${sha}`,
  )
  assert.equal(
    githubContentsUrl('octo/plugin', 'package.json', sha),
    `https://api.github.com/repos/octo/plugin/contents/package.json?ref=${sha}`,
  )

  const encoded = new URL(githubContentsUrl('octo/plugin', './a+b@c:d-e_f.g/补丁.yml', sha))
  assert.equal(encoded.pathname, '/repos/octo/plugin/contents/a%2Bb%40c%3Ad-e_f.g/%E8%A1%A5%E4%B8%81.yml')
  assert.equal(encoded.searchParams.get('ref'), sha)
  assert.equal(encoded.hash, '')

  const attacked = new URL(githubContentsUrl('octo/plugin', './ok.yml?ref=deadbeef', sha))
  assert.equal(attacked.pathname, '/repos/octo/plugin/contents/ok.yml%3Fref%3Ddeadbeef')
  assert.equal(attacked.searchParams.get('ref'), sha)
  assert.equal(attacked.hash, '')

  const fragment = new URL(githubContentsUrl('octo/plugin', './ok.yml#frag', sha))
  assert.equal(fragment.pathname, '/repos/octo/plugin/contents/ok.yml%23frag')
  assert.equal(fragment.hash, '')

  const decodedPlus = new URL(githubContentsUrl('octo/plugin', './a%2Bb.yml', sha))
  assert.equal(decodedPlus.pathname, '/repos/octo/plugin/contents/a%2Bb.yml')

  for (const ref of [undefined, '', 'main', 'deadbeef', sha.slice(0, 39), sha.toUpperCase(), `${sha} `]) {
    const url = new URL(githubContentsUrl('octo/plugin', './cordis.patch.yml', ref))
    assert.equal(url.search, '', `ref ${String(ref)}`)
    assert.equal(url.pathname, '/repos/octo/plugin/contents/cordis.patch.yml')
  }
})

test('bundle manifest explains malformed package data', () => {
  assert.equal(validateBundleManifest('not json').reason_code, 'invalid_json')
  assert.equal(validateBundleManifest({ dsh: { bundle: [] } }).reason_code, 'bundle_not_object')
  assert.equal(validateBundleManifest({ dsh: { bundle: {} } }).reason_code, 'patch_missing')
  assert.equal(validateBundleManifest({ dsh: { bundle: { patch: '../outside.yml' } } }).reason_code, 'patch_unsafe')
})
