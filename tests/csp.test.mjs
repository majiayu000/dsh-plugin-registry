import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const pages = ['404.html', 'index.html', 'dashboard.html', 'plugin-detail.html', 'publish.html', 'policy.html']

test('every page ships a strict meta CSP without inline module scripts', async () => {
  for (const page of pages) {
    const html = await readFile(page, 'utf8')
    assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'none'/, `${page} must declare a default-src 'none' CSP`)
    assert.match(html, /script-src 'self'/, `${page} must only allow self-hosted scripts`)
    assert.match(html, /img-src 'self' data:(?: https:\/\/github\.com https:\/\/avatars\.githubusercontent\.com)?(?: https:\/\/challenges\.cloudflare\.com)?;/, `${page} must restrict images to self-hosted or GitHub-hosted assets`)
    assert.match(html, /object-src 'none'/, `${page} must disable plugins`)
    assert.doesNotMatch(html, /<script type="module">/, `${page} must not keep inline module scripts`)
  }
  for (const page of pages.filter(page => page !== 'policy.html')) {
    const html = await readFile(page, 'utf8')
    assert.match(html, /img-src 'self' data: https:\/\/github\.com https:\/\/avatars\.githubusercontent\.com/, `${page} renders plugin icons, so images must allow GitHub-hosted domains`)
  }
})

test('only the publish page may talk to Turnstile and the GitHub API', async () => {
  for (const page of ['404.html', 'index.html', 'dashboard.html', 'plugin-detail.html', 'policy.html']) {
    const html = await readFile(page, 'utf8')
    assert.doesNotMatch(html, /challenges\.cloudflare\.com/, `${page} must not reference Turnstile`)
    assert.doesNotMatch(html, /api\.github\.com/, `${page} must not call the GitHub API`)
  }
  const publish = await readFile('publish.html', 'utf8')
  const publishScript = await readFile('assets/page-publish.js', 'utf8')
  const csp = publish.match(/Content-Security-Policy" content="([^"]+)"/)[1]
  assert.match(csp, /script-src 'self' https:\/\/challenges\.cloudflare\.com/)
  assert.match(csp, /connect-src 'self' https:\/\/api\.github\.com https:\/\/challenges\.cloudflare\.com/)
  assert.match(csp, /frame-src https:\/\/challenges\.cloudflare\.com/)
  assert.match(publishScript, /https:\/\/api\.github\.com\/repos\//)
})
