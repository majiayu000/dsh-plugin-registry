const DSH_DESCRIPTION_PATTERN = /\bdsh\b|deepseek[\s_-]*harness/i

function candidateName(candidate) {
  const identity = String(candidate?.name || candidate?.id || candidate?.full_name || '')
  return identity.split('/').pop().split('#')[0].toLowerCase()
}

function candidateDescription(candidate) {
  if (typeof candidate?.description === 'string') return candidate.description
  return [candidate?.description?.zh, candidate?.description?.en].filter(Boolean).join(' ')
}

export function hasDshCandidateContext(candidate) {
  if (candidate?.verification?.manifest === 'shape_validated') return true
  if (String(candidate?.reason || '').startsWith('dsh.bundle.patch')) return true

  const name = candidateName(candidate)
  if (name.startsWith('dsh') || name.includes('-dsh') || name.includes('_dsh')) return true
  if (DSH_DESCRIPTION_PATTERN.test(candidateDescription(candidate))) return true

  return (candidate?.topics || []).some(value => {
    const topic = String(value).toLowerCase()
    if (topic === 'dsh-plugin') return false
    return topic === 'dsh' || topic.startsWith('dsh-') || topic.startsWith('deepseek-harness')
  })
}

// Shared with the browser loader; preserve the audit-to-card normalization.
export function normalizePendingPlugin(entry) {
  var parts = String(entry.id || '').split('/');
  var owner = entry.owner || parts.shift() || '';
  var name = entry.name || parts.join('/') || entry.id;
  return {
    id: entry.id,
    name: name,
    owner: owner,
    url: entry.url,
    description: entry.description || { zh: '', en: '' },
    category: entry.category || '',
    stars: Number(entry.stars) || 0,
    forks: entry.forks == null ? null : Number(entry.forks) || 0,
    language: entry.language || '',
    pushedAt: entry.pushedAt || null,
    addedAt: null,
    source: 'discovered',
    trustLevel: 'pending_review',
    verification: { manifest: 'not_validated', patch: 'not_checked', installation: 'not_tested' },
    topics: entry.topics || ['dsh-plugin'],
    icon: entry.icon || (owner ? 'https://github.com/' + encodeURIComponent(owner) + '.png?size=96' : '')
  };
}
