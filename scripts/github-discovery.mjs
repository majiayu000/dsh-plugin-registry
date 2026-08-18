const MAX_SEARCH_RESULTS = 1_000
const ONE_SECOND = 1_000
export const REPOSITORY_METADATA_BATCH_SIZE = 40

const REPOSITORY_METADATA_FIELDS = `
  nameWithOwner
  url
  description
  stargazerCount
  forkCount
  pushedAt
  isArchived
  isFork
  primaryLanguage { name }
  licenseInfo { spdxId }
  latestRelease { tagName publishedAt }
  owner { avatarUrl }
  repositoryTopics(first: 20) { nodes { topic { name } } }
`

export const REPOSITORY_DISCOVERY_QUERY = `
  query RegistryRepositoryDiscovery($searchQuery: String!, $cursor: String) {
    search(query: $searchQuery, type: REPOSITORY, first: 100, after: $cursor) {
      repositoryCount
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on Repository {
          nameWithOwner
          url
          description
          stargazerCount
          forkCount
          pushedAt
          isArchived
          isFork
          primaryLanguage { name }
          licenseInfo { spdxId }
          latestRelease { tagName publishedAt }
          owner { avatarUrl }
          repositoryTopics(first: 20) { nodes { topic { name } } }
        }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`

function toSearchTimestamp(value) {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function splitWindow(from, to) {
  const fromTime = from.getTime()
  const toTime = to.getTime()
  const midpoint = Math.floor(((fromTime + toTime) / 2) / ONE_SECOND) * ONE_SECOND
  if (midpoint <= fromTime || midpoint >= toTime) {
    throw new Error(`GitHub returned more than ${MAX_SEARCH_RESULTS} repositories inside one second; the discovery window cannot be split safely.`)
  }
  return [
    [new Date(fromTime), new Date(midpoint)],
    [new Date(midpoint + ONE_SECOND), new Date(toTime)],
  ]
}

/* REST /search/repositories 条目归一化为与 mapGraphqlRepository 相同的形状，
   保证无 token 降级路径产出的 license（REST 是对象）等字段与 GraphQL 路径一致。 */
export function mapRestRepository(item) {
  return {
    full_name: item.full_name,
    html_url: item.html_url,
    description: item.description || '',
    stargazers_count: item.stargazers_count || 0,
    forks_count: item.forks_count || 0,
    language: item.language || '',
    license: item.license?.spdx_id || '',
    latest_release: null,
    pushed_at: item.pushed_at || null,
    archived: Boolean(item.archived),
    fork: Boolean(item.fork),
    topics: item.topics || [],
    owner: { avatar_url: item.owner?.avatar_url || '' },
  }
}

function canSplitWindow(from, to) {
  const fromTime = from.getTime()
  const toTime = to.getTime()
  const midpoint = Math.floor(((fromTime + toTime) / 2) / ONE_SECOND) * ONE_SECOND
  return midpoint > fromTime && midpoint < toTime
}

export function mapGraphqlRepository(repository) {
  return {
    full_name: repository.nameWithOwner,
    html_url: repository.url,
    description: repository.description || '',
    stargazers_count: repository.stargazerCount || 0,
    forks_count: repository.forkCount || 0,
    language: repository.primaryLanguage?.name || '',
    license: repository.licenseInfo?.spdxId || '',
    latest_release: repository.latestRelease ? {
      tag: repository.latestRelease.tagName,
      published_at: repository.latestRelease.publishedAt,
    } : null,
    pushed_at: repository.pushedAt || null,
    archived: Boolean(repository.isArchived),
    fork: Boolean(repository.isFork),
    topics: repository.repositoryTopics?.nodes?.map(node => node.topic.name) || [],
    owner: { avatar_url: repository.owner?.avatarUrl || '' },
  }
}

export function buildRepositoryMetadataQuery(repositoryKeys) {
  const fields = repositoryKeys.map((key, index) => {
    const [owner, name] = String(key).split('/')
    return `r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {${REPOSITORY_METADATA_FIELDS}}`
  }).join('\n')
  return `query CuratedRepositoryMetadata { ${fields} }`
}

export function mapGraphqlRepositoryMetadataBatch(data, repositoryKeys) {
  return new Map(repositoryKeys.flatMap((key, index) => {
    const repository = data?.[`r${index}`]
    return repository ? [[String(key).toLowerCase(), {
      stargazerCount: repository.stargazerCount ?? 0,
      forkCount: repository.forkCount ?? 0,
      language: repository.primaryLanguage?.name || '',
      license: repository.licenseInfo?.spdxId || '',
      latestRelease: repository.latestRelease ? {
        tag: repository.latestRelease.tagName,
        publishedAt: repository.latestRelease.publishedAt,
      } : null,
      pushedAt: repository.pushedAt || null,
      isArchived: Boolean(repository.isArchived),
      repositoryTopics: { nodes: repository.repositoryTopics?.nodes || [] },
      avatarUrl: repository.owner?.avatarUrl || '',
    }]] : []
  }))
}

export async function discoverGitHubRepositories({
  searchPage,
  from = new Date('2008-01-01T00:00:00Z'),
  to = new Date(),
  onProgress = () => {},
}) {
  async function discoverWindow(windowFrom, windowTo, depth = 0) {
    const range = `${toSearchTimestamp(windowFrom)}..${toSearchTimestamp(windowTo)}`
    const searchQuery = `topic:dsh-plugin created:${range}`
    const first = await searchPage({ searchQuery, cursor: null })
    const totalCount = first.repositoryCount
    onProgress({ type: 'window', range, totalCount, depth, rateLimit: first.rateLimit })

    if (totalCount > MAX_SEARCH_RESULTS) {
      const windows = splitWindow(windowFrom, windowTo)
      return [
        ...(await discoverWindow(windows[0][0], windows[0][1], depth + 1)),
        ...(await discoverWindow(windows[1][0], windows[1][1], depth + 1)),
      ]
    }

    const repositories = [...first.repositories]
    let pageInfo = first.pageInfo
    let page = 1
    while (pageInfo.hasNextPage) {
      page += 1
      const next = await searchPage({ searchQuery, cursor: pageInfo.endCursor })
      repositories.push(...next.repositories)
      pageInfo = next.pageInfo
      onProgress({ type: 'page', range, totalCount, fetched: repositories.length, page, rateLimit: next.rateLimit })
    }

    const uniqueRepositories = [...new Map(repositories.map(repository => [repository.full_name.toLowerCase(), repository])).values()]
    const missing = totalCount - uniqueRepositories.length
    const allowedDrift = totalCount >= 100 ? Math.max(5, Math.ceil(totalCount * 0.01)) : 0
    if (missing > allowedDrift) {
      if (canSplitWindow(windowFrom, windowTo)) {
        onProgress({ type: 'resplit', range, totalCount, fetched: uniqueRepositories.length, allowedDrift, depth, rateLimit: first.rateLimit })
        const windows = splitWindow(windowFrom, windowTo)
        return [
          ...(await discoverWindow(windows[0][0], windows[0][1], depth + 1)),
          ...(await discoverWindow(windows[1][0], windows[1][1], depth + 1)),
        ]
      }
      throw new Error(`GitHub discovery returned ${uniqueRepositories.length}/${totalCount} unique repositories for ${range}. Refusing to publish an incomplete window.`)
    }
    if (uniqueRepositories.length !== totalCount) {
      onProgress({ type: 'drift', range, totalCount, fetched: uniqueRepositories.length, allowedDrift })
    }
    return uniqueRepositories
  }

  return discoverWindow(new Date(from), new Date(to))
}
