import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const metadataFiles = [
  'README.md',
  'SECURITY.md',
  'package.json',
  'docs/repository-metadata.md',
  'docs/shipwise-readiness.md',
]

test('repository links use the canonical GitHub slug', async () => {
  const contents = (await Promise.all(metadataFiles.map(file => readFile(file, 'utf8')))).join('\n')
  assert.doesNotMatch(contents, /majiayu000\/dsh-plugin(?:[\/.#]|$)/)
  assert.match(contents, /majiayu000\/dsh-plugin-registry/)
})
