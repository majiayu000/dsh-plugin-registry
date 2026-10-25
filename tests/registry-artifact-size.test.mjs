import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { generateSeoFiles, PAGES_MAX_FILE_BYTES, serializeRegistrySnapshot } from '../scripts/generate-seo.mjs'

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
