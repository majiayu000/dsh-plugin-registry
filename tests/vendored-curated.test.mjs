import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('the curated catalog is vendored into the repository as the sync source', async () => {
  const curated = JSON.parse(await readFile('sources/curated.json', 'utf8'))
  assert.ok(Array.isArray(curated.plugins) && curated.plugins.length > 0)
  const sync = await readFile('scripts/sync-plugins.mjs', 'utf8')
  assert.match(sync, /sources\/curated\.json/)
  assert.doesNotMatch(sync, /awesome-dsh-plugin\.com/)
})

test('every vendored curated entry resolves to a GitHub repository with install data', async () => {
  const curated = JSON.parse(await readFile('sources/curated.json', 'utf8'))
  for (const plugin of curated.plugins) {
    assert.match(plugin.url, /^https:\/\/github\.com\/[^/]+\/[^/]+/)
    assert.equal(typeof plugin.name, 'string')
    assert.match(plugin.install, /^dsh plugin --profile /)
    assert.match(plugin.icon, /^https:\/\/(?:github\.com|avatars\.githubusercontent\.com)\//)
  }
})
