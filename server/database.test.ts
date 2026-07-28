import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SqliteStore } from './database'
import type { NewsStory } from './types'

const tempDirs: string[] = []

const createTestStore = () => {
  const dir = mkdtempSync(join(tmpdir(), 'boomboom-db-test-'))
  tempDirs.push(dir)
  const dbPath = join(dir, 'test.sqlite')
  return new SqliteStore(dbPath, dir)
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const sampleStory = (overrides: Partial<NewsStory> = {}): NewsStory => ({
  id: 9001,
  section: 'Technology',
  headline: 'Data center cooling demand rises',
  summary: 'Hyperscale builds accelerate',
  source: 'Test Wire',
  time: '1h ago',
  impact: 'Medium',
  ...overrides,
})

describe('SqliteStore', () => {
  test('initializes schema and pings', () => {
    const store = createTestStore()
    expect(store.ping()).toBe(true)
    store.close()
  })

  test('getPage returns paginated articles', () => {
    const store = createTestStore()
    const fetchedAt = Date.now()
    store.store([sampleStory({ id: 1, headline: 'Alpha markets' }), sampleStory({ id: 2, headline: 'Beta energy' })], fetchedAt)

    const page1 = store.getPage({ page: 1, pageSize: 1 })
    expect(page1.total).toBe(2)
    expect(page1.articles).toHaveLength(1)

    const page2 = store.getPage({ page: 2, pageSize: 1 })
    expect(page2.articles).toHaveLength(1)
    expect(page1.articles[0]?.id).not.toBe(page2.articles[0]?.id)
    store.close()
  })

  test('getPage search escapes LIKE wildcards', () => {
    const store = createTestStore()
    const fetchedAt = Date.now()
    store.store([sampleStory({ id: 10, headline: '100% gain in oil' }), sampleStory({ id: 11, headline: 'Plain headline' })], fetchedAt)

    const literal = store.getPage({ page: 1, pageSize: 10, searchTerm: '100%' })
    expect(literal.total).toBe(1)
    expect(literal.articles[0]?.headline).toContain('100%')

    const noMatch = store.getPage({ page: 1, pageSize: 10, searchTerm: '100_' })
    expect(noMatch.total).toBe(0)
    store.close()
  })

  test('getDataCenterPage filters data-center themed articles', () => {
    const store = createTestStore()
    const fetchedAt = Date.now()
    store.store(
      [
        sampleStory({ id: 20, headline: 'New datacenter campus announced', section: 'Technology' }),
        sampleStory({
          id: 21,
          headline: 'Unrelated retail earnings',
          summary: 'Quarterly same-store sales beat estimates',
          section: 'Markets',
        }),
      ],
      fetchedAt,
    )

    const dc = store.getDataCenterPage({ page: 1, pageSize: 10 })
    expect(dc.total).toBeGreaterThanOrEqual(1)
    expect(dc.articles.some((a) => a.id === 20)).toBe(true)
    expect(dc.articles.some((a) => a.id === 21)).toBe(false)

    const all = store.getDataCenterPage({ page: 1, pageSize: 100, maxItems: 1 })
    expect(all.page).toBe(1)
    expect(all.pageSize).toBe(1)
    expect(all.articles).toHaveLength(1)
    store.close()
  })

  test('getDataCenterPage maxItems returns one bounded page when total exceeds 1k', () => {
    const store = createTestStore()
    const fetchedAt = Date.now()
    const stories = Array.from({ length: 1200 }, (_, index) =>
      sampleStory({
        id: index + 1,
        headline: `Hyperscale datacenter expansion ${index + 1}`,
        summary: 'New data center campus and cooling capacity',
      }),
    )
    store.store(stories, fetchedAt)

    const all = store.getDataCenterPage({ page: 1, pageSize: 100, maxItems: 500 })
    expect(all.total).toBe(1200)
    expect(all.page).toBe(1)
    expect(all.pageSize).toBe(500)
    expect(all.articles).toHaveLength(500)
    store.close()
  })
})
