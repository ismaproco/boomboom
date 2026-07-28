import type { Impact, NoveltyProfile, SourceState } from './common'

export type NewsFeedSource = {
  name: string
  url: string
}

export type NewsStory = {
  id: number
  section: string
  headline: string
  summary: string
  source: string
  time: string
  impact: Impact
  url?: string
  publishedAt?: string | null
}

export type Ticker = {
  symbol: string
  value: string
  change: string
  /** Raw last price from the quote provider; used for portfolio math (avoid rounded `value`). */
  lastPrice?: number
}

export type TickerWatchlistItem = {
  symbol: string
  name: string
  price: number | null
  change1Day: number | null
  change1Week: number | null
  weekChangeSeries: number[]
  shortScore: number
  buyScore: number
  sentiment: 'Bullish' | 'Neutral' | 'Bearish'
}

export type TickerWatchlistResponse = {
  updatedAt: string
  source: SourceState
  items: TickerWatchlistItem[]
}

export type MarketSignalCategory = 'high-conviction' | 'news-breakout' | 'risk-watch' | 'contrarian'

export type MarketSignalMetrics = {
  portfolioScore: number
  newsScore: number
  momentumScore: number
  sentimentScore: number
  freshnessScore: number
  riskPenalty: number
}

export type MarketSignalItem = {
  symbol: string
  name: string
  score: number
  category: MarketSignalCategory
  rationale: string
  evidence: string[]
  risks: string[]
  metrics: MarketSignalMetrics
  relatedPortfolios: string[]
  relatedPopularHeadlines: string[]
}

export type MarketSignalsResponse = {
  updatedAt: string
  source: SourceState
  productFraming: 'exploratory_market_signals'
  summary: {
    title: string
    narrative: string
    highConvictionCount: number
    newsBreakoutCount: number
    riskWatchCount: number
  }
  items: MarketSignalItem[]
}

export type TopNewsResponse = {
  updatedAt: string
  lead: NewsStory
  stories: NewsStory[]
  tickers: Ticker[]
  dataSource: SourceState
  marketSource: SourceState
  newsSource: SourceState
  lastRefreshAt: string | null
  nextRefreshAt: string | null
  refreshError?: string
}

export type RefreshLogEntry = {
  id: number
  startedAt: string
  finishedAt: string
  status: 'success' | 'partial' | 'failed' | 'skipped'
  marketCount: number
  newsCount: number
  durationMs: number
  message: string
  nextRefreshAt: string | null
}

export type RefreshLogResponse = {
  updatedAt: string
  isRefreshing: boolean
  page: number
  pageSize: number
  total: number
  summary: {
    totalArticles: number
    totalMarketQuotes: number
    successfulRuns: number
    failedRuns: number
    averageDurationMs: number
  }
  entries: RefreshLogEntry[]
}

export type ArticleRecord = NewsStory & {
  fetchedAt: string
}

export type ArticleRecordsResponse = {
  updatedAt: string
  page: number
  pageSize: number
  total: number
  articles: ArticleRecord[]
}

export type PageRequest = {
  page: number
  pageSize: number
}

export type ArticlePageRequest = PageRequest & {
  searchTerm?: string
  /** When set, return up to this many rows from page 1 (bounded list-all for dashboards). */
  maxItems?: number
}

export type PopularSnapshot = {
  id: number
  createdAt: string
  articleCount: number
  clusterCount: number
}

export type PopularItem = {
  id: number
  snapshotId: number
  rank: number
  previousRank: number | null
  rankDelta: number | null
  score: number
  headline: string
  summary: string
  section: string
  primarySource: string
  sourceCount: number
  articleCount: number
  sources: string[]
  articleIds: number[]
  keywords: string[]
  latestPublishedAt: string | null
  earliestPublishedAt: string | null
}

export type PopularSnapshotClusterPreview = {
  rank: number
  previousRank: number | null
  rankDelta: number | null
  score: number
  headline: string
  section: string
  sourceCount: number
  articleCount: number
  keywords: string[]
}

export type PopularSnapshotSummary = PopularSnapshot & {
  articleDelta: number | null
  clusterDelta: number | null
  newCount: number
  risingCount: number
  fallingCount: number
  stableCount: number
  droppedCount: number
  topCluster: PopularSnapshotClusterPreview | null
  topNewCluster: PopularSnapshotClusterPreview | null
  biggestRiser: PopularSnapshotClusterPreview | null
  biggestFaller: PopularSnapshotClusterPreview | null
  topDropped: PopularSnapshotClusterPreview | null
  leadingSections: Array<{ label: string; count: number }>
  leadingKeywords: Array<{ label: string; count: number }>
}

