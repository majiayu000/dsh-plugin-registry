const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const GITHUB_REPOSITORY = /^[A-Za-z0-9._-]{1,100}$/

export function parseGitHubRepository(value) {
  let candidate = String(value || '').trim()
  if (!candidate) return null

  if (/^https?:\/\//i.test(candidate)) {
    let url
    try {
      url = new URL(candidate)
    } catch {
      return null
    }
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return null
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
    if (parts.length !== 2) return null
    candidate = parts.join('/')
  }

  const parts = candidate.replace(/\.git$/i, '').split('/')
  if (parts.length !== 2 || !GITHUB_OWNER.test(parts[0]) || !GITHUB_REPOSITORY.test(parts[1])) return null
  return `${parts[0]}/${parts[1]}`
}

function resultSignal(signalType, passed, reason) {
  return {
    signal_type: signalType,
    signal: { passed: Boolean(passed) },
    reason,
  }
}

export function evaluateRepository({ repository, bundleCheck, registryEntry = null }) {
  const topics = Array.isArray(repository?.topics) ? repository.topics : []
  const signals = [
    resultSignal('repository_public', Boolean(repository), repository ? 'repository metadata is public' : 'repository metadata is unavailable'),
    resultSignal('discovery_topic', topics.includes('dsh-plugin'), topics.includes('dsh-plugin') ? 'dsh-plugin topic is present' : 'dsh-plugin topic is missing'),
    resultSignal('bundle_manifest', Boolean(bundleCheck?.valid), bundleCheck?.reason || 'package.json does not declare a valid dsh.bundle'),
    resultSignal('repository_status', Boolean(repository && !repository.archived && !repository.fork), repository?.archived ? 'repository is archived' : repository?.fork ? 'repository is a fork' : 'repository is active and is not a fork'),
  ]

  return {
    signals,
    auto_discoverable: signals.every(item => item.signal.passed),
    listing: registryEntry
      ? { listed: true, source: registryEntry.source || 'unknown', id: registryEntry.id }
      : { listed: false, source: null, id: null },
  }
}

export function findRegistryEntry(registry, repository) {
  const key = String(repository || '').toLowerCase()
  return (registry?.plugins || []).find(plugin => String(plugin.id || '').toLowerCase() === key) || null
}
