import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('publish flow uses semantic steps, code, and heading order', async () => {
  const html = await readFile('publish.html', 'utf8')
  assert.match(html, /<ol class="stepper[^>]+aria-label="站内审核提交流程"/)
  assert.match(html, /class="step-t"[\s\S]*class="step-d"/)
  assert.match(html, /<pre class="codeblock"><code>/)
  assert.doesNotMatch(html, /<main[\s\S]*<h3>/)
})

test('repository checker is an accessible keyboard-submittable form', async () => {
  const [html, script] = await Promise.all([
    readFile('publish.html', 'utf8'),
    readFile('assets/page-publish.js', 'utf8'),
  ])
  const source = html + '\n' + script
  assert.match(source, /<form id="repo-checker-form" novalidate>/)
  assert.match(source, /type="submit"/)
  assert.match(script, /addEventListener\('submit'/)
  assert.match(script, /aria-invalid/)
  assert.match(source, /role="status" aria-live="polite"/)
  assert.match(source, /class="check-state"/)
  assert.match(source, /id="review-fields" hidden/)
  assert.match(source, /id="review-submit" type="button" disabled/)
  assert.match(source, /id="submission-receipt" hidden tabindex="-1"/)
  assert.match(script, /buildGitHubSubmissionUrl/)
  assert.match(script, /enableSubmission\(repo, check\)/)
  assert.match(script, /addEventListener\('input', disableSubmission\)/)
  assert.match(source, /issues\/new\?template=plugin_submission\.yml/)
  assert.match(script, /fetch\('\/api\/submissions'/)
  assert.match(source, /plugin_submission/)
})

test('repository field and result states have matching styles', async () => {
  const css = await readFile('assets/registry.css', 'utf8')
  assert.match(css, /\.field-label\s*\{/)
  assert.match(css, /\.field input, \.field select, \.field textarea/)
  assert.match(css, /\.repo-checker \.check-row\.fail/)
  assert.match(css, /\.check-state\s*\{/)
  assert.match(css, /\.pub-grid > \* \{ min-width: 0; \}/)
  assert.match(css, /\.review-fields\s*\{/)
  assert.match(css, /\.review-submit\s*\{/)
  assert.match(css, /\.submission-receipt\s*\{/)
  assert.match(css, /\.github-route\s*\{/)
})
