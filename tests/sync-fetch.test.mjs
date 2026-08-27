import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchJson } from '../scripts/sync-plugins.mjs'

test('GitHub requests retry when reading a successful response body is terminated', async () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn
  let calls = 0

  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) {
      return {
        ok: true,
        json: async () => { throw new TypeError('terminated') },
      }
    }
    return {
      ok: true,
      json: async () => ({ recovered: true }),
    }
  }
  console.warn = () => {}

  try {
    assert.deepEqual(await fetchJson('https://api.github.com/graphql'), { recovered: true })
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
  }
})
