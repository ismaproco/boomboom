import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { applySqlitePragmas } from './db/connection'
import { CommodityDb, migrateCommodityDomain } from './db/commodities'
import { PortfolioDb, migratePortfolioDomain } from './db/portfolio'
import { PopularDb } from './db/popular'
import { topNews, tickers } from './seedData'
import * as articleDb from './db/articles'
import type {
  ArticlePageRequest,
  ArticleRecordsResponse,
  ArticleRepository,
  NewsStory,
  PageRequest,
  PopularRepository,
  PortfolioRepository,
  RefreshLogEntry,
  RefreshLogInput,
  RefreshLogRepository,
  RefreshLogResponse,
  TopNewsFallbackRepository,
  TopNewsResponse,
  Ticker,
} from './types'
const schemaSql = `
  CREATE TABLE IF NOT EXISTS news_stories (id INTEGER PRIMARY KEY, section TEXT NOT NULL, headline TEXT NOT NULL, summary TEXT NOT NULL, source TEXT NOT NULL, time TEXT NOT NULL, impact TEXT NOT NULL CHECK (impact IN ('High', 'Medium', 'Low')), url TEXT, sort_order INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS market_tickers (symbol TEXT PRIMARY KEY, value TEXT NOT NULL, change TEXT NOT NULL, sort_order INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS raw_articles (id INTEGER PRIMARY KEY, section TEXT NOT NULL, headline TEXT NOT NULL, summary TEXT NOT NULL, source TEXT NOT NULL, time TEXT NOT NULL, impact TEXT NOT NULL CHECK (impact IN ('High', 'Medium', 'Low')), url TEXT, published_at TEXT, fetched_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS refresh_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'skipped')), market_count INTEGER NOT NULL, news_count INTEGER NOT NULL, duration_ms INTEGER NOT NULL, message TEXT NOT NULL, next_refresh_at TEXT);
  CREATE TABLE IF NOT EXISTS popular_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, article_count INTEGER NOT NULL, cluster_count INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS popular_items (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER NOT NULL, cluster_key TEXT NOT NULL, rank INTEGER NOT NULL, previous_rank INTEGER, rank_delta INTEGER, score REAL NOT NULL, headline TEXT NOT NULL, summary TEXT NOT NULL, section TEXT NOT NULL, primary_source TEXT NOT NULL, source_count INTEGER NOT NULL, article_count INTEGER NOT NULL, sources_json TEXT NOT NULL, article_ids_json TEXT NOT NULL, keywords_json TEXT NOT NULL, latest_published_at TEXT, earliest_published_at TEXT, FOREIGN KEY (snapshot_id) REFERENCES popular_snapshots(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS portfolio_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, benchmark_symbol TEXT NOT NULL, benchmark_value REAL NOT NULL, expected_return REAL NOT NULL, source_snapshot_id INTEGER, view_count INTEGER NOT NULL, novelty_profile TEXT NOT NULL DEFAULT 'medium', overlap_ratio REAL NOT NULL DEFAULT 0, turnover_ratio REAL NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS portfolio_positions (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER NOT NULL, symbol TEXT NOT NULL, weight REAL NOT NULL, view_score REAL NOT NULL, implied_return REAL NOT NULL, entry_price REAL NOT NULL, FOREIGN KEY (snapshot_id) REFERENCES portfolio_snapshots(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS portfolio_comparisons (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER NOT NULL, compared_snapshot_id INTEGER NOT NULL, benchmark_symbol TEXT NOT NULL, portfolio_return REAL NOT NULL, benchmark_return REAL NOT NULL, excess_return REAL NOT NULL, max_drawdown_proxy REAL NOT NULL DEFAULT 0, measured_at TEXT NOT NULL, FOREIGN KEY (snapshot_id) REFERENCES portfolio_snapshots(id) ON DELETE CASCADE, FOREIGN KEY (compared_snapshot_id) REFERENCES portfolio_snapshots(id) ON DELETE CASCADE);
  CREATE INDEX IF NOT EXISTS raw_articles_fetched_published_idx ON raw_articles(fetched_at DESC, published_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS raw_articles_section_source_idx ON raw_articles(section, source);
  CREATE INDEX IF NOT EXISTS popular_snapshots_created_at_idx ON popular_snapshots(created_at DESC);
  CREATE INDEX IF NOT EXISTS popular_items_snapshot_rank_idx ON popular_items(snapshot_id, rank ASC);
  CREATE INDEX IF NOT EXISTS portfolio_snapshots_created_at_idx ON portfolio_snapshots(created_at DESC);
  CREATE INDEX IF NOT EXISTS portfolio_positions_snapshot_weight_idx ON portfolio_positions(snapshot_id, weight DESC);
  CREATE INDEX IF NOT EXISTS portfolio_comparisons_snapshot_idx ON portfolio_comparisons(snapshot_id, measured_at DESC);
`

