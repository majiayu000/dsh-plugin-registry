import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('public source labels describe the community catalog without implying endorsement', async () => {
  const files = await Promise.all([
    readFile('assets/plugins.js', 'utf8'),
    readFile('assets/repository-checker.js', 'utf8'),
    readFile('plugin-detail.html', 'utf8'),
    readFile('index.html', 'utf8'),
    readFile('dashboard.html', 'utf8'),
  ])
  const copy = files.join('\n')

  assert.match(copy, /来源：社区目录/)
  assert.match(copy, /Community catalog/)
  assert.doesNotMatch(copy, /精选注册表|仅看精选|通过精选目录收录/)
  const renderer = files[0]
  assert.doesNotMatch(renderer, /社区目录收录/)
  assert.match(renderer, /Manifest 格式检查通过/)
  assert.match(renderer, /Manifest 未检查/)
})
