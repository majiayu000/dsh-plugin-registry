import assert from 'node:assert/strict'
import test from 'node:test'
import { writeClipboardText } from '../assets/clipboard.js'

test('clipboard helper resolves only after the command is written', async () => {
  const writes = []
  await writeClipboardText('dsh plugin add example', {
    async writeText(value) { writes.push(value) },
  })
  assert.deepEqual(writes, ['dsh plugin add example'])
})

test('clipboard helper surfaces unavailable and rejected writes', async () => {
  await assert.rejects(writeClipboardText('command', null), /unavailable/)
  await assert.rejects(
    writeClipboardText('command', { async writeText() { throw new Error('permission denied') } }),
    /permission denied/,
  )
})
