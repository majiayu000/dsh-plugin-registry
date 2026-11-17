// Local workerd CPU/memory profile of the query-only endpoint (#106).
// node experiments/query-only/profile.mjs [--entry worker.js|worker-lazy.js] [--cold "q=memory"] [--out file.json]
// Starts `wrangler dev` (local workerd, no account), attaches to its V8
// inspector and profiles each request separately. Hard-kills itself after
// a bounded time. Numbers are local observations, not Cloudflare billing.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pluginRoute } from '../../assets/plugin-route.js'
import { BROWSE_PLUGIN_FIELDS } from '../../assets/browse-snapshot.js'
import { createOracle } from './oracle.mjs'
import { PROFILE_WORKLOAD, searchParams } from './workload.mjs'

const { values: args } = parseArgs({ options: {
  entry: { type: 'string', default: 'worker.js' }, cold: { type: 'string', default: '' },
  out: { type: 'string' }, port: { type: 'string', default: '8799' }, inspector: { type: 'string', default: '9239' },
  rounds: { type: 'string', default: '2' }, batch: { type: 'string', default: '60' }, 'skip-verify': { type: 'boolean', default: false },
} })
const root = resolve(import.meta.dirname, '../..')
const base = `http://127.0.0.1:${args.port}`
const HARD_LIMIT_MS = 15 * 60_000

const loadStart = (await import('node:os')).loadavg()
const persist = await mkdtemp(join(root, '.generated', 'wrangler-persist-'))
const child = spawn(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', join('experiments/query-only', args.entry),
  '--config', 'experiments/query-only/wrangler.jsonc', '--ip', '127.0.0.1', '--port', args.port,
  '--inspector-port', args.inspector, '--persist-to', persist, '--log-level', 'warn', '--show-interactive-dev-session=false'], {
  cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''
child.stdout.on('data', chunk => { log += chunk })
child.stderr.on('data', chunk => { log += chunk })
const killer = setTimeout(() => { console.error('Hard time limit reached'); cleanup(); process.exit(2) }, HARD_LIMIT_MS)
let exited = false
child.on('exit', () => { exited = true })
function cleanup() { try { child.kill('SIGTERM') } catch {} }
process.on('exit', cleanup)

async function waitFor(check, label, ms = 180_000) {
  const until = Date.now() + ms
  for (;;) {
    try { const value = await check(); if (value) return value } catch {}
    if (exited) throw new Error(`wrangler dev exited\n${log}`)
    if (Date.now() > until) throw new Error(`Timed out waiting for ${label}\n${log}`)
    await new Promise(r => setTimeout(r, 250))
  }
}

// Static asset served without invoking the user Worker, so readiness does not warm it.
await waitFor(async () => (await fetch(`${base}/data/detail-build.json`)).ok, 'wrangler dev')
const targets = await waitFor(async () => (await fetch(`http://127.0.0.1:${args.inspector}/json`)).json(), 'inspector')
// The inspector proxy accepts only allow-listed Origin headers.
const socket = new WebSocket(targets[0].webSocketDebuggerUrl, { headers: { origin: 'http://127.0.0.1' } })
await new Promise((ok, fail) => { socket.onopen = ok; socket.onerror = fail })
let nextId = 0
const waiting = new Map()
socket.onmessage = event => {
  const message = JSON.parse(event.data)
  if (message.id && waiting.has(message.id)) {
    const { ok, fail } = waiting.get(message.id)
    waiting.delete(message.id)
    message.error ? fail(new Error(JSON.stringify(message.error))) : ok(message.result)
  }
}
const trace = process.env.PROFILE_TRACE ? message => console.error(`[profile] ${message}`) : () => {}
const send = (method, params = {}) => new Promise((ok, fail) => {
  const id = ++nextId
  trace(`${id} ${method}`)
  waiting.set(id, { ok, fail })
  socket.send(JSON.stringify({ id, method, params }))
  setTimeout(() => { if (waiting.delete(id)) fail(new Error(`${method} timed out`)) }, 60_000)
})

function workerdPid() {
  const rows = execFileSync('ps', ['-Ao', 'pid=,ppid=,comm=']).toString().trim().split('\n').map(line => line.trim().split(/\s+/, 3))
  const descendants = new Set([String(child.pid)])
  for (let changed = true; changed;) {
    changed = false
    for (const [pid, ppid] of rows) if (descendants.has(ppid) && !descendants.has(pid)) { descendants.add(pid); changed = true }
  }
  // wrangler runs two workerd runtimes (its proxy and the user Worker with
  // assets); the user runtime is the one holding the bundled document.
  const candidates = rows.filter(([pid, , comm]) => descendants.has(pid) && /workerd/.test(comm)).map(([pid]) => pid)
  const rss = pid => Number(execFileSync('ps', ['-o', 'rss=', '-p', pid]).toString().trim())
  return candidates.sort((a, b) => rss(b) - rss(a))[0]
}
const pid = workerdPid()
function processStats() {
  if (!pid) return null
  const [rss, time] = execFileSync('ps', ['-o', 'rss=,time=', '-p', pid]).toString().trim().split(/\s+/)
  const [minutes, seconds] = time.split(':')
  return { rssMiB: Number(rss) / 1024, cpuMs: (Number(minutes) * 60 + Number(seconds)) * 1000 }
}

const heap = async () => {
  const { usedSize, totalSize } = await send('Runtime.getHeapUsage')
  return { usedMiB: usedSize / 2 ** 20, totalMiB: totalSize / 2 ** 20 }
}

function summarize(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node.callFrame.functionName]))
  let active = 0, gc = 0, program = 0
  profile.samples.forEach((sample, i) => {
    const name = nodes.get(sample)
    const delta = profile.timeDeltas[i] / 1000
    if (name === '(idle)') return
    active += delta
    if (name === '(garbage collector)') gc += delta
    if (name === '(program)') program += delta
  })
  return { activeMs: active, gcMs: gc, programMs: program, jsMs: active - program }
}