export type PopularResponse = {
  updatedAt: string
  snapshot: PopularSnapshot | null
  previousSnapshot: PopularSnapshot | null
  items: PopularItem[]
}

export type PopularSnapshotsResponse = {
  updatedAt: string
  snapshots: PopularSnapshotSummary[]
}

export type RefreshMode = 'news' | 'quant'

export type PortfolioScenarioSource = 'manual' | 'optimized'

export type QuantUniversePolicy = 'reroll' | 'keep' | 'keep_some'

export type QuantMethod = 'max_sharpe' | 'hrp' | 'black_litterman'

export type PortfolioScenario = {
  id: number
  name: string
  symbols: string[]
  noveltyProfile: NoveltyProfile
  maxWeightPerAsset: number
  isDefault: boolean
  createdAt: string
  updatedAt: string
  refreshMode: RefreshMode
  blendTrending: boolean
  quantMethod: QuantMethod | null
  quantTargetN: number | null
  quantReoptimizeMs: number | null
  quantUniversePolicy: QuantUniversePolicy | null
  quantKeepCount: number | null
  quantNextRunAt: string | null
  source: PortfolioScenarioSource
}

export type PortfolioScenariosResponse = {
  updatedAt: string
  scenarios: PortfolioScenario[]
}

export type PortfolioSnapshot = {
  id: number
  scenarioId: number
  createdAt: string
  benchmarkSymbol: string
  benchmarkValue: number
  expectedReturn: number
  sourceSnapshotId: number | null
  viewCount: number
  noveltyProfile: NoveltyProfile
  overlapRatio: number
  turnoverRatio: number
  /** Recency / attention multiplier from Trending (news scenarios). */
  regimeShift: number
  /** 0–1: weights × Trending view intensity (narrative crowding). */
  newsAlignment: number
  /** −1–1: simple bullish vs bearish lexicon tilt in clusters touching holdings. */
  lexiconTilt: number
}

export type PortfolioPosition = {
  id: number
  snapshotId: number
  symbol: string
  weight: number
  viewScore: number
  impliedReturn: number
  entryPrice: number
}

export type PortfolioComparison = {
  id: number
  snapshotId: number
  comparedSnapshotId: number
  benchmarkSymbol: string
  portfolioReturn: number
  benchmarkReturn: number
  excessReturn: number
  maxDrawdownProxy: number
  measuredAt: string
}

export type PortfolioCalibrationPair = {
  intervalEndSnapshotId: number
  intervalEndAt: string
  priorSnapshotId: number
  priorSnapshotAt: string
  modelTilt: number
  regimeShift: number
  newsAlignment: number
  lexiconTilt: number
  realizedExcessReturn: number | null
}

export type PortfolioSignalCalibrationResponse = {
  updatedAt: string
  scenarioId: number
  productFraming: 'exploratory'
  realizedHorizonNote: string
  assumptions: string[]
  pairs: PortfolioCalibrationPair[]
  summary: {
    sampleSize: number
    correlationModelTiltVsExcess: number | null
    meanAbsoluteError: number | null
  }
}

export type PortfolioResponse = {
  updatedAt: string
  snapshot: PortfolioSnapshot | null
  positions: PortfolioPosition[]
  comparison: PortfolioComparison | null
}

export type PortfolioHistoryResponse = {
  updatedAt: string
  page: number
  pageSize: number
  total: number
  snapshots: Array<{
    snapshot: PortfolioSnapshot
    comparison: PortfolioComparison | null
  }>
}

export type PortfolioComparisonHorizonResult = {
  days: number
  label: string
  status: 'complete' | 'partial' | 'unavailable'
  startDate: string | null
  endDate: string | null
  portfolioReturn: number | null
  benchmarkReturn: number | null
  excessReturn: number | null
  maxDrawdown: number | null
  note: string | null
}

export type PortfolioComparisonSeriesPoint = {
  date: string
  portfolioReturn: number
  benchmarkReturn: number
  excessReturn: number
}

