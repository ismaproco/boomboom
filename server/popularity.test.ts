import { describe, expect, test } from 'bun:test'
import { KeywordPopularityRankingService, PopularSnapshotService } from './popularity'
import { KeywordTokenizer } from './popularityText'
import type { ArticleRecord, ArticleRepository, PopularRepository, PopularSnapshot } from './types'

const now = Date.now()
const article = (id: number, headline: string, source: string, summary = headline, minutesAgo = 10): ArticleRecord => ({
  id,
  headline,
  summary,
  source,
  section: 'Markets',
  time: 'now',
  impact: 'Medium',
  publishedAt: new Date(now - minutesAgo * 60_000).toISOString(),
  fetchedAt: new Date(now).toISOString(),
})

describe('popular clustering', () => {
  test('filters generic stopwords from keywords', () => {
    const tokenizer = new KeywordTokenizer()
    const tokens = tokenizer.tokenize('The stock market and investors are watching Apple lawsuit updates today')
    expect(tokens).toContain('apple')
    expect(tokens).toContain('lawsuit')
    expect(tokens).not.toContain('the')
    expect(tokens).not.toContain('and')
    expect(tokens).not.toContain('are')
  })

  test('clusters equivalent stories across wording variants', () => {
    const ranking = new KeywordPopularityRankingService()
    const ranked = ranking.rank([
      article(1, 'Anthropic expands compute capacity with SpaceX data center partnership', 'CNBC Top News RSS'),
      article(2, 'Musk SpaceX strikes data center deal with Anthropic', 'Yahoo Finance RSS'),
      article(3, 'Anthropic to rent SpaceX Memphis data center capacity', 'MarketWatch Top Stories RSS'),
      article(4, 'Apple settles Siri AI lawsuit for $250 million', 'TechCrunch RSS'),
    ])

    const anthropic = ranked.find((cluster) => cluster.keywords.includes('anthropic'))
    expect(anthropic?.articleCount).toBe(3)
    expect(anthropic?.sourceCount).toBe(3)
  })

  test('does not let same-source duplicate bursts dominate independent coverage', () => {
    const ranking = new KeywordPopularityRankingService()
    const duplicateBurst = Array.from({ length: 9 }, (_value, index) =>
      article(10 + index, `Dow futures rise on Iran deal hopes and Nvidia earnings mover ${index}`, 'Yahoo Finance RSS'),
    )
    const independentCoverage = [
      article(1, 'Oil prices jump as Iran war threatens Hormuz shipping', 'Bloomberg Markets RSS'),
      article(2, 'Iran conflict sends oil prices higher on Hormuz fears', 'CNBC Top News RSS'),
      article(3, 'Crude climbs as Middle East shipping risk rises', 'OilPrice RSS'),
      article(4, 'Energy traders price higher risk from Iran war', 'NYT Business RSS'),
    ]

    const ranked = ranking.rank([...duplicateBurst, ...independentCoverage])
    expect(ranked[0]?.keywords.join(' ')).toMatch(/oil|iran|hormuz|crude|energy/)
    expect(ranked[0]?.sourceCount).toBeGreaterThan(1)
  })

  test('keeps unrelated same-company legal stories separate', () => {
    const ranking = new KeywordPopularityRankingService()
    const ranked = ranking.rank([
      article(1, 'Apple settles lawsuit over late Siri AI features', 'TechCrunch RSS'),
      article(2, 'Apple reaches settlement over delayed Siri artificial intelligence features', 'Yahoo Finance RSS'),
      article(3, 'US Supreme Court declines Apple contempt pause in Epic Games lawsuit', 'Investing.com Stocks RSS'),
      article(4, 'Epic Games contempt fight with Apple continues at Supreme Court', 'MarketWatch Top Stories RSS'),
    ])

    const appleClusters = ranked.filter((cluster) => cluster.keywords.includes('apple'))
    expect(appleClusters.length).toBeGreaterThanOrEqual(2)
    expect(appleClusters.some((cluster) => cluster.keywords.includes('siri'))).toBe(true)
    expect(appleClusters.some((cluster) => cluster.keywords.includes('epic'))).toBe(true)
  })
})

describe('PopularSnapshotService', () => {
  test('getById does not create a snapshot when the latest snapshot is stale', () => {
    const staleCreatedAt = new Date(Date.now() - 60 * 60_000).toISOString()
    const staleSnapshot: PopularSnapshot = {
      id: 7,
      createdAt: staleCreatedAt,
      articleCount: 2,
      clusterCount: 1,
    }
    let saveCalls = 0

    const popularRepo: PopularRepository = {
      getLatestSnapshot: () => staleSnapshot,
      getSnapshot: (id) => (id === 7 ? staleSnapshot : null),
      getPreviousSnapshot: () => null,
      getSnapshots: () => [staleSnapshot],
      getSnapshotSummaries: () => [],
      getItems: () => [],
      getPreviousRanks: () => new Map(),
      saveSnapshot: () => {
        saveCalls += 1
      },
      cleanup: () => {},
    }

    const articles: ArticleRepository = {
      getPage: () => ({ updatedAt: '', page: 1, pageSize: 100, total: 0, articles: [] }),
      getDataCenterPage: () => ({ updatedAt: '', page: 1, pageSize: 100, total: 0, articles: [] }),
      getRecentArticles: () => [],
      store: () => {},
    }

    const service = new PopularSnapshotService(
      articles,
      popularRepo,
      new KeywordPopularityRankingService(),
      15 * 60_000,
      30 * 24 * 60 * 60_000,
    )
    const response = service.getById('7')

    expect(saveCalls).toBe(0)
    expect(response.snapshot?.id).toBe(7)
  })

  test('ensureSnapshot creates a snapshot when the latest snapshot is stale', () => {
    const staleCreatedAt = new Date(Date.now() - 60 * 60_000).toISOString()
    const staleSnapshot: PopularSnapshot = {
      id: 7,
      createdAt: staleCreatedAt,
      articleCount: 2,
      clusterCount: 1,
    }
    let saveCalls = 0

    const popularRepo: PopularRepository = {
      getLatestSnapshot: () => staleSnapshot,
      getSnapshot: (id) => (id === 7 ? staleSnapshot : null),
      getPreviousSnapshot: () => null,
      getSnapshots: () => [staleSnapshot],
      getSnapshotSummaries: () => [],
      getItems: () => [],
      getPreviousRanks: () => new Map(),
      saveSnapshot: () => {
        saveCalls += 1
      },
      cleanup: () => {},
    }

    const articles: ArticleRepository = {
      getPage: () => ({ updatedAt: '', page: 1, pageSize: 100, total: 0, articles: [] }),
      getDataCenterPage: () => ({ updatedAt: '', page: 1, pageSize: 100, total: 0, articles: [] }),
      getRecentArticles: () => [article(1, 'Oil prices jump on Iran war', 'Bloomberg Markets RSS')],
      store: () => {},
    }

    const service = new PopularSnapshotService(
      articles,
      popularRepo,
      new KeywordPopularityRankingService(),
      15 * 60_000,
      30 * 24 * 60 * 60_000,
    )
    service.ensureSnapshot()

    expect(saveCalls).toBe(1)
  })
})
