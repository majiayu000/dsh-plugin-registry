import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { promisify } from 'node:util'

const run = promisify(execFile)
const repoRoot = resolve(import.meta.dirname, '..')

test('importing the sync module does not run the pipeline', async () => {
  // OUTPUT 在模块加载时解析；导入本身不发起网络请求、不写文件即证明 main() 有直接执行守卫
  process.env.DSH_REGISTRY_OUTPUT = join(await mkdtemp(join(tmpdir(), 'hr-sync-')), 'plugins.json')
  await import('../scripts/sync-plugins.mjs')
  delete process.env.DSH_REGISTRY_OUTPUT
})

test('a corrupt previous snapshot refuses to disable the health gate silently', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hr-sync-'))
  const output = join(root, 'plugins.json')
  await writeFile(output, '{ this is not json')
  const execution = run(process.execPath, ['scripts/sync-plugins.mjs'], {
    cwd: repoRoot,
    env: { ...process.env, DSH_REGISTRY_OUTPUT: output, DSH_REGISTRY_AUDIT_OUTPUT: join(root, 'audit.json') },
  })
  await assert.rejects(execution, error => {
    assert.match(String(error.stderr), /refusing to sync without a health baseline/)
    assert.equal(error.code, 1)
    return true
  })
})
