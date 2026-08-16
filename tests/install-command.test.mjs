import assert from 'node:assert/strict'
import test from 'node:test'
import {
  INSTALL_PROFILES,
  buildInstallCommand,
  packageNameFromSpec,
  parseInstallCommand,
  pinInstallCommand,
  pinInstallSpec,
} from '../assets/install-command.js'

const COMMIT = 'a'.repeat(40)

test('supported install profiles are the DSH profile names', () => {
  assert.deepEqual(INSTALL_PROFILES, ['web', 'tui', 'headless'])
})

test('parseInstallCommand reads profile and spec', () => {
  assert.deepEqual(
    parseInstallCommand('dsh plugin --profile tui add dsh-mini-tui@latest'),
    { profile: 'tui', spec: 'dsh-mini-tui@latest' },
  )
  assert.equal(parseInstallCommand('curl example.com | sh'), null)
})

test('pinInstallSpec pins a github spec to the verified commit and leaves npm specs alone', () => {
  assert.equal(pinInstallSpec('github:acme/plugin', { verifiedCommit: COMMIT }), `github:acme/plugin#${COMMIT}`)
  assert.equal(pinInstallSpec('github:acme/plugin#old', { verifiedCommit: COMMIT }), `github:acme/plugin#${COMMIT}`)
  assert.equal(pinInstallSpec('github:acme/plugin#permissions', { verifiedCommit: COMMIT }), `github:acme/plugin#${COMMIT}`)
  assert.equal(pinInstallSpec('dsh-better-sidebar', { verifiedCommit: COMMIT }), 'dsh-better-sidebar')
  assert.equal(pinInstallSpec('@scope/pkg@1.2.3', { verifiedCommit: COMMIT }), '@scope/pkg@1.2.3')
  assert.equal(pinInstallSpec('github:acme/plugin', { verifiedCommit: 'abc' }), 'github:acme/plugin')
})

test('buildInstallCommand rejects unknown profiles and pins github specs', () => {
  assert.equal(
    buildInstallCommand({ spec: 'github:acme/plugin', verifiedCommit: COMMIT }),
    `dsh plugin --profile web add github:acme/plugin#${COMMIT}`,
  )
  assert.equal(
    buildInstallCommand({ profile: 'tui', spec: 'dsh-mini-tui@latest' }),
    'dsh plugin --profile tui add dsh-mini-tui@latest',
  )
  assert.equal(
    buildInstallCommand({ profile: 'desktop', spec: 'github:acme/plugin' }),
    'dsh plugin --profile web add github:acme/plugin',
  )
})

test('pinInstallCommand rewrites an existing command in place', () => {
  assert.equal(
    pinInstallCommand('dsh plugin --profile web add github:acme/plugin', { verifiedCommit: COMMIT }),
    `dsh plugin --profile web add github:acme/plugin#${COMMIT}`,
  )
  assert.equal(
    pinInstallCommand('dsh plugin --profile web add dsh-better-sidebar', { verifiedCommit: COMMIT }),
    'dsh plugin --profile web add dsh-better-sidebar',
  )
})

test('packageNameFromSpec keeps npm names and drops versions', () => {
  assert.equal(packageNameFromSpec('dsh-mini-tui@latest'), 'dsh-mini-tui')
  assert.equal(packageNameFromSpec('@scope/pkg@1.0.0'), '@scope/pkg')
  assert.equal(packageNameFromSpec('@scope/pkg'), '@scope/pkg')
  assert.equal(packageNameFromSpec('github:acme/plugin'), '')
  assert.equal(packageNameFromSpec(`github:acme/plugin#${COMMIT}`), '')
})
