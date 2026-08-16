export const INSTALL_PROFILES = ['web', 'tui', 'headless']

const INSTALL_COMMAND = /^dsh plugin --profile ([A-Za-z0-9._-]+) add (\S+)$/
const GITHUB_SPEC = /^github:([^/#\s]+\/[^/#\s]+)(?:#([^#\s]+))?$/i
const COMMIT_SHA = /^[0-9a-f]{40}$/

export function parseInstallCommand(install) {
  const match = String(install || '').match(INSTALL_COMMAND)
  if (!match) return null
  return { profile: match[1], spec: match[2] }
}

export function pinInstallSpec(spec, { verifiedCommit } = {}) {
  if (!COMMIT_SHA.test(String(verifiedCommit || ''))) return spec
  const github = String(spec || '').match(GITHUB_SPEC)
  if (!github) return spec
  return `github:${github[1]}#${verifiedCommit}`
}

export function buildInstallCommand({ profile = 'web', spec, verifiedCommit } = {}) {
  const resolvedProfile = INSTALL_PROFILES.includes(profile) ? profile : 'web'
  return `dsh plugin --profile ${resolvedProfile} add ${pinInstallSpec(spec, { verifiedCommit })}`
}

export function pinInstallCommand(install, { verifiedCommit } = {}) {
  const parsed = parseInstallCommand(install)
  if (!parsed) return install
  return buildInstallCommand({ ...parsed, verifiedCommit })
}

export function packageNameFromSpec(spec) {
  const value = String(spec || '').trim()
  if (!value || GITHUB_SPEC.test(value)) return ''
  if (value.startsWith('@')) {
    const scoped = value.match(/^(@[^/]+\/[^@]+)(?:@.+)?$/)
    return scoped ? scoped[1] : ''
  }
  return value.split('@')[0]
}

export function githubSpecIsPinned(spec, verifiedCommit) {
  if (!COMMIT_SHA.test(String(verifiedCommit || ''))) return false
  const github = String(spec || '').match(GITHUB_SPEC)
  return Boolean(github && github[2] === verifiedCommit)
}