await send('Profiler.enable')
await send('Profiler.setSamplingInterval', { interval: 100 })
const startup = { heap: await heap(), process: processStats() }

const searchPath = options => `/api/search?${searchParams(options)}`
async function profiled(path, concurrency = 1) {
  await send('Profiler.start')
  const wall = performance.now()
  const responses = await Promise.all(Array.from({ length: concurrency }, () => fetch(base + path).then(async response => ({
    status: response.status, bytes: (await response.arrayBuffer()).byteLength,
  }))))
  const wallMs = performance.now() - wall
  const { profile } = await send('Profiler.stop')
  return { path, concurrency, wallMs, ...summarize(profile), status: responses.map(r => r.status), bytes: Math.max(...responses.map(r => r.bytes)), heap: await heap() }
}

// Cold: the first request this isolate serves. Measured from workerd process
// CPU time (10 ms resolution) without the sampling profiler attached.
const coldPath = `/api/search${args.cold ? '?' + args.cold : ''}`
const coldBefore = processStats()
const coldWall = performance.now()
const coldResponse = await fetch(base + coldPath)
const coldBytes = (await coldResponse.arrayBuffer()).byteLength
const coldAfter = processStats()
const cold = { path: coldPath, status: coldResponse.status, bytes: coldBytes, wallMs: performance.now() - coldWall,
  processCpuMs: coldAfter && coldAfter.cpuMs - coldBefore.cpuMs, heap: await heap() }
// Warm per-request V8 samples. Under heavy host load, descheduled time is
// attributed to the running frame, so treat these as an upper bound.
const warm = []
for (let round = 0; round < Number(args.rounds); round++) {
  for (const options of PROFILE_WORKLOAD) warm.push({ round, ...await profiled(searchPath(options)) })
}
const concurrent = await profiled(searchPath({ q: 'agent' }), 6)
// Batch averages from workerd process CPU time: not affected by sampling or
// descheduling, but include HTTP, routing and the asset server. The 400
// baseline (rejected before any query or asset read) isolates that overhead.
const BATCH_WORKLOAD = [{ sort: 'invalid' }, { q: 'zzzzqx' }, {}, { page: 2 }, { q: 'memory' }, { q: '记忆' }, { q: 'agent' }, { q: 'a' }, { q: 'dsh' },
  { q: 'mcp server' }, { q: 'a', sort: 'new' }, { q: 'agent', sort: 'stars' }, { category: 'memory' }, { category: 'tools', sort: 'forks' },
  { manifest: 'not_validated' }, { q: 'memory', manifest: 'not_validated' }, { listing: 'low_signal', q: 'a' }, { q: 'agent', page: 40 }]
