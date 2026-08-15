import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('publish flow uses semantic steps, code, and heading order', async () => {
  const html = await readFile('publish.html', 'utf8')
  assert.match(html, /<ol class="stepper[^>]+aria-label="自动发现流程"/)
  assert.match(html, /class="step-t"[\s\S]*class="step-d"/)
  assert.match(html, /<pre class="codeblock"><code>/)
  assert.doesNotMatch(html, /<main[\s\S]*<h3>/)
})

test('repository checker is an accessible keyboard-submittable form', async () => {
  const html = await readFile('publish.html', 'utf8')
  assert.match(html, /<form id="repo-checker-form" novalidate>/)
  assert.match(html, /type="submit"/)
  assert.match(html, /addEventListener\('submit'/)
  assert.match(html, /aria-invalid/)
  assert.match(html, /role="status" aria-live="polite"/)
  assert.match(html, /class="check-state"/)
})

test('repository field and result states have matching styles', async () => {
  const css = await readFile('assets/registry.css', 'utf8')
  assert.match(css, /\.field-label\s*\{/)
  assert.match(css, /\.field input, \.field select, \.field textarea/)
  assert.match(css, /\.repo-checker \.check-row\.fail/)
  assert.match(css, /\.check-state\s*\{/)
})