export type PortfolioScenarioComparison = {
  scenarioId: number
  name: string
  refreshMode: RefreshMode
  benchmarkSymbol: string
  latestSnapshotAt: string | null
  horizons: PortfolioComparisonHorizonResult[]
  chartSeries: PortfolioComparisonSeriesPoint[]
}

export type PortfolioComparisonResponse = {
  updatedAt: string
  asOf: string
  benchmarkSymbol: string
  assumptions: string[]
  scenarios: PortfolioScenarioComparison[]
}

export type OptimizedPortfolioTier = {
  key: string
  name: string
  riskLabel: string
  description: string
  scenario: PortfolioScenario
  snapshot: PortfolioSnapshot | null
  positions: PortfolioPosition[]
  comparison: PortfolioComparison | null
  metrics: OptimizedPortfolioMetrics
}

export type OptimizedPortfolioMetrics = {
  sharpeRatio: number | null
  annualizedVolatility: number | null
  maxDrawdown: number | null
  betaVsBenchmark: number | null
  correlationVsBenchmark: number | null
  topFiveConcentration: number
  effectiveHoldings: number
  newPositions: number
  droppedPositions: number
  winnerDerivedPositions: number
  backfilledPositions: number
}

export type OptimizedPortfoliosResponse = {
  updatedAt: string
  nextRunAt: string | null
  benchmarkSymbol: string
  tiers: OptimizedPortfolioTier[]
  charts: OptimizedPortfolioCharts
}

export type OptimizedChartSeries = {
  id: string
  name: string
  values: Array<{ date: string; value: number }>
}

export type OptimizedRiskReturnPoint = {
  scenarioId: number
  name: string
  riskLabel: string
  annualizedReturn: number | null
  annualizedVolatility: number | null
  effectiveHoldings: number
}

export type OptimizedHeatmapCell = {
  row: string
  column: string
  correlation: number | null
}

export type OptimizedPortfolioCharts = {
  growth: OptimizedChartSeries[]
  drawdown: OptimizedChartSeries[]
  riskReturn: OptimizedRiskReturnPoint[]
  correlationHeatmap: {
    rows: string[]
    columns: string[]
    cells: OptimizedHeatmapCell[]
  }
}

export type PortfolioDecisionProfile = 'conservative' | 'balanced' | 'aggressive'
export type PortfolioDecisionAction = 'increase' | 'hold' | 'trim' | 'avoid' | 'watch'
export type PositionDecisionAction = 'add' | 'hold' | 'cap' | 'trim' | 'avoid'
export type DecisionConviction = 'low' | 'medium' | 'high'

export type PortfolioRiskFlagCode =
  | 'single_name_concentration'
  | 'extreme_single_name_concentration'
  | 'top_five_concentration'
  | 'low_effective_holdings'
  | 'optimizer_corner_solution'
  | 'high_turnover'
  | 'full_rotation'
  | 'negative_active_signal'
  | 'insufficient_history'

export type PositionRiskFlagCode =
  | 'over_weight'
  | 'negative_implied_return'
  | 'theme_headwind'
  | 'energy_price_headwind'
  | 'unconfirmed_tactical'
  | 'zero_weight_candidate'

export type PortfolioRiskFlag = {
  code: PortfolioRiskFlagCode
  severity: 'low' | 'medium' | 'high'
  message: string
}

export type PositionRiskFlag = {
  code: PositionRiskFlagCode
  severity: 'low' | 'medium' | 'high'
  message: string
}

export type PortfolioDecision = {
  portfolioId: number
  portfolioName: string
  latestSnapshotId: number | null
  source: PortfolioScenarioSource
  refreshMode: RefreshMode
  action: PortfolioDecisionAction
  conviction: DecisionConviction
  role: 'defensive_anchor' | 'diversified_active' | 'alpha_source' | 'tactical_satellite' | 'unstable_optimizer' | 'news_signal'
  score: number
  suggestedAllocationPct: number
  maxAllocationPct: number
  metrics: {
    expectedReturn: number | null
    sharpeRatio: number | null
    annualizedVolatility: number | null
    betaVsBenchmark: number | null
    maxDrawdown: number | null
    topFiveConcentration: number
    effectiveHoldings: number
    turnoverRatio: number | null
    excessReturn: number | null
  }
  riskFlags: PortfolioRiskFlag[]
  rationale: string[]
}