const batches = []
for (const options of BATCH_WORKLOAD) {
  const before = processStats()
  const started = performance.now()
  let status
  for (let i = 0; i < Number(args.batch); i++) { const response = await fetch(base + searchPath(options)); status = response.status; await response.arrayBuffer() }
  const after = processStats()
  batches.push({ options, status, requests: Number(args.batch), wallMsPerRequest: (performance.now() - started) / Number(args.batch),
    processCpuMsPerRequest: after && (after.cpuMs - before.cpuMs) / Number(args.batch) })
}
const baseline = batches[0].processCpuMsPerRequest
for (const batch of batches) batch.netOfBaselineMs = batch.processCpuMsPerRequest - baseline
// workerd does not answer HeapProfiler.collectGarbage; report the heap as
// observed after the workload (includes uncollected garbage).
const final = { heap: await heap(), process: processStats() }

// HTTP consistency: endpoint pages equal the browser order and cards equal
// the snapshot; install detail resolves the same plugin under the same version.
let verification = null
if (!args['skip-verify']) {
  const [registry, audit] = await Promise.all(['public/data/plugins.json', 'public/data/registry-audit.json']
    .map(path => readFile(join(root, path), 'utf8').then(JSON.parse)))
  const reference = createOracle(registry, audit)
  const byId = new Map(registry.plugins.map(plugin => [plugin.id, plugin]))
  const detailVersion = (await (await fetch(`${base}/data/detail-build.json`)).json()).version
  let pages = 0, cards = 0, details = 0, version
  for (const options of PROFILE_WORKLOAD) {
    const response = await fetch(base + searchPath(options))
    assert.equal(response.status, 200)
    const body = await response.json()
    version ??= body.version
    assert.equal(body.version, version)
    const expected = reference(options)
    const page = options.page || 1
    assert.equal(body.total, expected.length, JSON.stringify(options))
    assert.deepEqual(body.items.map(item => item.id), expected.slice((page - 1) * 30, page * 30), JSON.stringify(options))
    pages++
    for (const item of body.items) {
      const plugin = byId.get(item.id)
      if (!plugin) { assert.equal(item.trustLevel, 'pending_review'); continue }
      for (const field of BROWSE_PLUGIN_FIELDS) assert.deepEqual(item[field], plugin[field] ?? null, `${item.id}.${field}`)
      cards++
    }
    const published = body.items.filter(item => byId.has(item.id)).slice(0, 3)
    for (const item of published) {
      const detail = await fetch(`${base}/api/${pluginRoute(item)}`)
      assert.equal(detail.status, 200, item.id)
      assert.deepEqual((await detail.json()).plugin, byId.get(item.id))
      details++
    }
  }
  assert.equal(detailVersion, version, 'detail and search share one content version')
  const stale = await fetch(base + searchPath({ q: 'memory', page: 2, version: 'stale' }))
  assert.equal(stale.status, 409)
  verification = { pages, cards, details, version, staleVersion: stale.status, result: 'exact match' }
}

clearTimeout(killer)
socket.close()
cleanup()
await rm(persist, { recursive: true, force: true })

const steady = warm.filter(row => row.round > 0)
const percentile = (values, p) => { const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] }
const result = {
  entry: args.entry, node: process.version, pid, loadAverage: { start: loadStart, end: (await import('node:os')).loadavg() },
  startup, cold, final,
  steady: {
    requests: steady.length,
    activeMsP50: percentile(steady.map(r => r.activeMs), 0.5), activeMsP95: percentile(steady.map(r => r.activeMs), 0.95),
    activeMsMax: Math.max(...steady.map(r => r.activeMs)), over10ms: steady.filter(r => r.activeMs > 10).length,
    maxBytes: Math.max(...steady.map(r => r.bytes)), maxUsedHeapMiB: Math.max(...warm.map(r => r.heap.usedMiB)), maxTotalHeapMiB: Math.max(...warm.map(r => r.heap.totalMiB)),
  },
  concurrent, batches, verification,
  perRequest: steady.map(r => ({ path: r.path, round: r.round, activeMs: +r.activeMs.toFixed(2), gcMs: +r.gcMs.toFixed(2), bytes: r.bytes, status: r.status[0] })),
}
if (args.out) await writeFile(args.out, JSON.stringify(result, null, 2))
console.log(JSON.stringify({ ...result, perRequest: undefined }, null, 2))
process.exit(0)
