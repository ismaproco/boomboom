import { dashboardConfig } from '../dashboardConfig'
import type {
  ArticleRecordsResponse,
  CommoditiesResponse,
  MarketSignalsResponse,
  OptimizedPortfoliosResponse,
  PortfolioBracketMode,
  PortfolioBracketResponse,
  PortfolioComparisonResponse,
  PortfolioDecisionResponse,
  PortfolioHistoryResponse,
  PortfolioResponse,
  PortfolioSignalCalibrationResponse,
  PopularResponse,
  RefreshLogResponse,
  TickerWatchlistResponse,
} from '../types'

export const getEmptyRefreshLog = (): RefreshLogResponse => ({
  updatedAt: new Date().toISOString(),
  isRefreshing: false,
  page: 1,
  pageSize: dashboardConfig.pageSize,
  total: 0,
  summary: {
    totalArticles: 0,
    totalMarketQuotes: 0,
    successfulRuns: 0,
    failedRuns: 0,
    averageDurationMs: 0,
  },
  entries: [],
})

export const getEmptyArticleRecords = (page = 1): ArticleRecordsResponse => ({
  updatedAt: new Date().toISOString(),
  page,
  pageSize: dashboardConfig.pageSize,
  total: 0,
  articles: [],
})

export const getEmptyTickerWatchlist = (): TickerWatchlistResponse => ({
  updatedAt: new Date().toISOString(),
  source: 'fallback',
  items: [],
})

export const getEmptyMarketSignals = (): MarketSignalsResponse => ({
  updatedAt: new Date().toISOString(),
  source: 'fallback',
  productFraming: 'exploratory_market_signals',
  summary: {
    title: 'Market Signals',
    narrative: 'Market signals are loading from portfolios, Popular news, and ticker momentum.',
    highConvictionCount: 0,
    newsBreakoutCount: 0,
    riskWatchCount: 0,
  },
  items: [],
})

export const getEmptyCommodities = (): CommoditiesResponse => ({
  updatedAt: new Date().toISOString(),
  source: 'fallback',
  snapshot: null,
  items: [],
  snapshots: [],
  relatedNews: [],
  assumptions: [],
})

export const getEmptyPopular = (): PopularResponse => ({
  updatedAt: new Date().toISOString(),
  snapshot: null,
  previousSnapshot: null,
  items: [],
})

export const getEmptyPortfolios = (): PortfolioResponse => ({
  updatedAt: new Date().toISOString(),
  snapshot: null,
  positions: [],
  comparison: null,
})

export const getEmptyPortfolioHistory = (): PortfolioHistoryResponse => ({
  updatedAt: new Date().toISOString(),
  page: 1,
  pageSize: dashboardConfig.pageSize,
  total: 0,
  snapshots: [],
})

export const getEmptyPortfolioComparison = (): PortfolioComparisonResponse => ({
  updatedAt: new Date().toISOString(),
  asOf: new Date().toISOString(),
  benchmarkSymbol: 'SPY',
  assumptions: [],
  scenarios: [],
})

export const getEmptyOptimizedPortfolios = (): OptimizedPortfoliosResponse => ({
  updatedAt: new Date().toISOString(),
  nextRunAt: null,
  benchmarkSymbol: 'SPY',
  tiers: [],
  charts: { growth: [], drawdown: [], riskReturn: [], correlationHeatmap: { rows: [], columns: [], cells: [] } },
})

export const getEmptyPortfolioDecisions = (): PortfolioDecisionResponse => ({
  updatedAt: new Date().toISOString(),
  asOf: new Date().toISOString(),
  riskProfile: 'balanced',
  productFraming: 'exploratory_decision_overlay',
  assumptions: [],
  portfolioRankings: [],
  recommendedAllocation: [],
  positionDecisions: [],
  riskFlags: [],
  newsThemes: [],
  dailyChecklist: [],
  dailySurvivors: [],
})

export const getEmptyPortfolioBracket = (mode: PortfolioBracketMode = 'finalized'): PortfolioBracketResponse => ({
  updatedAt: new Date().toISOString(),
  startDate: '',
  endDate: '',
  defaultRange: true,
  mode,
  source: 'all',
  rankScope: mode === 'intraday' ? 'all' : 'survivors',
  asOf: null,
  participantCount: 0,
  sourceSurvivorCount: 0,
  champion: null,
  participants: [],
  rounds: [],
  assumptions: [],
})

export const getEmptyPortfolioSignalCalibration = (): PortfolioSignalCalibrationResponse => ({
  updatedAt: new Date().toISOString(),
  scenarioId: 0,
  productFraming: 'exploratory',
  realizedHorizonNote: '',
  assumptions: [],
  pairs: [],
  summary: { sampleSize: 0, correlationModelTiltVsExcess: null, meanAbsoluteError: null },
})
