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
})

test('a YAML array without plugin id and name is rejected', () => {
  assert.equal(validateBundlePatch('- foo: bar\n').reason_code, 'patch_no_plugin_row')
  assert.equal(validateBundlePatch('- id: hello\n').reason_code, 'patch_no_plugin_row')
})

test('patch names can be required to match the package name', () => {
  const text = `- insert:\n    - id: hello\n      name: dsh-hello-plugin\n`
  assert.equal(validateBundlePatch(text, { packageName: 'dsh-hello-plugin' }).valid, true)
  assert.equal(validateBundlePatch(text, { packageName: 'other-plugin' }).reason_code, 'patch_name_mismatch')
  assert.equal(validateBundlePatch(
    `- id: hello-startup\n  name: dsh-hello-plugin/startup\n`,
    { packageName: 'dsh-hello-plugin' },
  ).valid, true)
})

test('patchPluginNames reads quoted and unquoted names', () => {
  assert.deepEqual(patchPluginNames('- name: foo\n- name: "bar/baz"\n'), ['foo', 'bar/baz'])
})
