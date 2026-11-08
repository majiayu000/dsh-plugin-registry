import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pluginShardFilename } from '../assets/plugin-route.js'
import { createDeploymentRegistry, generateSeoFiles, PAGES_MAX_FILE_BYTES, serializeRegistrySnapshot } from '../scripts/generate-seo.mjs'

async function fixture(t, source) {
  const root = await mkdtemp(join(tmpdir(), 'registry-artifact-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const distDir = join(root, 'dist')
  const registryPath = join(root, 'plugins.json')
  await mkdir(join(distDir, 'data'), { recursive: true })
  await writeFile(registryPath, source)
  // Model Vite's public-directory copy, not just an empty output directory.
  await writeFile(join(distDir, 'data/plugins.json'), source)
  return { distDir, registryPath, homepage: 'https://example.com/' }
}

test('postbuild compacts the deployment copy without changing the complete registry or source', async t => {
  const registry = {
    schemaVersion: 1, generatedAt: '2026-10-25T12:00:00Z',
    categories: { tools: { zh: '工具', en: 'Tools' } },
    extra: { untouched: [null, false, 0, 'line\nquote"\\中文😀'] },
    plugins: [{ id: 'acme/tool', name: 'Tool', owner: 'acme', category: 'tools',
      description: { en: 'Description', zh: '完整描述' }, extra: { keep: true } }],
  }
  const source = JSON.stringify(registry, null, 2) + '\n'
  const options = await fixture(t, source)
  await generateSeoFiles(options)
  const output = await readFile(join(options.distDir, 'data/plugins.json'), 'utf8')
  assert.equal(output, JSON.stringify(registry))
  assert.deepEqual(JSON.parse(output), registry)
  assert.equal(await readFile(options.registryPath, 'utf8'), source)
  const first = output
  await generateSeoFiles(options)
  assert.equal(await readFile(join(options.distDir, 'data/plugins.json'), 'utf8'), first)
})

test('postbuild accepts an oversized formatted source when its complete compact copy fits', async t => {
  const registry = { generatedAt: '2026-10-25T12:00:00Z', categories: {}, plugins: [] }
  const source = JSON.stringify(registry, null, 2) + '\n'.repeat(PAGES_MAX_FILE_BYTES)
  assert.ok(Buffer.byteLength(source) > PAGES_MAX_FILE_BYTES)
  const options = await fixture(t, source)
  await generateSeoFiles(options)
  const output = await readFile(join(options.distDir, 'data/plugins.json'), 'utf8')
  assert.deepEqual(JSON.parse(output), registry)
  assert.ok(Buffer.byteLength(output) < PAGES_MAX_FILE_BYTES)
  assert.equal(await readFile(options.registryPath, 'utf8'), source)
})

test('the compact registry limit accepts exactly 25 MiB and rejects one byte more', () => {
  const overhead = Buffer.byteLength(JSON.stringify({ value: '' }))
  const exact = { value: 'x'.repeat(PAGES_MAX_FILE_BYTES - overhead) }
  assert.equal(Buffer.byteLength(serializeRegistrySnapshot(exact)), PAGES_MAX_FILE_BYTES)
  assert.throws(() => serializeRegistrySnapshot({ value: exact.value + 'x' }), /after minification.*26214400 bytes/)
})

test('postbuild counts UTF-8 bytes and rejects oversize before replacing outputs or the build marker', async t => {
  const registry = { plugins: [], extra: '中'.repeat(Math.floor(PAGES_MAX_FILE_BYTES / 3)) }
  const source = JSON.stringify(registry)
  assert.ok(source.length < PAGES_MAX_FILE_BYTES)
  assert.ok(Buffer.byteLength(source) > PAGES_MAX_FILE_BYTES)
  const options = await fixture(t, source)
  const markerPath = join(options.distDir, 'data/detail-build.json')
  await writeFile(markerPath, '{"version":"previous"}')
  await assert.rejects(generateSeoFiles(options), /data\/plugins.json.*after minification.*Cloudflare Pages/)
  assert.equal(await readFile(markerPath, 'utf8'), '{"version":"previous"}')
  assert.equal(await readFile(join(options.distDir, 'data/plugins.json'), 'utf8'), source)
  assert.equal(await readFile(options.registryPath, 'utf8'), source)
})

test('the deployment projection keeps the published schema contract and drops optional detail fields', () => {
  const contract = {
    id: 'acme/tool', name: 'Tool', owner: 'acme', url: 'https://github.com/acme/tool',
    description: { zh: '工具', en: 'Tool' }, category: 'tools', stars: 3, forks: 1,
    source: 'discovered', trustLevel: 'manifest_verified',
    verification: { manifest: 'shape_validated', patch: 'exists', installation: 'not_tested' },
    install: 'dsh plugin --profile web add github:acme/tool', icon: 'https://github.com/acme.png',
  }
  const registry = {
    schemaVersion: 2, generatedAt: '2026-11-08T00:00:00.000Z',
    categories: { tools: { zh: '工具', en: 'Tools' } }, stats: { published: 1 }, sources: { community: 'x' },
    plugins: [{ ...contract, topics: ['deepseek-harness'], verifiedCommit: 'a'.repeat(40), packageName: '@acme/tool', archived: false }],
  }
  const projected = createDeploymentRegistry(registry)
  // Top-level metadata is preserved verbatim; only plugin rows are projected.
  assert.equal(projected.schemaVersion, 2)
  assert.equal(projected.generatedAt, registry.generatedAt)
  assert.deepEqual(projected.categories, registry.categories)
  assert.deepEqual(projected.stats, registry.stats)
  assert.deepEqual(projected.sources, registry.sources)
  assert.deepEqual(projected.plugins, [contract])
  // The complete registry is never mutated.
  assert.deepEqual(registry.plugins[0].topics, ['deepseek-harness'])
  assert.equal(registry.plugins[0].verifiedCommit, 'a'.repeat(40))
})

test('postbuild projects an oversized registry to the schema contract instead of failing the sync', async t => {
  const contract = {
    id: 'acme/tool', name: 'Tool', owner: 'acme', url: 'https://github.com/acme/tool',
    description: { zh: '工具', en: 'Tool' }, category: 'tools', stars: 3, forks: 1,
    source: 'discovered', trustLevel: 'manifest_verified',
    verification: { manifest: 'shape_validated', patch: 'exists', installation: 'not_tested' },
    install: 'dsh plugin --profile web add github:acme/tool', icon: 'https://github.com/acme.png',
  }
  // Mirror catalog growth with ordinary-sized rows. A single oversized topic
  // would also overflow the untouched browse snapshot and detail shard.
  const topics = Array.from({ length: 20 }, (_, i) => `deepseek-harness-plugin-topic-${i}`)
  const plugin = { ...contract, topics }
  const count = Math.ceil(PAGES_MAX_FILE_BYTES / Buffer.byteLength(JSON.stringify(plugin))) + 1
  const plugins = Array.from({ length: count }, (_, i) => ({ ...plugin, id: `acme/tool-${i}` }))
  const registry = {
    schemaVersion: 2, generatedAt: '2026-11-08T00:00:00.000Z',
    categories: { tools: { zh: '工具', en: 'Tools' } }, stats: { published: count }, sources: {},
    plugins,
  }
  const source = JSON.stringify(registry)
  assert.ok(Buffer.byteLength(source) > PAGES_MAX_FILE_BYTES)
  assert.ok(Buffer.byteLength(JSON.stringify(createDeploymentRegistry(registry))) < PAGES_MAX_FILE_BYTES)
  const options = await fixture(t, source)

  // The build must complete rather than throw.
  await generateSeoFiles(options)

  const outputText = await readFile(join(options.distDir, 'data/plugins.json'), 'utf8')
  assert.ok(Buffer.byteLength(outputText) < PAGES_MAX_FILE_BYTES)
  const output = JSON.parse(outputText)
  assert.equal(output.plugins.length, count)
  assert.deepEqual(output.plugins[0], { ...contract, id: plugins[0].id })
  assert.deepEqual(output.plugins.at(-1), { ...contract, id: plugins.at(-1).id })
  assert.deepEqual(output.categories, registry.categories)
  assert.deepEqual(output.stats, registry.stats)
  // The canonical source snapshot is left complete and untouched.
  assert.equal(await readFile(options.registryPath, 'utf8'), source)
  // The build marker is published only after the projected outputs are ready.
  assert.ok(JSON.parse(await readFile(join(options.distDir, 'data/detail-build.json'), 'utf8')).version)

  // No regression: detail shards still carry the complete plugin record.
  const first = plugins[0]
  const shard = JSON.parse(await readFile(join(options.distDir, 'data/plugin-shards', pluginShardFilename(first.id) + '.json'), 'utf8'))
  assert.deepEqual(shard.documents[first.id].plugin, first)

  // No regression: the browse snapshot still carries the complete browse fields.
  const browseFilename = (await readdir(join(options.distDir, 'data'))).find(name => name.startsWith('browse-'))
  assert.ok(browseFilename)
  const browse = JSON.parse(await readFile(join(options.distDir, 'data', browseFilename), 'utf8'))
  assert.equal(browse.plugins.length, count)
  assert.deepEqual(browse.plugins[0][browse.fields.indexOf('topics')], topics)

  // Pages uploads every generated asset, not just data/plugins.json.
  async function assertUploadSizes(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await assertUploadSizes(path)
      else assert.ok((await stat(path)).size <= PAGES_MAX_FILE_BYTES, `${path} exceeds the Pages file limit`)
    }
  }
  await assertUploadSizes(options.distDir)
})