export type PositionDecision = {
  symbol: string
  action: PositionDecisionAction
  conviction: DecisionConviction
  currentWeight: number
  suggestedMaxWeight: number
  impliedReturn: number | null
  portfolios: string[]
  rationale: string[]
  flags: PositionRiskFlag[]
}

export type PortfolioDecisionAllocation = {
  portfolioName: string
  targetPct: number
  maxPct: number
  rationale: string
}

export type PortfolioDecisionNewsTheme = {
  key: 'oil_geopolitics' | 'ai_infrastructure' | 'data_centers' | 'defensive_quality' | 'consumer_defensive' | 'financial_market_structure'
  label: string
  stance: 'supportive' | 'headwind' | 'neutral'
  score: number
  rationale: string
}

export type PortfolioDecisionResponse = {
  updatedAt: string
  asOf: string
  riskProfile: PortfolioDecisionProfile
  productFraming: 'exploratory_decision_overlay'
  assumptions: string[]
  portfolioRankings: PortfolioDecision[]
  recommendedAllocation: PortfolioDecisionAllocation[]
  positionDecisions: PositionDecision[]
  riskFlags: PortfolioRiskFlag[]
  newsThemes: PortfolioDecisionNewsTheme[]
  dailyChecklist: string[]
  dailySurvivors: PortfolioDailySurvivor[]
}

export type PortfolioDecisionRunStatus = 'intraday' | 'finalized'

export type PortfolioDecisionRun = {
  id: number
  createdAt: string
  marketSessionDate: string
  profile: PortfolioDecisionProfile
  status: PortfolioDecisionRunStatus
  portfolioRankings: PortfolioDecision[]
  positionDecisions: PositionDecision[]
  newsThemes: PortfolioDecisionNewsTheme[]
  dailyChecklist: string[]
  assumptions: string[]
}

export type PortfolioDailySurvivor = {
  id: number
  decisionRunId: number
  marketSessionDate: string
  scenarioId: number
  scenarioName: string
  snapshotId: number | null
  rank: number
  survivorScore: number
  realizedExcessReturn: number | null
  decisionScore: number
  maxDrawdown: number | null
  topFiveConcentration: number
  turnoverRatio: number | null
  selectedAt: string
  selectionReason: string
}

export type PortfolioDecisionRunsResponse = {
  updatedAt: string
  runs: PortfolioDecisionRun[]
}

export type PortfolioDailySurvivorsResponse = {
  updatedAt: string
  marketSessionDate: string | null
  survivors: PortfolioDailySurvivor[]
}

export type PortfolioBracketMode = 'finalized' | 'intraday'
export type PortfolioBracketSource = 'all' | PortfolioScenarioSource
export type PortfolioBracketRankScope = 'survivors' | 'all'

export type PortfolioBracketParticipant = {
  seed: number
  scenarioId: number
  scenarioName: string
  source?: PortfolioScenarioSource
  appearanceCount: number
  activeDates: string[]
  totalSurvivorScore: number
  averageSurvivorScore: number
  averageDecisionScore: number
  averageRealizedExcessReturn: number | null
  averageMaxDrawdown: number | null
  averageTopFiveConcentration: number | null
  averageTurnoverRatio: number | null
  latestRunAt?: string | null
  averageRank?: number | null
  scoreStability?: number | null
  intradaySampleCount?: number
  latestSelectionReason: string
}

export type PortfolioBracketMatch = {
  id: string
  round: number
  roundName: string
  matchNumber: number
  left: PortfolioBracketParticipant | null
  right: PortfolioBracketParticipant | null
  leftScore: number | null
  rightScore: number | null
  winner: PortfolioBracketParticipant | null
  isBye: boolean
  decisionBasis: 'aggregate_survivor_score' | 'recency_weighted_intraday_score'
}

export type PortfolioBracketRound = {
  round: number
  name: string
  matches: PortfolioBracketMatch[]
}

export type PortfolioBracketResponse = {
  updatedAt: string
  startDate: string
  endDate: string
  defaultRange: boolean
  mode: PortfolioBracketMode
  source: PortfolioBracketSource
  rankScope: PortfolioBracketRankScope
  asOf: string | null
  participantCount: number
  sourceSurvivorCount: number
  champion: PortfolioBracketParticipant | null
  participants: PortfolioBracketParticipant[]
  rounds: PortfolioBracketRound[]
  assumptions: string[]
}

