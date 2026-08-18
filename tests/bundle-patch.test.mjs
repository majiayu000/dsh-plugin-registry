import assert from 'node:assert/strict'
import test from 'node:test'
import { patchPluginNames, validateBundlePatch } from '../assets/bundle-patch.js'

test('a typical cordis insert patch is valid', () => {
  const text = `- insert:\n    - id: hello\n      name: dsh-hello-plugin\n`
  assert.deepEqual(validateBundlePatch(text), { valid: true, names: ['dsh-hello-plugin'] })
})

test('a flat plugin row patch is valid', () => {
  const text = `- id: hello-startup\n  name: 'dsh-hello-plugin/startup'\n`
  const result = validateBundlePatch(text)
  assert.equal(result.valid, true)
  assert.deepEqual(result.names, ['dsh-hello-plugin/startup'])
})

test('empty or non-array patches are rejected', () => {
  assert.equal(validateBundlePatch('').reason_code, 'patch_empty')
  assert.equal(validateBundlePatch('   \n# comment only\n').reason_code, 'patch_empty')
  assert.equal(validateBundlePatch('id: hello\nname: demo\n').reason_code, 'patch_not_array')
  assert.equal(validateBundlePatch('patch: []\n').reason_code, 'patch_not_array')
})

test('a top-level YAML array is valid even without plugin id and name', () => {
  assert.equal(validateBundlePatch('[]').valid, true)
  assert.deepEqual(validateBundlePatch('# overlay\n[]\n').names, [])
  assert.equal(validateBundlePatch('- foo: bar\n').valid, true)
  assert.equal(validateBundlePatch('- id: hello\n').valid, true)
})

test('insert names are collected when present and never required to match package.json', () => {
  const text = `- insert:\n    - id: hello\n      name: other-plugin\n`
  const result = validateBundlePatch(text)
  assert.equal(result.valid, true)
  assert.deepEqual(result.names, ['other-plugin'])
})

test('patchPluginNames reads quoted and unquoted names', () => {
  assert.deepEqual(patchPluginNames('- name: foo\n- name: "bar/baz"\n'), ['foo', 'bar/baz'])
})
