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

test('GitHub requests retry when a successful response body is empty or truncated JSON', async () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn
  let calls = 0

  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) {
      return {
        ok: true,
        json: async () => { throw new SyntaxError('Unexpected end of JSON input') },
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

test('GitHub requests surface truncated JSON as a retryable gateway-class error', async () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => { throw new SyntaxError('Unexpected end of JSON input') },
  })
  console.warn = () => {}

  try {
    await assert.rejects(
      fetchJson('https://api.github.com/graphql'),
      error => {
        assert.match(String(error.message), /502 Bad Gateway: empty or invalid JSON response/)
        assert.match(String(error.message), /api\.github\.com\/graphql/)
        assert.ok(error.cause instanceof SyntaxError)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
  }
})
