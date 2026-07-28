import { describe, expect, test } from 'bun:test'
import { NewsService } from './newsService'
import type { NewsStory } from './types'

const story = (): NewsStory => ({
  id: 1,
  section: 'Top',
  headline: 'Test',
  summary: 'Summary',
  source: 'Test',
  time: 'now',
  impact: 'Medium',
})

describe('NewsService', () => {
  test('concurrent refresh skips overlapping run', async () => {
    let fetchCount = 0
    const store = {
      getPage: () => ({ updatedAt: '', page: 1, pageSize: 10, total: 0, articles: [] }),
      getDataCenterPage: () => ({ updatedAt: '', page: 1, pageSize: 10, total: 0, articles: [] }),
      getRefreshLog: (_r: { page: number; pageSize: number }, isRefreshing: boolean) => ({
        updatedAt: '',
        isRefreshing,
        page: 1,
        pageSize: 10,
        total: 0,
        summary: { totalArticles: 0, totalMarketQuotes: 0, successfulRuns: 0, failedRuns: 0, averageDurationMs: 0 },
        entries: [],
      }),
      getSeededTopNews: () => ({
        updatedAt: '',
        lead: story(),
        stories: [],
        tickers: [],
        dataSource: 'fallback' as const,
        marketSource: 'fallback' as const,
        newsSource: 'fallback' as const,
        lastRefreshAt: null,
        nextRefreshAt: null,
      }),
      recordRefreshLog: () => {},
    }
    const openData = {
      fetchLiveTickers: async () => {
        fetchCount += 1
        await new Promise((resolve) => setTimeout(resolve, 30))
        return []
      },
      fetchLiveNews: async () => [story()],
    }
    const popular = { ensureSnapshot: () => {} }
    const news = new NewsService(store, openData, popular, { dataRefreshMs: 60_000 })

    await Promise.all([news.refresh(), news.refresh()])
    expect(fetchCount).toBe(1)
  })
})
