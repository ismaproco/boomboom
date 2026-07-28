import type {
  ArticlePageRequest,
  ArticleRepository,
  ArticleRecordsResponse,
  LiveNewsGateway,
  NewsStory,
  PageRequest,
  RefreshLogInput,
  RefreshLogRepository,
  RefreshLogResponse,
  SnapshotCoordinator,
  SourceState,
  Ticker,
  TopNewsFallbackRepository,
  TopNewsResponse,
} from './types'

type NewsStore = ArticleRepository & RefreshLogRepository & TopNewsFallbackRepository

export type NewsServiceConfig = {
  dataRefreshMs: number
}

export class NewsService {
  private liveTickers: Ticker[] = []
  private liveStories: NewsStory[] = []
  private lastAttemptAt = 0
  private nextRefreshAt = 0
  private lastMarketSuccessAt = 0
  private lastNewsSuccessAt = 0
  private refreshError: string | undefined
  private refreshing = false

  constructor(
    private readonly store: NewsStore,
    private readonly openData: LiveNewsGateway,
    private readonly popular: SnapshotCoordinator,
    private readonly config: NewsServiceConfig,
  ) {}

  get isRefreshing() {
    return this.refreshing
  }

  get nextRefreshTimestamp() {
    return this.nextRefreshAt
  }

  getArticles(request: ArticlePageRequest): ArticleRecordsResponse {
    return this.store.getPage(request)
  }

  getDataCenters(request: ArticlePageRequest): ArticleRecordsResponse {
    return this.store.getDataCenterPage(request)
  }

  getRefreshLog(request: PageRequest): RefreshLogResponse {
    return this.store.getRefreshLog(request, this.refreshing)
  }

  getTopNews(): TopNewsResponse {
    const fallback = this.store.getSeededTopNews(this.nextRefreshAt)
    const stories = this.liveStories.length > 0 ? this.liveStories : [fallback.lead, ...fallback.stories]
    const marketTickers = this.liveTickers.length > 0 ? this.liveTickers : fallback.tickers
    const marketSource = this.getSourceState(this.liveTickers.length, this.lastMarketSuccessAt)
    const newsSource = this.getSourceState(this.liveStories.length, this.lastNewsSuccessAt)

    return {
      updatedAt: new Date().toISOString(),
      lead: stories[0] ?? fallback.lead,
      stories: stories.slice(1, 12),
      tickers: marketTickers,
      dataSource: this.getCombinedSourceState(marketSource, newsSource),
      marketSource,
      newsSource,
      lastRefreshAt: this.lastAttemptAt ? new Date(this.lastAttemptAt).toISOString() : null,
      nextRefreshAt: this.nextRefreshAt ? new Date(this.nextRefreshAt).toISOString() : null,
      ...(this.refreshError ? { refreshError: this.refreshError } : {}),
    }
  }

  async refresh() {
    if (this.refreshing) {
      this.recordRefreshLog({
        startedAt: Date.now(),
        finishedAt: Date.now(),
        status: 'skipped',
        marketCount: this.liveTickers.length,
        newsCount: this.liveStories.length,
        message: 'refresh skipped because another refresh is in progress',
      })
      return
    }

    this.refreshing = true
    const refreshStartedAt = Date.now()
    let marketCount = this.liveTickers.length
    let newsCount = this.liveStories.length
    this.lastAttemptAt = refreshStartedAt
    this.nextRefreshAt = refreshStartedAt + this.config.dataRefreshMs

    try {
      const [tickerResult, newsResult] = await Promise.allSettled([this.openData.fetchLiveTickers(), this.openData.fetchLiveNews()])
      const errors: string[] = []

      if (tickerResult.status === 'fulfilled' && tickerResult.value.length > 0) {
        this.liveTickers = tickerResult.value
        marketCount = tickerResult.value.length
        this.lastMarketSuccessAt = refreshStartedAt
      } else {
        errors.push('market refresh failed')
      }

      if (newsResult.status === 'fulfilled' && newsResult.value.length > 0) {
        this.liveStories = newsResult.value
        newsCount = newsResult.value.length
        this.lastNewsSuccessAt = refreshStartedAt
        this.store.store(newsResult.value, refreshStartedAt)
        this.popular.ensureSnapshot()
      } else {
        errors.push('news refresh failed')
      }

      this.refreshError = errors.length > 0 ? errors.join('; ') : undefined
      this.recordRefreshLog({
        startedAt: refreshStartedAt,
        finishedAt: Date.now(),
        status: errors.length === 0 ? 'success' : 'partial',
        marketCount,
        newsCount,
        message: this.refreshError ?? 'live market and news data refreshed',
      })
    } catch (error) {
      this.refreshError = error instanceof Error ? error.message : 'live data refresh failed'
      this.recordRefreshLog({
        startedAt: refreshStartedAt,
        finishedAt: Date.now(),
        status: 'failed',
        marketCount,
        newsCount,
        message: this.refreshError,
      })
    } finally {
      this.refreshing = false
    }
  }

  private recordRefreshLog(entry: RefreshLogInput) {
    this.store.recordRefreshLog(entry, this.nextRefreshAt)
  }

  private getSourceState(itemCount: number, lastSuccessAt: number): SourceState {
    if (itemCount === 0) return 'fallback'
    if (this.lastAttemptAt > lastSuccessAt) return 'stale'
    return 'live'
  }

  private getCombinedSourceState(marketSource: SourceState, newsSource: SourceState): SourceState {
    if (marketSource === 'live' || newsSource === 'live') return 'live'
    if (marketSource === 'stale' || newsSource === 'stale') return 'stale'
    return 'fallback'
  }
}
