import assert from 'node:assert/strict'
import test from 'node:test'
import { discoverGitHubRepositories, mapGraphqlRepository } from '../scripts/github-discovery.mjs'

function page(repositoryCount, names, hasNextPage = false, endCursor = null) {
  return {
    repositoryCount,
    repositories: names.map(full_name => ({ full_name })),
    pageInfo: { hasNextPage, endCursor },
    rateLimit: { remaining: 100 },
  }
}

test('repository discovery splits timestamp windows beyond the GitHub 1000-result limit', async () => {
  const queries = []
  const progress = []
  const repositories = await discoverGitHubRepositories({
    from: new Date('2026-08-14T00:00:00Z'),
    to: new Date('2026-08-14T23:59:59Z'),
    async searchPage({ searchQuery, cursor }) {
      queries.push({ searchQuery, cursor })
      if (searchQuery.includes('00:00:00Z..2026-08-14T23:59:59Z')) return page(1_500, [])
      if (cursor === 'left-page-2') return page(2, ['acme/two'])
      if (searchQuery.includes('00:00:00Z..2026-08-14T11:59:59Z')) return page(2, ['acme/one'], true, 'left-page-2')
      return page(1, ['acme/three'])
    },
    onProgress(entry) { progress.push(entry) },
  })

  assert.deepEqual(repositories.map(repository => repository.full_name), ['acme/one', 'acme/two', 'acme/three'])
  assert.equal(queries.length, 4)
  assert.ok(queries.some(entry => entry.searchQuery.includes('2026-08-14T12:00:00Z..2026-08-14T23:59:59Z')))
  assert.ok(progress.some(entry => entry.type === 'page' && entry.fetched === 2))
})

test('repository discovery refuses a partial page sequence', async () => {
  await assert.rejects(discoverGitHubRepositories({
    from: new Date('2026-08-15T00:00:00Z'),
    to: new Date('2026-08-15T00:00:01Z'),
    async searchPage() { return page(2, ['acme/one']) },
  }), /incomplete window/i)
})

test('repository discovery tolerates small live-index drift in large windows', async () => {
  const progress = []
  const repositories = await discoverGitHubRepositories({
    from: new Date('2026-08-14T00:00:00Z'),
    to: new Date('2026-08-14T00:00:01Z'),
    async searchPage() {
      return page(100, Array.from({ length: 101 }, (_, index) => `acme/plugin-${index}`))
    },
    onProgress(entry) { progress.push(entry) },
  })
  assert.equal(repositories.length, 101)
  assert.ok(progress.some(entry => entry.type === 'drift' && entry.allowedDrift === 5))
})

test('GraphQL repositories map to the registry normalization contract', () => {
  assert.deepEqual(mapGraphqlRepository({
    nameWithOwner: 'acme/plugin',
    url: 'https://github.com/acme/plugin',
    description: 'A plugin',
    stargazerCount: 12,
    forkCount: 3,
    pushedAt: '2026-08-15T00:00:00Z',
    isArchived: false,
    isFork: false,
    primaryLanguage: { name: 'TypeScript' },
    owner: { avatarUrl: 'https://avatars.example/acme' },
    repositoryTopics: { nodes: [{ topic: { name: 'dsh-plugin' } }] },
  }), {
    full_name: 'acme/plugin',
    html_url: 'https://github.com/acme/plugin',
    description: 'A plugin',
    stargazers_count: 12,
    forks_count: 3,
    language: 'TypeScript',
    pushed_at: '2026-08-15T00:00:00Z',
    archived: false,
    fork: false,
    topics: ['dsh-plugin'],
    owner: { avatar_url: 'https://avatars.example/acme' },
  })
})
