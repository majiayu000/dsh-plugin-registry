import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('schema v2 separates manifest, patch, and installation evidence', async () => {
  const schema = JSON.parse(await readFile('schema/registry.schema.json', 'utf8'))
  const pluginSchema = schema.properties.plugins.items

  assert.equal(schema.properties.schemaVersion.const, 2)
  assert.ok(pluginSchema.required.includes('verification'))
  assert.equal(pluginSchema.properties.verification.properties.installation.const, 'not_tested')
  assert.equal(pluginSchema.properties.verified, undefined)
  assert.equal(pluginSchema.properties.installable, undefined)
})

test('published snapshot contains explicit evidence and no ambiguous booleans', async () => {
  const registry = JSON.parse(await readFile('public/data/plugins.json', 'utf8'))

  assert.equal(registry.schemaVersion, 2)
  assert.ok(registry.plugins.length > 0)
  for (const plugin of registry.plugins) {
    assert.equal('verified' in plugin, false)
    assert.equal('installable' in plugin, false)
    assert.equal(plugin.verification.installation, 'not_tested')
    assert.ok(plugin.source === 'curated'
      ? ['not_checked', 'shape_validated'].includes(plugin.verification.manifest)
      : plugin.verification.manifest === 'shape_validated')
    assert.ok(['not_checked', 'exists', 'missing'].includes(plugin.verification.patch))
  }
})

test('plugin details expose both manifest and installation-test status', async () => {
  const [html, script, shared, dashboard] = await Promise.all([
    readFile('plugin-detail.html', 'utf8'),
    readFile('assets/page-detail.js', 'utf8'),
    readFile('assets/plugins.js', 'utf8'),
    readFile('dashboard.html', 'utf8'),
  ])
  assert.match(html, /id="manifest-status"/)
  assert.match(html, /id="patch-status"/)
  assert.match(html, /id="installation-test-status"/)
  assert.match(script, /没有运行插件、测试安装或审计安全性/)
  assert.match(shared + dashboard, /Manifest 格式检查通过/)
})
