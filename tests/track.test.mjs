import assert from 'node:assert/strict'
import test from 'node:test'
import { handleTrack, validateTrackPayload, visitorDigest } from '../functions/api/track.js'

function trackContext({ payload, origin = 'https://plugin.dshdesk.com', ip = '203.0.113.7', env = {} } = {}) {
  const body = payload === undefined ? undefined : JSON.stringify(payload)
  const headers = { 'content-type': 'application/json' }
  if (origin) headers.origin = origin
  const request = new Request('https://plugin.dshdesk.com/api/track', { method: 'POST', headers, body })
  return {
    request,
    env: {
      TRACKING: {
        writeDataPoint(point) { this.lastPoint = point },
      },
      ...env,
    },
  }
}

test('track payload accepts known events and shaped plugin ids', () => {
  assert.deepEqual(validateTrackPayload({ pluginId: 'acme/plugin', event: 'view' }).value, { pluginId: 'acme/plugin', event: 'view' })
  assert.deepEqual(validateTrackPayload({ pluginId: 'acme/repo#sub', event: 'copy' }).value, { pluginId: 'acme/repo#sub', event: 'copy' })
  assert.ok(validateTrackPayload({ pluginId: 'acme/plugin', event: 'install' }).error)
  assert.ok(validateTrackPayload({ pluginId: '../etc/passwd', event: 'view' }).error)
  assert.ok(validateTrackPayload({ pluginId: '', event: 'view' }).error)
  assert.ok(validateTrackPayload(null).error)
})

test('handleTrack records a data point with plugin id as index', async () => {
  const context = trackContext({ payload: { pluginId: 'acme/plugin', event: 'copy' } })
  const response = await handleTrack(context)
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('x-track'), 'recorded')
  assert.deepEqual(context.env.TRACKING.lastPoint.indexes, ['acme/plugin'])
  assert.deepEqual(context.env.TRACKING.lastPoint.blobs.slice(0, 2), ['copy', 'acme/plugin'])
})

test('cross-origin beacons are rejected without recording', async () => {
  const context = trackContext({ payload: { pluginId: 'acme/plugin', event: 'view' }, origin: 'https://evil.example' })
  const response = await handleTrack(context)
  assert.equal(response.headers.get('x-track'), 'rejected')
  assert.equal(context.env.TRACKING.lastPoint, undefined)
})

test('invalid payloads and oversized bodies never reach the dataset', async () => {
  const invalid = trackContext({ payload: { pluginId: 'acme/plugin', event: 'download' } })
  assert.equal((await handleTrack(invalid)).headers.get('x-track'), 'invalid')
  assert.equal(invalid.env.TRACKING.lastPoint, undefined)

  const unbound = trackContext({ payload: { pluginId: 'x'.repeat(300), event: 'view' } })
  assert.equal((await handleTrack(unbound)).headers.get('x-track'), 'invalid')
})

test('missing Analytics Engine binding degrades to a skip, not an error', async () => {
  const context = trackContext({ payload: { pluginId: 'acme/plugin', event: 'view' }, env: {} })
  delete context.env.TRACKING
  const response = await handleTrack(context)
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('x-track'), 'skipped')
})

test('visitor digest is stable per ip+salt and differs across salt or ip', async () => {
  const a = await visitorDigest('203.0.113.7', 'salt-a')
  assert.equal(a, await visitorDigest('203.0.113.7', 'salt-a'))
  assert.notEqual(a, await visitorDigest('203.0.113.8', 'salt-a'))
  assert.notEqual(a, await visitorDigest('203.0.113.7', 'salt-b'))
  assert.match(a, /^[0-9a-f]{16}$/)
})