export interface ArticleRepository {
  getPage(request: ArticlePageRequest): ArticleRecordsResponse
  getDataCenterPage(request: ArticlePageRequest): ArticleRecordsResponse
  getRecentArticles(sinceIso: string, limit: number): ArticleRecord[]
  store(stories: NewsStory[], fetchedAt: number): void
}

export interface TopNewsFallbackRepository {
  getSeededTopNews(nextRefreshAt: number): TopNewsResponse
}

export type RefreshLogInput = Omit<RefreshLogEntry, 'id' | 'startedAt' | 'finishedAt' | 'durationMs' | 'nextRefreshAt'> & {
  startedAt: number
  finishedAt: number
}

export interface RefreshLogRepository {
  getRefreshLog(request: PageRequest, isRefreshing: boolean): RefreshLogResponse
  recordRefreshLog(entry: RefreshLogInput, nextRefreshAt: number): void
}

export interface LiveNewsGateway {
  fetchLiveTickers(additionalSymbols?: readonly string[]): Promise<Ticker[]>
  fetchLiveNews(): Promise<NewsStory[]>
}

export interface SnapshotCoordinator {
  ensureSnapshot(): void
}

export interface PopularRepository {
  getLatestSnapshot(): PopularSnapshot | null
  getSnapshot(snapshotId: number): PopularSnapshot | null
  getPreviousSnapshot(createdAt: string): PopularSnapshot | null
  getSnapshots(limit: number): PopularSnapshot[]
  getSnapshotSummaries(limit: number): PopularSnapshotSummary[]
  getItems(snapshotId: number): PopularItem[]
  getPreviousRanks(snapshotId: number): Map<string, number>
  saveSnapshot(input: {
    createdAt: string
    articleCount: number
    clusters: RankedPopularCluster[]
    previousRanks: Map<string, number>
  }): void
  cleanup(cutoffIso: string): void
}

export interface PopularRankingService {
  rank(articles: ArticleRecord[]): RankedPopularCluster[]
}

export type PortfolioScenarioInput = {
  name: string
  symbols: string[]
  noveltyProfile: NoveltyProfile
  maxWeightPerAsset: number
  refreshMode?: RefreshMode
  blendTrending?: boolean
  quantMethod?: QuantMethod | null
  quantTargetN?: number | null
  quantReoptimizeMs?: number | null
  quantUniversePolicy?: QuantUniversePolicy | null
  quantKeepCount?: number | null
  quantNextRunAt?: string | null
  source?: PortfolioScenarioSource
}

export type OptimizeJobStep = 'queued' | 'sampling' | 'fetching_history' | 'aligning_returns' | 'optimizing' | 'persisting'

export type OptimizeJobStatus = 'queued' | 'running' | 'completed' | 'failed'

export type PortfolioOptimizeJobMetrics = {
  annualizedReturn: number
  annualizedVol: number
  sharpeRatio: number
}

export type PortfolioOptimizeJob = {
  id: number
  status: OptimizeJobStatus
  step: OptimizeJobStep
  detail: string | null
  progress: number
  error: string | null
  scenarioId: number | null
  metrics: PortfolioOptimizeJobMetrics | null
  createdAt: string
  updatedAt: string
}

export type TickerHistoryBar = {
  symbol: string
  date: string
  adjClose: number
  updatedAt: string
}

export type TickerHistorySyncStatus = {
  symbol: string
  lastSyncedAt: string | null
  lastBarDate: string | null
  status: 'ok' | 'stale' | 'error' | 'never'
  error: string | null
}

export type TickerHistoryStatusResponse = {
  updatedAt: string
  symbols: TickerHistorySyncStatus[]
}

export type PortfolioBacktestRun = {
  id: number
  createdAt: string
  benchmarkSymbol: string
  rebalanceCadence: 'weekly'
  lookbackDays: number
  feeBps: number
  slippageBps: number
  status: 'running' | 'completed' | 'failed'
  error: string | null
}

export type PortfolioBacktestMetric = {
  runId: number
  scenarioId: number
  horizonDays: number
  coverageRatio: number
  annualizedReturn: number
  annualizedVolatility: number
  sharpeRatio: number
  maxDrawdown: number
  benchmarkReturn: number
  excessReturn: number
  winRate: number
  averageTurnover: number
}

export type PortfolioBacktestRunResponse = {
  updatedAt: string
  run: PortfolioBacktestRun | null
  metrics: PortfolioBacktestMetric[]
}

