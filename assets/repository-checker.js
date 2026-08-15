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

const CHECKER_COPY = {
  'zh-CN': {
    pending: '待检查', passed: '通过', failed: '未通过', checking: '检查中…', checkAgain: '重新检查',
    invalidInput: '请输入 owner/repo 或完整的 GitHub 仓库地址。',
    ready: '检查通过。这个仓库会在下一轮同步中被自动发现。',
    curated: '这个仓库已被社区目录收录，但还不符合自动发现契约；现有收录不会受影响。',
    incomplete: '还有项目未通过。请按左侧契约修复后重新检查。',
    manifestPrefix: 'Manifest 未通过：',
    packageMissing: '根目录中没有 package.json。',
    invalid_json: 'package.json 不是有效的 JSON。',
    bundle_not_object: 'dsh.bundle 必须是对象。',
    patch_missing: 'dsh.bundle.patch 必须是非空字符串。',
    patch_unsafe: 'dsh.bundle.patch 必须是以“./”开头的安全相对路径。',
    repositoryMissing: '找不到这个公开仓库。请检查地址，或确认仓库不是私有仓库。',
    rateLimited: 'GitHub 暂时限制了检查频率，请稍后再试。',
    unavailable: '暂时无法读取 GitHub 仓库，请稍后再试。',
    submitAfterCheck: '先检查仓库，GitHub 提交会自动带上预检结果。',
    submitReady: '预检已通过。可以等待自动发现，也可以提交到 GitHub 获得可追踪的确认。',
    submitWithWarnings: '仍有未通过项目。你可以先修复，或提交到 GitHub 记录问题并获取审核反馈。',
  },
  'en-US': {
    pending: 'Pending', passed: 'Passed', failed: 'Failed', checking: 'Checking…', checkAgain: 'Check again',
    invalidInput: 'Enter owner/repository or a complete GitHub repository URL.',
    ready: 'Checks passed. This repository will be discovered during the next sync.',
    curated: 'This repository is already listed in the community catalog, but it does not yet meet the auto-discovery contract. Its current listing is unaffected.',
    incomplete: 'Some checks failed. Fix the contract issues on the left and check again.',
    manifestPrefix: 'Manifest failed: ',
    packageMissing: 'No package.json was found in the repository root.',
    invalid_json: 'package.json is not valid JSON.',
    bundle_not_object: 'dsh.bundle must be an object.',
    patch_missing: 'dsh.bundle.patch must be a non-empty string.',
    patch_unsafe: 'dsh.bundle.patch must be a safe relative path beginning with "./".',
    repositoryMissing: 'This public repository could not be found. Check the URL or confirm that the repository is not private.',
    rateLimited: 'GitHub has temporarily rate-limited checks. Try again later.',
    unavailable: 'The GitHub repository cannot be read right now. Try again later.',
    submitAfterCheck: 'Check the repository first. The GitHub submission will include the pre-check results.',
    submitReady: 'Pre-checks passed. Wait for auto-discovery or submit to GitHub for a trackable confirmation.',
    submitWithWarnings: 'Some checks failed. Fix them first, or submit to GitHub to record the problem and get review feedback.',
  },
}

export function repositoryCheckerCopy(locale) {
  return CHECKER_COPY[locale === 'en-US' ? 'en-US' : 'zh-CN']
}

export function manifestFailureMessage(bundleCheck, locale) {
  const copy = repositoryCheckerCopy(locale)
  const reason = copy[bundleCheck?.reason_code] || bundleCheck?.reason || copy.packageMissing
  return copy.manifestPrefix + reason
}

export function githubFailureMessage(status, locale) {
  const copy = repositoryCheckerCopy(locale)
  if (status === 404) return copy.repositoryMissing
  if (status === 403 || status === 429) return copy.rateLimited
  return copy.unavailable
}
