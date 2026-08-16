import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('registry sync runs every two hours', async () => {
  const workflow = await readFile('.github/workflows/sync-plugins.yml', 'utf8')
  assert.match(workflow, /cron: '17 \*\/2 \* \* \*'/)
  assert.match(workflow, /timeout-minutes: 30/)
})

test('a changed registry deploys the verified build without relying on a bot push event', async () => {
  const workflow = await readFile('.github/workflows/sync-plugins.yml', 'utf8')
  assert.match(workflow, /registry_changed: \$\{\{ steps\.registry_changes\.outputs\.changed \}\}/)
  assert.match(workflow, /if: steps\.registry_changes\.outputs\.changed == 'true'/)
  assert.match(workflow, /npx wrangler pages deploy dist --project-name dsh-plugin-registry --branch main/)
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/)
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/)
  assert.doesNotMatch(workflow, /deploy-pages@v4|upload-pages-artifact|--base \/dsh-plugin-registry\//)
})

test('pushes to main deploy straight to Cloudflare Pages', async () => {
  const workflow = await readFile('.github/workflows/deploy-pages.yml', 'utf8')
  assert.match(workflow, /npx wrangler pages deploy dist --project-name dsh-plugin-registry --branch main/)
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/)
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/)
  assert.doesNotMatch(workflow, /deploy-pages@v4|upload-pages-artifact|configure-pages|pages: write/)
})

test('registry sync imports the shared bundle parser before checking referenced patch files', async () => {
  const sync = await readFile('scripts/sync-plugins.mjs', 'utf8')
  assert.match(sync, /import \{ validateBundleManifest \} from '\.\.\/assets\/bundle-manifest\.js'/)
  assert.match(sync, /validateBundleManifest\(manifests\.get/)
  assert.match(sync, /patchStatus: patchMissing \? 'missing'/)
})

test('a failed sync opens a tracking issue and a healthy run closes it', async () => {
  const workflow = await readFile('.github/workflows/sync-plugins.yml', 'utf8')
  assert.match(workflow, /needs: \[sync\]/)
  assert.match(workflow, /always\(\) && needs\.sync\.result == 'failure'/)
  assert.match(workflow, /gh issue create --title "\[registry-sync\] Scheduled sync failed"/)
  assert.match(workflow, /gh issue close "\$number"/)
  assert.match(workflow, /issues: write/)
})

test('sync aborts instead of silently accepting partial GraphQL results', async () => {
  const sync = await readFile('scripts/sync-plugins.mjs', 'utf8')
  assert.match(sync, /DSH_MAX_PARTIAL_RATIO/)
  assert.match(sync, /refusing to publish a partially validated snapshot/)
})