export class SqliteStore
  implements ArticleRepository, PopularRepository, PortfolioRepository, RefreshLogRepository, TopNewsFallbackRepository
{
  readonly db: Database
  private readonly portfolio: PortfolioDb
  private readonly popular: PopularDb
  private readonly commodities: CommodityDb

  listPortfolioScenarios!: PortfolioDb['listPortfolioScenarios']
  listPortfolioScenariosBySource!: PortfolioDb['listPortfolioScenariosBySource']
  getPortfolioScenario!: PortfolioDb['getPortfolioScenario']
  insertPortfolioScenario!: PortfolioDb['insertPortfolioScenario']
  updatePortfolioScenario!: PortfolioDb['updatePortfolioScenario']
  deletePortfolioScenario!: PortfolioDb['deletePortfolioScenario']
  getLatestPortfolioSnapshot!: PortfolioDb['getLatestPortfolioSnapshot']
  getPortfolioSnapshot!: PortfolioDb['getPortfolioSnapshot']
  getPortfolioPositions!: PortfolioDb['getPortfolioPositions']
  getLatestPortfolioComparison!: PortfolioDb['getLatestPortfolioComparison']
  getPortfolioHistory!: PortfolioDb['getPortfolioHistory']
  getPortfolioSnapshotsForComparison!: PortfolioDb['getPortfolioSnapshotsForComparison']
  getPortfolioSnapshotsAscending!: PortfolioDb['getPortfolioSnapshotsAscending']
  savePortfolioDecisionRun!: PortfolioDb['savePortfolioDecisionRun']
  updatePortfolioDecisionRunStatus!: PortfolioDb['updatePortfolioDecisionRunStatus']
  getLatestPortfolioDecisionRun!: PortfolioDb['getLatestPortfolioDecisionRun']
  getPortfolioDecisionRuns!: PortfolioDb['getPortfolioDecisionRuns']
  getPortfolioDecisionRunsRange!: PortfolioDb['getPortfolioDecisionRunsRange']
  replaceDailySurvivors!: PortfolioDb['replaceDailySurvivors']
  getDailySurvivors!: PortfolioDb['getDailySurvivors']
  getDailySurvivorsRange!: PortfolioDb['getDailySurvivorsRange']
  savePortfolioSnapshot!: PortfolioDb['savePortfolioSnapshot']
  createPortfolioOptimizeJob!: PortfolioDb['createPortfolioOptimizeJob']
  getPortfolioOptimizeJob!: PortfolioDb['getPortfolioOptimizeJob']
  updatePortfolioOptimizeJob!: PortfolioDb['updatePortfolioOptimizeJob']
  expireStaleActiveOptimizeJobs!: PortfolioDb['expireStaleActiveOptimizeJobs']
  scenarioHasActiveOptimizeJob!: PortfolioDb['scenarioHasActiveOptimizeJob']
  countActiveOptimizeJobs!: PortfolioDb['countActiveOptimizeJobs']
  listQueuedOptimizeJobIds!: PortfolioDb['listQueuedOptimizeJobIds']
  getPortfolioOptimizeJobRequestJson!: PortfolioDb['getPortfolioOptimizeJobRequestJson']
  upsertTickerPriceHistory!: PortfolioDb['upsertTickerPriceHistory']
  getTickerPriceHistory!: PortfolioDb['getTickerPriceHistory']
  listTickerHistorySymbols!: PortfolioDb['listTickerHistorySymbols']
  upsertTickerHistorySyncStatus!: PortfolioDb['upsertTickerHistorySyncStatus']
  getTickerHistorySyncStatuses!: PortfolioDb['getTickerHistorySyncStatuses']
  createPortfolioBacktestRun!: PortfolioDb['createPortfolioBacktestRun']
  updatePortfolioBacktestRun!: PortfolioDb['updatePortfolioBacktestRun']
  getPortfolioBacktestRun!: PortfolioDb['getPortfolioBacktestRun']
  replacePortfolioBacktestMetrics!: PortfolioDb['replacePortfolioBacktestMetrics']
  getPortfolioBacktestMetrics!: PortfolioDb['getPortfolioBacktestMetrics']
  replacePortfolioLiveCandidates!: PortfolioDb['replacePortfolioLiveCandidates']
  getPortfolioLiveCandidates!: PortfolioDb['getPortfolioLiveCandidates']
  getLatestSnapshot!: PopularDb['getLatestSnapshot']
  getSnapshot!: PopularDb['getSnapshot']
  getPreviousSnapshot!: PopularDb['getPreviousSnapshot']
  getSnapshots!: PopularDb['getSnapshots']
  getSnapshotSummaries!: PopularDb['getSnapshotSummaries']
  getItems!: PopularDb['getItems']
  getPreviousRanks!: PopularDb['getPreviousRanks']
  saveSnapshot!: PopularDb['saveSnapshot']
  cleanup!: PopularDb['cleanup']
  upsertCommodityInstruments!: CommodityDb['upsertCommodityInstruments']
  listCommodityInstruments!: CommodityDb['listCommodityInstruments']
  upsertCommodityPriceHistory!: CommodityDb['upsertCommodityPriceHistory']
  getCommodityPriceHistory!: CommodityDb['getCommodityPriceHistory']
  saveCommoditySnapshot!: CommodityDb['saveCommoditySnapshot']
  getLatestCommoditySnapshot!: CommodityDb['getLatestCommoditySnapshot']
  getCommoditySnapshotItems!: CommodityDb['getCommoditySnapshotItems']
  getCommoditySnapshots!: CommodityDb['getCommoditySnapshots']
  replaceCommodityNewsLinks!: CommodityDb['replaceCommodityNewsLinks']
  getCommodityNewsLinks!: CommodityDb['getCommodityNewsLinks']

  constructor(
    private readonly dbPath: string,
    private readonly dataDir: string,
  ) {
    mkdirSync(dataDir, { recursive: true })
    this.db = new Database(dbPath, { create: true })
    applySqlitePragmas(this.db)
    this.portfolio = new PortfolioDb(this.db)
    this.popular = new PopularDb(this.db)
    this.commodities = new CommodityDb(this.db)
    this.initialize()
    migratePortfolioDomain(this.db)
    migrateCommodityDomain(this.db)
    const portfolio = this.portfolio
    const popular = this.popular
    const commodities = this.commodities
    this.listPortfolioScenarios = portfolio.listPortfolioScenarios.bind(portfolio)
    this.listPortfolioScenariosBySource = portfolio.listPortfolioScenariosBySource.bind(portfolio)
    this.getPortfolioScenario = portfolio.getPortfolioScenario.bind(portfolio)
    this.insertPortfolioScenario = portfolio.insertPortfolioScenario.bind(portfolio)
    this.updatePortfolioScenario = portfolio.updatePortfolioScenario.bind(portfolio)
    this.deletePortfolioScenario = portfolio.deletePortfolioScenario.bind(portfolio)
    this.getLatestPortfolioSnapshot = portfolio.getLatestPortfolioSnapshot.bind(portfolio)
    this.getPortfolioSnapshot = portfolio.getPortfolioSnapshot.bind(portfolio)
    this.getPortfolioPositions = portfolio.getPortfolioPositions.bind(portfolio)
    this.getLatestPortfolioComparison = portfolio.getLatestPortfolioComparison.bind(portfolio)
    this.getPortfolioHistory = portfolio.getPortfolioHistory.bind(portfolio)
    this.getPortfolioSnapshotsForComparison = portfolio.getPortfolioSnapshotsForComparison.bind(portfolio)
    this.getPortfolioSnapshotsAscending = portfolio.getPortfolioSnapshotsAscending.bind(portfolio)
    this.savePortfolioDecisionRun = portfolio.savePortfolioDecisionRun.bind(portfolio)
    this.updatePortfolioDecisionRunStatus = portfolio.updatePortfolioDecisionRunStatus.bind(portfolio)
    this.getLatestPortfolioDecisionRun = portfolio.getLatestPortfolioDecisionRun.bind(portfolio)
    this.getPortfolioDecisionRuns = portfolio.getPortfolioDecisionRuns.bind(portfolio)
    this.getPortfolioDecisionRunsRange = portfolio.getPortfolioDecisionRunsRange.bind(portfolio)
    this.replaceDailySurvivors = portfolio.replaceDailySurvivors.bind(portfolio)
    this.getDailySurvivors = portfolio.getDailySurvivors.bind(portfolio)
    this.getDailySurvivorsRange = portfolio.getDailySurvivorsRange.bind(portfolio)
    this.savePortfolioSnapshot = portfolio.savePortfolioSnapshot.bind(portfolio)
    this.createPortfolioOptimizeJob = portfolio.createPortfolioOptimizeJob.bind(portfolio)
    this.getPortfolioOptimizeJob = portfolio.getPortfolioOptimizeJob.bind(portfolio)
    this.updatePortfolioOptimizeJob = portfolio.updatePortfolioOptimizeJob.bind(portfolio)
    this.expireStaleActiveOptimizeJobs = portfolio.expireStaleActiveOptimizeJobs.bind(portfolio)
    this.scenarioHasActiveOptimizeJob = portfolio.scenarioHasActiveOptimizeJob.bind(portfolio)
    this.countActiveOptimizeJobs = portfolio.countActiveOptimizeJobs.bind(portfolio)
    this.listQueuedOptimizeJobIds = portfolio.listQueuedOptimizeJobIds.bind(portfolio)
    this.getPortfolioOptimizeJobRequestJson = portfolio.getPortfolioOptimizeJobRequestJson.bind(portfolio)
    this.upsertTickerPriceHistory = portfolio.upsertTickerPriceHistory.bind(portfolio)
    this.getTickerPriceHistory = portfolio.getTickerPriceHistory.bind(portfolio)
    this.listTickerHistorySymbols = portfolio.listTickerHistorySymbols.bind(portfolio)
    this.upsertTickerHistorySyncStatus = portfolio.upsertTickerHistorySyncStatus.bind(portfolio)
    this.getTickerHistorySyncStatuses = portfolio.getTickerHistorySyncStatuses.bind(portfolio)
    this.createPortfolioBacktestRun = portfolio.createPortfolioBacktestRun.bind(portfolio)
    this.updatePortfolioBacktestRun = portfolio.updatePortfolioBacktestRun.bind(portfolio)
    this.getPortfolioBacktestRun = portfolio.getPortfolioBacktestRun.bind(portfolio)
    this.replacePortfolioBacktestMetrics = portfolio.replacePortfolioBacktestMetrics.bind(portfolio)
    this.getPortfolioBacktestMetrics = portfolio.getPortfolioBacktestMetrics.bind(portfolio)
    this.replacePortfolioLiveCandidates = portfolio.replacePortfolioLiveCandidates.bind(portfolio)
    this.getPortfolioLiveCandidates = portfolio.getPortfolioLiveCandidates.bind(portfolio)
    this.getLatestSnapshot = popular.getLatestSnapshot.bind(popular)
    this.getSnapshot = popular.getSnapshot.bind(popular)
    this.getPreviousSnapshot = popular.getPreviousSnapshot.bind(popular)
    this.getSnapshots = popular.getSnapshots.bind(popular)
    this.getSnapshotSummaries = popular.getSnapshotSummaries.bind(popular)
    this.getItems = popular.getItems.bind(popular)
    this.getPreviousRanks = popular.getPreviousRanks.bind(popular)
    this.saveSnapshot = popular.saveSnapshot.bind(popular)
    this.cleanup = popular.cleanup.bind(popular)
    this.upsertCommodityInstruments = commodities.upsertCommodityInstruments.bind(commodities)
    this.listCommodityInstruments = commodities.listCommodityInstruments.bind(commodities)
    this.upsertCommodityPriceHistory = commodities.upsertCommodityPriceHistory.bind(commodities)
    this.getCommodityPriceHistory = commodities.getCommodityPriceHistory.bind(commodities)
    this.saveCommoditySnapshot = commodities.saveCommoditySnapshot.bind(commodities)
    this.getLatestCommoditySnapshot = commodities.getLatestCommoditySnapshot.bind(commodities)
    this.getCommoditySnapshotItems = commodities.getCommoditySnapshotItems.bind(commodities)
    this.getCommoditySnapshots = commodities.getCommoditySnapshots.bind(commodities)
    this.replaceCommodityNewsLinks = commodities.replaceCommodityNewsLinks.bind(commodities)
    this.getCommodityNewsLinks = commodities.getCommodityNewsLinks.bind(commodities)
  }

  get path() {
    return this.dbPath
  }

  ping(): boolean {
    const row = this.db.query<{ ok: number }, []>('SELECT 1 as ok').get()
    return row?.ok === 1
  }

  close() {
    this.db.close()
  }

  getSeededTopNews(nextRefreshAt: number): TopNewsResponse {
    const stories = this.db
      .query<NewsStory, []>('SELECT id, section, headline, summary, source, time, impact, url FROM news_stories ORDER BY sort_order ASC')
      .all()
    const marketTickers = this.db.query<Ticker, []>('SELECT symbol, value, change FROM market_tickers ORDER BY sort_order ASC').all()
    const fallbackStories = stories.length > 0 ? stories : topNews

    return {
      updatedAt: new Date().toISOString(),
      lead: fallbackStories[0] ?? topNews[0]!,
      stories: fallbackStories.slice(1),
      tickers: marketTickers.length > 0 ? marketTickers : tickers,
      dataSource: 'fallback',
      marketSource: 'fallback',
      newsSource: 'fallback',
      lastRefreshAt: null,
      nextRefreshAt: nextRefreshAt ? new Date(nextRefreshAt).toISOString() : null,
    }
  }

  getPage(request: ArticlePageRequest): ArticleRecordsResponse {
    return articleDb.getArticlePage(this.db, request)
  }

  getDataCenterPage(request: ArticlePageRequest): ArticleRecordsResponse {
    return articleDb.getDataCenterArticlePage(this.db, request)
  }

  getRecentArticles(sinceIso: string, limit: number) {
    return articleDb.getRecentArticles(this.db, sinceIso, limit)
  }

  store(stories: NewsStory[], fetchedAt: number) {
    articleDb.storeArticles(this.db, stories, fetchedAt)
  }

  getRefreshLog(request: PageRequest, isRefreshing: boolean): RefreshLogResponse {
    const { page, pageSize } = request
    const offset = (page - 1) * pageSize
    const total = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM refresh_logs').get()?.count ?? 0
    const summary = this.db
      .query<
        {
          totalArticles: number | null
          totalMarketQuotes: number | null
          successfulRuns: number | null
          failedRuns: number | null
          averageDurationMs: number | null
        },
        []
      >(
        `SELECT COALESCE(SUM(news_count), 0) as totalArticles, COALESCE(SUM(market_count), 0) as totalMarketQuotes, COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) as successfulRuns, COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failedRuns, COALESCE(ROUND(AVG(duration_ms)), 0) as averageDurationMs FROM refresh_logs`,
      )
      .get()
    const entries = this.db
      .query<
        RefreshLogEntry,
        [number, number]
      >(`SELECT id, started_at as startedAt, finished_at as finishedAt, status, market_count as marketCount, news_count as newsCount, duration_ms as durationMs, message, next_refresh_at as nextRefreshAt FROM refresh_logs ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(pageSize, offset)

    return {
      updatedAt: new Date().toISOString(),
      isRefreshing,
      page,
      pageSize,
      total,
      summary: {
        totalArticles: summary?.totalArticles ?? 0,
        totalMarketQuotes: summary?.totalMarketQuotes ?? 0,
        successfulRuns: summary?.successfulRuns ?? 0,
        failedRuns: summary?.failedRuns ?? 0,
        averageDurationMs: summary?.averageDurationMs ?? 0,
      },
      entries,
    }
  }

  recordRefreshLog(entry: RefreshLogInput, nextRefreshAt: number) {
    this.db
      .prepare(
        'INSERT INTO refresh_logs (started_at, finished_at, status, market_count, news_count, duration_ms, message, next_refresh_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        new Date(entry.startedAt).toISOString(),
        new Date(entry.finishedAt).toISOString(),
        entry.status,
        entry.marketCount,
        entry.newsCount,
        Math.max(0, entry.finishedAt - entry.startedAt),
        entry.message,
        nextRefreshAt ? new Date(nextRefreshAt).toISOString() : null,
      )
  }

  private initialize() {
    this.db.exec(schemaSql)
    const storyColumns = this.db.query<{ name: string }, []>('PRAGMA table_info(news_stories)').all()
    if (!storyColumns.some((column) => column.name === 'url')) this.db.exec('ALTER TABLE news_stories ADD COLUMN url TEXT')
    const portfolioSnapshotColumns = this.db.query<{ name: string }, []>('PRAGMA table_info(portfolio_snapshots)').all()
    if (!portfolioSnapshotColumns.some((column) => column.name === 'novelty_profile'))
      this.db.exec("ALTER TABLE portfolio_snapshots ADD COLUMN novelty_profile TEXT NOT NULL DEFAULT 'medium'")
    if (!portfolioSnapshotColumns.some((column) => column.name === 'overlap_ratio'))
      this.db.exec('ALTER TABLE portfolio_snapshots ADD COLUMN overlap_ratio REAL NOT NULL DEFAULT 0')
    if (!portfolioSnapshotColumns.some((column) => column.name === 'turnover_ratio'))
      this.db.exec('ALTER TABLE portfolio_snapshots ADD COLUMN turnover_ratio REAL NOT NULL DEFAULT 0')
    const portfolioComparisonColumns = this.db.query<{ name: string }, []>('PRAGMA table_info(portfolio_comparisons)').all()
    if (!portfolioComparisonColumns.some((column) => column.name === 'max_drawdown_proxy'))
      this.db.exec('ALTER TABLE portfolio_comparisons ADD COLUMN max_drawdown_proxy REAL NOT NULL DEFAULT 0')

    if ((this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM news_stories').get()?.count ?? 0) === 0) {
      const insertStory = this.db.prepare(
        'INSERT INTO news_stories (id, section, headline, summary, source, time, impact, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      topNews.forEach((story, index) =>
        insertStory.run(story.id, story.section, story.headline, story.summary, story.source, story.time, story.impact, index),
      )
    }

    if ((this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM market_tickers').get()?.count ?? 0) === 0) {
      const insertTicker = this.db.prepare('INSERT INTO market_tickers (symbol, value, change, sort_order) VALUES (?, ?, ?, ?)')
      tickers.forEach((ticker, index) => insertTicker.run(ticker.symbol, ticker.value, ticker.change, index))
    }
  }
}