export type PortfolioLiveCandidate = {
  scenarioId: number
  scenarioName: string
  runId: number
  compositeScore: number
  selectedAt: string
  reason: string
}

export type PortfolioLiveCandidatesResponse = {
  updatedAt: string
  candidates: PortfolioLiveCandidate[]
}

export type CommodityCategory = 'energy' | 'precious-metals' | 'industrial-metals' | 'agriculture' | 'miners'

export type CommodityInstrument = {
  symbol: string
  name: string
  category: CommodityCategory
  underlying: string
  proxyType: 'etf' | 'equity'
  sortOrder: number
  isActive: boolean
}

export type CommoditySnapshotItem = {
  symbol: string
  name: string
  category: CommodityCategory
  underlying: string
  proxyType: 'etf' | 'equity'
  price: number | null
  change1Day: number | null
  change1Week: number | null
  change1Month: number | null
  weekChangeSeries: number[]
  volatility30d: number | null
  signal: 'bullish' | 'neutral' | 'bearish'
  signalScore: number
  riskLabel: 'low-vol' | 'elevated-vol' | 'shock-vol'
  riskScore: number
  note: string
}

export type CommodityNewsLink = {
  id: number
  snapshotId: number
  symbol: string
  articleId: number
  score: number
  matchedTerms: string[]
}

export type CommoditySnapshotSummary = {
  id: number
  createdAt: string
  source: SourceState
  status: 'ok' | 'partial' | 'error'
  bullishCount: number
  neutralCount: number
  bearishCount: number
  itemCount: number
}

export type CommodityHistoryPoint = {
  date: string
  close: number
}

export type CommodityHistoryResponse = {
  updatedAt: string
  symbol: string
  days: number
  points: CommodityHistoryPoint[]
}

export type CommoditySnapshot = {
  id: number
  createdAt: string
  source: SourceState
  status: 'ok' | 'partial' | 'error'
  summaryJson: string
}

export type CommoditiesResponse = {
  updatedAt: string
  source: SourceState
  snapshot: CommoditySnapshot | null
  items: CommoditySnapshotItem[]
  snapshots: CommoditySnapshotSummary[]
  relatedNews: Array<{
    symbol: string
    articles: ArticleRecord[]
  }>
  assumptions: string[]
}

export interface PortfolioRepository {
  listPortfolioScenarios(): PortfolioScenario[]
  listPortfolioScenariosBySource(source: PortfolioScenarioSource): PortfolioScenario[]
  getPortfolioScenario(scenarioId: number): PortfolioScenario | null
  insertPortfolioScenario(input: PortfolioScenarioInput & { isDefault?: boolean }): number
  updatePortfolioScenario(scenarioId: number, input: Partial<PortfolioScenarioInput>): void
  deletePortfolioScenario(scenarioId: number): void

  createPortfolioOptimizeJob(input: { scenarioId: number | null; requestJson?: string | null }): number
  getPortfolioOptimizeJob(jobId: number): PortfolioOptimizeJob | null
  updatePortfolioOptimizeJob(
    jobId: number,
    input: Partial<{
      status: OptimizeJobStatus
      step: OptimizeJobStep
      detail: string | null
      progress: number
      error: string | null
      scenarioId: number | null
      resultJson: string | null
    }>,
  ): void
  scenarioHasActiveOptimizeJob(scenarioId: number): boolean

