import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchJson, rateLimitWaitMs } from '../scripts/sync-plugins.mjs'

function headersOf(values) {
  return { get: name => (name in values ? values[name] : null) }
}

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

test('rate-limit backoff prefers retry-after over the primary reset window', () => {
  const response = {
    headers: headersOf({
      'retry-after': '47',
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Math.floor(Date.now() / 1_000) + 3_600),
    }),
  }

  assert.equal(rateLimitWaitMs(response, 0), 47_000)
})

test('rate-limit backoff grows exponentially when GitHub sends no pacing headers', () => {
  const response = { headers: headersOf({}) }

  assert.equal(rateLimitWaitMs(response, 0), 5_000)
  assert.equal(rateLimitWaitMs(response, 1), 10_000)
  assert.equal(rateLimitWaitMs(response, 4), 80_000)
  assert.equal(rateLimitWaitMs(response, 9), 120_000)
})

test('rate-limit backoff waits for the reset timestamp only once the budget is exhausted', () => {
  const reset = String(Math.floor(Date.now() / 1_000) + 30)

  const exhausted = {
    headers: headersOf({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }),
  }
  const wait = rateLimitWaitMs(exhausted, 0)
  assert.ok(wait > 25_000 && wait <= 31_000, `expected a wait near the reset window, got ${wait}`)

  // A secondary rate limit still reports plenty of primary budget, so its reset timestamp can
  // be an hour away and must not be mistaken for the wait this request needs.
  const secondaryLimit = {
    headers: headersOf({ 'x-ratelimit-remaining': '4966', 'x-ratelimit-reset': reset }),
  }
  assert.equal(rateLimitWaitMs(secondaryLimit, 0), 5_000)
})

test('GitHub requests retry a secondary rate limit instead of failing the sync', async () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn
  let calls = 0

  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) {
      return {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: headersOf({ 'retry-after': '1', 'x-ratelimit-remaining': '4966' }),
      }
    }
    return { ok: true, json: async () => ({ recovered: true }) }
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

test('a spent rate-limit budget fails without consuming the transient retry budget', async () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn
  let calls = 0

  globalThis.fetch = async () => {
    calls += 1
    return {
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: headersOf({ 'retry-after': '1' }),
    }
  }
  console.warn = () => {}

  try {
    await assert.rejects(
      fetchJson('https://api.github.com/graphql'),
      /403 Forbidden: https:\/\/api\.github\.com\/graphql/,
    )
    assert.equal(calls, 6)
  } finally {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
  }
})
