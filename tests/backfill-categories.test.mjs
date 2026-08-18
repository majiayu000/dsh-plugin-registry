import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { promisify } from 'node:util'

const run = promisify(execFile)
const repoRoot = resolve(import.meta.dirname, '..')

const CATEGORIES = {
  tools: { zh: '工具', en: 'Tools' },
  notify: { zh: '通知', en: 'Notifications' },
  memory: { zh: '记忆', en: 'Memory' },
}

test('backfill keeps declared categories that match no inference rule', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hr-backfill-'))
  const output = join(root, 'plugins.json')
  const auditOutput = join(root, 'registry-audit.json')
  await mkdir(root, { recursive: true })
  await writeFile(output, JSON.stringify({
    schemaVersion: 2,
    generatedAt: '2026-08-16T00:00:00.000Z',
    categories: CATEGORIES,
    stats: {},
    sources: {},
    plugins: [
      // 已声明 notify，且名称/描述不命中任何推断规则：必须保持 notify，而不是重归到 tools
      {
        id: 'acme/quiet-relay', name: 'quiet-relay', owner: 'acme',
        url: 'https://github.com/acme/quiet-relay',
        description: { zh: '', en: '' }, category: 'notify',
        stars: 0, forks: 0, source: 'curated', trustLevel: 'curated',
        verification: { manifest: 'not_checked', patch: 'not_checked', installation: 'not_tested' },
        install: 'dsh plugin --profile web add github:acme/quiet-relay',
        icon: 'https://github.com/acme.png?size=96',
      },
    ],
  }))
  await writeFile(auditOutput, JSON.stringify({ schemaVersion: 1, pendingReview: [], quarantined: [] }))

  await run(process.execPath, [join(repoRoot, 'scripts', 'backfill-categories.mjs')], {
    cwd: root,
    env: { ...process.env, DSH_REGISTRY_OUTPUT: output, DSH_REGISTRY_AUDIT_OUTPUT: auditOutput },
  })
  const updated = JSON.parse(await readFile(output, 'utf8'))
  assert.equal(updated.plugins[0].category, 'notify')
})
