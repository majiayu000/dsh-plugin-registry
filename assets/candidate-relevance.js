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
