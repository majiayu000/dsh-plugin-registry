import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { checkLocalPlugin } from '../scripts/check-repository.mjs'

test('local plugin check accepts a valid bundle and patch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-check-'))
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: 'dsh-hello-plugin',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  await writeFile(join(root, 'cordis.patch.yml'), '- insert:\n    - id: hello\n      name: dsh-hello-plugin\n')
  const result = await checkLocalPlugin(root)
  assert.equal(result.ok, true)
  assert.equal(result.manifest.patch, './cordis.patch.yml')
})

test('local plugin check accepts an empty YAML array overlay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-check-'))
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: 'dsh-hello-plugin',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  await writeFile(join(root, 'cordis.patch.yml'), '[]\n')
  const result = await checkLocalPlugin(root)
  assert.equal(result.ok, true)
  assert.deepEqual(result.patch.names, [])
})