  getLatestPortfolioSnapshot(scenarioId: number): PortfolioSnapshot | null
  getPortfolioSnapshot(snapshotId: number): PortfolioSnapshot | null
  getPortfolioPositions(snapshotId: number): PortfolioPosition[]
  getLatestPortfolioComparison(snapshotId: number): PortfolioComparison | null
  getPortfolioHistory(request: PageRequest & { scenarioId: number }): PortfolioHistoryResponse
  getPortfolioSnapshotsForComparison(earliestIso: string): Array<PortfolioSnapshot & { positions: PortfolioPosition[] }>
  /** Oldest-first snapshots with latest comparison row per snapshot (for signal calibration). */
  getPortfolioSnapshotsAscending(
    scenarioId: number,
    limit: number,
  ): Array<{ snapshot: PortfolioSnapshot; comparison: PortfolioComparison | null }>
  savePortfolioDecisionRun(input: Omit<PortfolioDecisionRun, 'id'>): number
  updatePortfolioDecisionRunStatus(runId: number, status: PortfolioDecisionRunStatus): void
  getLatestPortfolioDecisionRun(profile?: PortfolioDecisionProfile, marketSessionDate?: string): PortfolioDecisionRun | null
  getPortfolioDecisionRuns(limit: number): PortfolioDecisionRun[]
  getPortfolioDecisionRunsRange(startDate: string, endDate: string): PortfolioDecisionRun[]
  replaceDailySurvivors(input: {
    marketSessionDate: string
    decisionRunId: number
    survivors: Array<Omit<PortfolioDailySurvivor, 'id' | 'decisionRunId' | 'marketSessionDate' | 'selectedAt'>>
    selectedAt: string
  }): void
  getDailySurvivors(marketSessionDate?: string): PortfolioDailySurvivor[]
  getDailySurvivorsRange(startDate: string, endDate: string): PortfolioDailySurvivor[]
  savePortfolioSnapshot(input: {
    scenarioId: number
    createdAt: string
    benchmarkSymbol: string
    benchmarkValue: number
    expectedReturn: number
    sourceSnapshotId: number | null
    viewCount: number
    noveltyProfile: NoveltyProfile
    overlapRatio: number
    turnoverRatio: number
    regimeShift: number
    newsAlignment: number
    lexiconTilt: number
    positions: Array<{
      symbol: string
      weight: number
      viewScore: number
      impliedReturn: number
      entryPrice: number
    }>
    comparison?: {
      comparedSnapshotId: number
      benchmarkSymbol: string
      portfolioReturn: number
      benchmarkReturn: number
      excessReturn: number
      maxDrawdownProxy: number
      measuredAt: string
    } | null
  }): number

  upsertTickerPriceHistory(symbol: string, bars: Array<{ date: string; adjClose: number }>): void
  getTickerPriceHistory(symbol: string, fromDate: string, toDate: string): TickerHistoryBar[]
  listTickerHistorySymbols(): string[]
  upsertTickerHistorySyncStatus(input: TickerHistorySyncStatus): void
  getTickerHistorySyncStatuses(symbols?: string[]): TickerHistorySyncStatus[]

  createPortfolioBacktestRun(input: {
    benchmarkSymbol: string
    rebalanceCadence: 'weekly'
    lookbackDays: number
    feeBps: number
    slippageBps: number
  }): number
  updatePortfolioBacktestRun(runId: number, input: Partial<Pick<PortfolioBacktestRun, 'status' | 'error'>>): void
  getPortfolioBacktestRun(runId: number): PortfolioBacktestRun | null
  replacePortfolioBacktestMetrics(runId: number, metrics: Omit<PortfolioBacktestMetric, 'runId'>[]): void
  getPortfolioBacktestMetrics(runId: number): PortfolioBacktestMetric[]
  replacePortfolioLiveCandidates(candidates: PortfolioLiveCandidate[]): void
  getPortfolioLiveCandidates(): PortfolioLiveCandidate[]

  upsertCommodityInstruments(instruments: CommodityInstrument[]): void
  listCommodityInstruments(activeOnly?: boolean): CommodityInstrument[]
  upsertCommodityPriceHistory(symbol: string, bars: Array<{ date: string; close: number }>): void
  getCommodityPriceHistory(
    symbol: string,
    fromDate: string,
    toDate: string,
  ): Array<{ symbol: string; date: string; close: number; updatedAt: string }>
  saveCommoditySnapshot(input: {
    source: SourceState
    status: 'ok' | 'partial' | 'error'
    summaryJson: string
    items: CommoditySnapshotItem[]
  }): number
  getLatestCommoditySnapshot(): CommoditySnapshot | null
  getCommoditySnapshotItems(snapshotId: number): CommoditySnapshotItem[]
  getCommoditySnapshots(limit: number): CommoditySnapshotSummary[]
  replaceCommodityNewsLinks(snapshotId: number, links: Array<Omit<CommodityNewsLink, 'id' | 'snapshotId'>>): void
  getCommodityNewsLinks(snapshotId: number, symbol?: string): CommodityNewsLink[]
}

export type RankedPopularCluster = {
  key: string
  headline: string
  summary: string
  section: string
  primarySource: string
  sourceCount: number
  articleCount: number
  sources: string[]
  articleIds: number[]
  keywords: string[]
  latestPublishedMs: number
  earliestPublishedMs: number
  score: number
}
