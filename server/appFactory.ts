import { createConfig } from './config'
import { SqliteStore } from './database'
import { createTimeoutFetcher, OpenDataClient } from './feeds'
import { CommoditiesService } from './commoditiesService'
import { MarketSignalsService } from './marketSignalsService'
import { NewsService } from './newsService'
import { OPTIMIZED_PORTFOLIO_REFRESH_MS, OptimizedPortfolioService } from './optimizedPortfolioService'
import { AutoPortfolioService } from './portfolio'
import { PortfolioBacktestService } from './portfolioBacktestService'
import { PortfolioCacheCoordinator } from './portfolioCacheCoordinator'
import { PortfolioScenarioComparisonService } from './portfolioComparison'
import { PortfolioDecisionService } from './portfolioDecisionService'
import { PortfolioOptimizeRunner } from './portfolioOptimizeRunner'
import { PortfolioScenarioService } from './portfolioScenarioService'
import { KeywordPopularityRankingService, PopularSnapshotService } from './popularity'
import { registerApiRoutes, type ApiRouteDeps } from './registerApiRoutes'
import { IntervalScheduler } from './scheduler'
import { TickerHistoryService } from './tickerHistoryService'
import { TickerWatchlistService } from './tickerWatchlistService'

export type BoomBoomRuntime = ApiRouteDeps & {
  config: ReturnType<typeof createConfig>
  store: SqliteStore
  scheduler: IntervalScheduler
  portfolioCaches: PortfolioCacheCoordinator
  portfolioOptimizeRunner: PortfolioOptimizeRunner
}

export const buildRuntime = (): BoomBoomRuntime => {
  const config = createConfig()
  const store = new SqliteStore(config.dbPath, config.dataDir)
  const openData = new OpenDataClient(createTimeoutFetcher(config.fetchTimeoutMs), config.watchlist, config.newsFeedSources)
  const historyFetcher = createTimeoutFetcher(Math.max(config.fetchTimeoutMs, 45_000))
  const portfolioOptimizeRunner = new PortfolioOptimizeRunner(store, openData, historyFetcher, config)
  const portfolioComparison = new PortfolioScenarioComparisonService(store, historyFetcher, {
    benchmarkSymbol: 'SPY',
    cacheMs: 5 * 60_000,
    fetchConcurrency: 12,
  })
  const ranking = new KeywordPopularityRankingService()
  const popular = new PopularSnapshotService(store, store, ranking, config.popularRefreshMs, config.popularRetentionMs)
  const news = new NewsService(store, openData, popular, { dataRefreshMs: config.dataRefreshMs })
  const portfolios = new AutoPortfolioService(store, openData, {
    refreshMs: config.portfolioRefreshMs,
    benchmarkSymbol: 'SPY',
    diversityWeight: config.portfolioDiversityWeight,
  })
  const portfolioScenarios = new PortfolioScenarioService(store, portfolios)
  const tickerWatchlist = new TickerWatchlistService(openData, historyFetcher, config.watchlist)
  const tickerHistory = new TickerHistoryService(store, historyFetcher, ['SPY', 'QQQ'])
  const portfolioBacktests = new PortfolioBacktestService(store, 'SPY')
  const commodities = new CommoditiesService(store, openData, historyFetcher)
  const optimizedPortfolios = new OptimizedPortfolioService(store, openData, portfolioOptimizeRunner, historyFetcher, config)
  const portfolioDecisions = new PortfolioDecisionService(store, store, () => optimizedPortfolios.getSummary())
  const marketSignals = new MarketSignalsService({
    tickers: () => tickerWatchlist.getWatchlist(),
    popular: async () => popular.getLatest(),
    optimizedPortfolios: () => optimizedPortfolios.getSummary(),
    portfolioDecisions: () => portfolioDecisions.getDecisions('balanced'),
  })
  const portfolioCaches = new PortfolioCacheCoordinator(
    portfolioComparison,
    optimizedPortfolios,
    portfolioDecisions,
    marketSignals,
    (scenarioId) => store.getPortfolioScenario(scenarioId)?.source,
  )
  portfolioCaches.wireOptimizeRunner(portfolioOptimizeRunner)

  const scheduler = new IntervalScheduler([
    { name: 'news_refresh', intervalMs: config.dataRefreshMs, run: () => news.refresh(), runImmediately: true },
    { name: 'popular_ensure', intervalMs: config.popularEnsureMs, run: () => popular.ensureSnapshot() },
    {
      name: 'portfolio_refresh',
      intervalMs: config.portfolioRefreshMs,
      run: async () => {
        portfolios.ensureSnapshot()
        await portfolioCaches.warmAll('portfolio refresh')
      },
      runImmediately: true,
    },
    {
      name: 'optimized_portfolio',
      intervalMs: OPTIMIZED_PORTFOLIO_REFRESH_MS,
      run: () => optimizedPortfolios.runScheduledOptimization(),
      runImmediately: true,
    },
    {
      name: 'quant_reoptimize_check',
      intervalMs: 60_000,
      run: () => portfolioOptimizeRunner.enqueueDueQuantScenarios(),
      runImmediately: false,
    },
    {
      name: 'decision_finalize',
      intervalMs: 5 * 60_000,
      run: () => portfolioDecisions.finalizeBalancedSurvivorsIfDue(),
      runImmediately: false,
    },
    {
      name: 'ticker_history_sync',
      intervalMs: 24 * 60 * 60_000,
      run: async () => {
        await tickerHistory.sync()
      },
      runImmediately: true,
    },
    {
      name: 'commodities_refresh',
      intervalMs: 15 * 60_000,
      run: async () => {
        await commodities.refresh()
      },
      runImmediately: true,
    },
  ])

  return {
    config,
    store,
    scheduler,
    portfolioCaches,
    portfolioOptimizeRunner,
    distDir: config.distDir,
    pingDb: () => store.ping(),
    news,
    tickerWatchlist,
    tickerHistory,
    commodities,
    marketSignals,
    popular,
    portfolios,
    portfolioScenarios,
    portfolioComparison,
    portfolioDecisions,
    optimizedPortfolios,
    portfolioBacktests,
  }
}

export const createApp = (runtime: BoomBoomRuntime) => registerApiRoutes(runtime)
