import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('registry sync runs every two hours', async () => {
  const workflow = await readFile('.github/workflows/sync-plugins.yml', 'utf8')
  assert.match(workflow, /cron: '17 \*\/2 \* \* \*'/)
  assert.match(workflow, /timeout-minutes: 30/)
})

test('a changed registry deploys the verified artifact without relying on a bot push event', async () => {
  const workflow = await readFile('.github/workflows/sync-plugins.yml', 'utf8')
  assert.match(workflow, /registry_changed: \$\{\{ steps\.registry_changes\.outputs\.changed \}\}/)
  assert.match(workflow, /npm run build -- --base \/dsh-plugin-registry\//)
  assert.match(workflow, /uses: actions\/upload-pages-artifact@v3/)
  assert.match(workflow, /if: needs\.sync\.outputs\.registry_changed == 'true'/)
  assert.match(workflow, /uses: actions\/deploy-pages@v4/)
})
