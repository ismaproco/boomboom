import type { AppConfig } from './config'
import { SP500_SYMBOLS } from './data/sp500'
import type { Fetcher } from './feeds'
import type {
  LiveNewsGateway,
  OptimizedPortfolioTier,
  OptimizedPortfoliosResponse,
  PortfolioComparison,
  PortfolioPosition,
  PortfolioRepository,
  PortfolioScenario,
  PortfolioSnapshot,
  QuantMethod,
} from './types'
import { fetchDailyAdjustedHistory, mapWithConcurrency, type DailyBar } from './yahooHistory'

export type OptimizedPortfolioJobRunner = {
  enqueue(request: { n: number; method: QuantMethod; scenarioId: number; universePolicy: 'keep' }): number | null
}

type OptimizedPortfolioDefinition = {
  key: string
  name: string
  riskLabel: string
  description: string
  n: number
  method: QuantMethod
  maxWeightPerAsset: number
  keepRatio: number
}

type SnapshotWithPositions = PortfolioSnapshot & { positions: PortfolioPosition[]; comparison?: PortfolioComparison | null }

type WinnerCandidate = {
  symbol: string
  score: number
}

export const OPTIMIZED_PORTFOLIO_REFRESH_MS = 5 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const LOOKBACK_DAYS = 365
const MIN_POOL_SIZE = 80
const SUMMARY_CACHE_MS = 60_000
const HISTORY_CACHE_MS = 5 * 60_000

export const optimizedPortfolioDefinitions: OptimizedPortfolioDefinition[] = [
  {
    key: 'capital-shield',
    name: 'Capital Shield',
    riskLabel: 'Lowest risk',
    description: 'Broad, lower-turnover allocation using HRP to dampen concentration and volatility.',
    n: 35,
    method: 'hrp',
    maxWeightPerAsset: 0.08,
    keepRatio: 0.75,
  },
  {
    key: 'balanced-engine',
    name: 'Balanced Engine',
    riskLabel: 'Low / medium risk',
    description: 'Diversified blend that keeps more proven winners while allowing measured rotation.',
    n: 30,
    method: 'black_litterman',
    maxWeightPerAsset: 0.1,
    keepRatio: 0.6,
  },
  {
    key: 'growth-core',
    name: 'Growth Core',
    riskLabel: 'Medium risk',
    description: 'Core growth book built from the best blended performers with moderate concentration.',
    n: 24,
    method: 'max_sharpe',
    maxWeightPerAsset: 0.14,
    keepRatio: 0.45,
  },
  {
    key: 'momentum-hunter',
    name: 'Momentum Hunter',
    riskLabel: 'High risk',
    description: 'Higher-turnover portfolio that leans harder into recent weighted winners.',
    n: 18,
    method: 'max_sharpe',
    maxWeightPerAsset: 0.2,
    keepRatio: 0.3,
  },
  {
    key: 'speculative-burst',
    name: 'Speculative Burst',
    riskLabel: 'Highest risk',
    description: 'Compact, aggressive allocation with the most reshuffling and highest concentration cap.',
    n: 12,
    method: 'max_sharpe',
    maxWeightPerAsset: 0.3,
    keepRatio: 0.15,
  },
]

export class OptimizedPortfolioService {
  private summaryCache: { expiresAt: number; response: OptimizedPortfoliosResponse } | null = null
  private historyCache = new Map<string, { expiresAt: number; bars: DailyBar[] | null }>()

  constructor(
    private readonly store: PortfolioRepository,
    private readonly market: LiveNewsGateway,
    private readonly runner: OptimizedPortfolioJobRunner,
    private readonly historyFetcher: Fetcher,
    private readonly config: Pick<AppConfig, 'portfolioQuantReoptimizeMs'>,
    private readonly benchmarkSymbol = 'SPY',
  ) {}

  async runScheduledOptimization() {
    this.summaryCache = null
    const scenarios = this.ensureOptimizedScenarios()
    const candidatePool = await this.buildCandidatePool()
    const refreshSeed = Math.floor(Date.now() / OPTIMIZED_PORTFOLIO_REFRESH_MS)
    const usedByTier: string[][] = []

    for (const definition of optimizedPortfolioDefinitions) {
      const scenario = scenarios.get(definition.key)
      if (!scenario) continue
      const nextSymbols = buildTierSymbols({
        definition,
        candidatePool,
        currentSymbols: scenario.symbols,
        seed: `${definition.key}:${refreshSeed}`,
        priorTiers: usedByTier,
      })
      usedByTier.push(nextSymbols)
      this.store.updatePortfolioScenario(scenario.id, {
        name: definition.name,
        symbols: nextSymbols,
        noveltyProfile: riskNovelty(definition),
        maxWeightPerAsset: definition.maxWeightPerAsset,
        refreshMode: 'quant',
        blendTrending: false,
        quantMethod: definition.method,
        quantTargetN: definition.n,
        quantReoptimizeMs: OPTIMIZED_PORTFOLIO_REFRESH_MS,
        quantUniversePolicy: 'keep',
        quantKeepCount: 0,
        source: 'optimized',
      })
      this.runner.enqueue({ n: definition.n, method: definition.method, scenarioId: scenario.id, universePolicy: 'keep' })
    }
  }

  async getSummary(forceRefresh = false): Promise<OptimizedPortfoliosResponse> {
    if (!forceRefresh && this.summaryCache && this.summaryCache.expiresAt > Date.now()) return this.summaryCache.response
    const scenarios = new Map(this.store.listPortfolioScenariosBySource('optimized').map((scenario) => [scenario.name, scenario]))
    const baseTiers = optimizedPortfolioDefinitions.flatMap((definition) => {
      const scenario = scenarios.get(definition.name)
      if (!scenario) return []
      const snapshot = this.store.getLatestPortfolioSnapshot(scenario.id)
      return [
        {
          key: definition.key,
          name: definition.name,
          riskLabel: definition.riskLabel,
          description: definition.description,
          scenario,
          snapshot,
          positions: snapshot ? this.store.getPortfolioPositions(snapshot.id) : [],
          comparison: snapshot ? this.store.getLatestPortfolioComparison(snapshot.id) : null,
        },
      ]
    })
    const winnerSymbols = await this.getWinnerSymbols()
    const history = await this.fetchMetricHistory(baseTiers)
    const benchmarkBars = history.get(this.benchmarkSymbol)
    const tiers: OptimizedPortfolioTier[] = baseTiers.map((tier) => ({
      ...tier,
      metrics: this.buildMetrics(tier.scenario, tier.positions, winnerSymbols, history, benchmarkBars),
    }))
    const charts = buildOptimizedPortfolioCharts(tiers, history, this.benchmarkSymbol)
    const response = {
      updatedAt: new Date().toISOString(),
      nextRunAt: getNextRunAt(tiers.map((tier) => tier.scenario)),
      benchmarkSymbol: this.benchmarkSymbol,
      tiers,
      charts,
    }
    this.summaryCache = { expiresAt: Date.now() + SUMMARY_CACHE_MS, response }
    return response
  }

  warmSummary() {
    return this.getSummary(true)
  }

  private buildMetrics(
    scenario: PortfolioScenario,
    positions: PortfolioPosition[],
    winnerSymbols: Set<string>,
    history: Map<string, DailyBar[]>,
    benchmarkBars: DailyBar[] | undefined,
  ) {
    const positionSymbols = new Set(positions.map((position) => position.symbol.toUpperCase()))
    const priorRows = this.store.getPortfolioSnapshotsAscending(scenario.id, 2)
    const priorSnapshot = priorRows.length >= 2 ? priorRows[0]?.snapshot : null
    const priorPositions = priorSnapshot ? this.store.getPortfolioPositions(priorSnapshot.id) : []
    const priorSymbols = new Set(priorPositions.map((position) => position.symbol.toUpperCase()))
    const riskMetrics = calculatePortfolioRiskMetrics(positions, benchmarkBars, history)
    return {
      ...riskMetrics,
      topFiveConcentration: positions.slice(0, 5).reduce((acc, position) => acc + position.weight, 0),
      effectiveHoldings: getEffectiveHoldings(positions),
      newPositions: [...positionSymbols].filter((symbol) => !priorSymbols.has(symbol)).length,
      droppedPositions: [...priorSymbols].filter((symbol) => !positionSymbols.has(symbol)).length,
      winnerDerivedPositions: [...positionSymbols].filter((symbol) => winnerSymbols.has(symbol)).length,
      backfilledPositions: [...positionSymbols].filter((symbol) => !winnerSymbols.has(symbol)).length,
    }
  }

  private async getWinnerSymbols() {
    const earliestIso = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS).toISOString()
    const snapshots = this.store.getPortfolioSnapshotsForComparison(earliestIso).map((snapshot) => ({
      ...snapshot,
      comparison: this.store.getLatestPortfolioComparison(snapshot.id),
    }))
    return new Set(scorePersistedWinnerSymbols(snapshots, Date.now()).map((candidate) => candidate.symbol))
  }

  private async fetchMetricHistory(tiers: Array<Omit<OptimizedPortfolioTier, 'metrics'>>) {
    const symbols = new Set<string>([this.benchmarkSymbol, 'QQQ'])
    tiers.forEach((tier) => tier.positions.forEach((position) => symbols.add(position.symbol.toUpperCase())))
    const now = Date.now()
    const entries = await mapWithConcurrency([...symbols], 12, async (symbol) => {
      const key = symbol.toUpperCase()
      const cached = this.historyCache.get(key)
      if (cached && cached.expiresAt > now) return [key, cached.bars] as const
      const bars = await fetchDailyAdjustedHistory(this.historyFetcher, key, 1)
      this.historyCache.set(key, { expiresAt: Date.now() + HISTORY_CACHE_MS, bars })
      return [key, bars] as const
    })
    return new Map(entries.filter((entry): entry is readonly [string, DailyBar[]] => Array.isArray(entry[1])))
  }

  private ensureOptimizedScenarios() {
    const byName = new Map(this.store.listPortfolioScenariosBySource('optimized').map((scenario) => [scenario.name, scenario]))
    const result = new Map<string, PortfolioScenario>()
    const dueNow = new Date().toISOString()

    for (const definition of optimizedPortfolioDefinitions) {
      const existing = byName.get(definition.name)
      if (existing) {
        result.set(definition.key, existing)
        continue
      }
      const id = this.store.insertPortfolioScenario({
        name: definition.name,
        symbols: SP500_SYMBOLS.slice(0, definition.n),
        noveltyProfile: riskNovelty(definition),
        maxWeightPerAsset: definition.maxWeightPerAsset,
        refreshMode: 'quant',
        blendTrending: false,
        quantMethod: definition.method,
        quantTargetN: definition.n,
        quantReoptimizeMs: OPTIMIZED_PORTFOLIO_REFRESH_MS,
        quantUniversePolicy: 'keep',
        quantKeepCount: 0,
        quantNextRunAt: dueNow,
        source: 'optimized',
      })
      const created = this.store.getPortfolioScenario(id)
      if (created) result.set(definition.key, created)
    }

    return result
  }

  private async buildCandidatePool() {
    const earliestIso = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS).toISOString()
    const snapshots = this.store.getPortfolioSnapshotsForComparison(earliestIso).map((snapshot) => ({
      ...snapshot,
      comparison: this.store.getLatestPortfolioComparison(snapshot.id),
    }))
    const symbols = [...new Set(snapshots.flatMap((snapshot) => snapshot.positions.map((position) => position.symbol.toUpperCase())))]
    const quotes = await this.fetchQuotes(symbols)
    const candidates = scoreWinnerCandidates(snapshots, quotes, Date.now())
    const ranked = candidates.map((candidate) => candidate.symbol)
    for (const symbol of SP500_SYMBOLS) {
      if (ranked.length >= MIN_POOL_SIZE) break
      if (!ranked.includes(symbol)) ranked.push(symbol)
    }
    return ranked
  }

  private async fetchQuotes(symbols: string[]) {
    if (symbols.length === 0) return new Map<string, number>()
    const tickers = await this.market.fetchLiveTickers(symbols)
    return new Map(
      tickers
        .map((ticker): [string, number] => [ticker.symbol.toUpperCase(), ticker.lastPrice ?? Number(ticker.value.replace(/[^0-9.-]/g, ''))])
        .filter((entry) => Number.isFinite(entry[1]) && entry[1] > 0),
    )
  }
}

export function scoreWinnerCandidates(snapshots: SnapshotWithPositions[], quotes: Map<string, number>, nowMs: number): WinnerCandidate[] {
  const scores = new Map<string, { score: number; frequency: number }>()
  for (const snapshot of snapshots) {
    const ageDays = Math.max(0, (nowMs - Date.parse(snapshot.createdAt)) / DAY_MS)
    const recency = Math.exp(-ageDays / 90)
    const comparison = latestComparison(snapshot)
    const excessBonus = Math.max(-0.25, Math.min(0.5, comparison?.excessReturn ?? 0))
    for (const position of snapshot.positions) {
      const current = quotes.get(position.symbol.toUpperCase())
      if (!current || position.entryPrice <= 0) continue
      const realizedReturn = (current - position.entryPrice) / position.entryPrice
      const contribution = position.weight * realizedReturn
      const positiveReturn = Math.max(0, realizedReturn)
      const positiveContribution = Math.max(0, contribution)
      const weightedScore = (positiveReturn * 0.45 + positiveContribution * 2.5 + Math.max(0, excessBonus) * 0.25) * recency
      const existing = scores.get(position.symbol.toUpperCase()) ?? { score: 0, frequency: 0 }
      existing.score += weightedScore
      existing.frequency += 1
      scores.set(position.symbol.toUpperCase(), existing)
    }
  }
  return [...scores.entries()]
    .map(([symbol, entry]) => ({ symbol, score: entry.score + Math.log1p(entry.frequency) * 0.015 }))
    .sort((left, right) => right.score - left.score || left.symbol.localeCompare(right.symbol))
}

function scorePersistedWinnerSymbols(snapshots: SnapshotWithPositions[], nowMs: number): WinnerCandidate[] {
  const scores = new Map<string, { score: number; frequency: number }>()
  for (const snapshot of snapshots) {
    const ageDays = Math.max(0, (nowMs - Date.parse(snapshot.createdAt)) / DAY_MS)
    const recency = Math.exp(-ageDays / 90)
    const comparison = latestComparison(snapshot)
    const excess = Math.max(0, comparison?.excessReturn ?? 0)
    const expected = Math.max(0, snapshot.expectedReturn)
    for (const position of snapshot.positions) {
      if (position.weight <= 0) continue
      const implied = Math.max(0, position.impliedReturn)
      const symbol = position.symbol.toUpperCase()
      const existing = scores.get(symbol) ?? { score: 0, frequency: 0 }
      existing.score += (position.weight * 0.6 + implied * 0.25 + expected * 0.1 + excess * 0.25) * recency
      existing.frequency += 1
      scores.set(symbol, existing)
    }
  }
  return [...scores.entries()]
    .map(([symbol, entry]) => ({ symbol, score: entry.score + Math.log1p(entry.frequency) * 0.01 }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.symbol.localeCompare(right.symbol))
}

export function buildTierSymbols(input: {
  definition: Pick<OptimizedPortfolioDefinition, 'n' | 'keepRatio' | 'key'>
  candidatePool: string[]
  currentSymbols: string[]
  seed: string
  priorTiers: string[][]
}) {
  const rng = mulberry32(hashSeed(input.seed))
  const n = input.definition.n
  const keepCount = Math.min(n, Math.floor(n * input.definition.keepRatio), input.currentSymbols.length)
  const currentSet = new Set(input.currentSymbols.map((symbol) => symbol.toUpperCase()))
  const kept = shuffle(
    input.currentSymbols.filter((symbol) => input.candidatePool.includes(symbol.toUpperCase())),
    rng,
  )
    .slice(0, keepCount)
    .map((symbol) => symbol.toUpperCase())
  const picked = new Set(kept)
  const priorUse = new Map<string, number>()
  input.priorTiers.flat().forEach((symbol) => priorUse.set(symbol, (priorUse.get(symbol) ?? 0) + 1))
  const tierOffset = Math.floor(rng() * Math.max(1, Math.floor(input.candidatePool.length / 4)))
  const ranked = input.candidatePool
    .map((symbol, index) => ({ symbol: symbol.toUpperCase(), rank: index }))
    .filter((entry) => !picked.has(entry.symbol))
    .sort((left, right) => {
      const leftPenalty = (priorUse.get(left.symbol) ?? 0) * Math.max(4, n / 2) + (currentSet.has(left.symbol) ? 0 : rng())
      const rightPenalty = (priorUse.get(right.symbol) ?? 0) * Math.max(4, n / 2) + (currentSet.has(right.symbol) ? 0 : rng())
      return (
        ((left.rank + tierOffset) % input.candidatePool.length) +
        leftPenalty -
        (((right.rank + tierOffset) % input.candidatePool.length) + rightPenalty)
      )
    })
  for (const entry of ranked) {
    if (picked.size >= n) break
    picked.add(entry.symbol)
  }
  return [...picked].slice(0, n)
}

function latestComparison(snapshot: SnapshotWithPositions): PortfolioComparison | null {
  return snapshot.comparison ?? null
}

export function calculatePortfolioRiskMetrics(
  positions: PortfolioPosition[],
  benchmarkBars: DailyBar[] | undefined,
  history: Map<string, DailyBar[]>,
) {
  const returns = buildPortfolioAndBenchmarkReturns(positions, benchmarkBars, history)
  if (returns.portfolio.length < 20 || returns.benchmark.length !== returns.portfolio.length) {
    return { sharpeRatio: null, annualizedVolatility: null, maxDrawdown: null, betaVsBenchmark: null, correlationVsBenchmark: null }
  }
  const portfolioMean = mean(returns.portfolio)
  const benchmarkMean = mean(returns.benchmark)
  const portfolioVariance = variance(returns.portfolio, portfolioMean)
  const benchmarkVariance = variance(returns.benchmark, benchmarkMean)
  const portfolioVolDaily = Math.sqrt(portfolioVariance)
  const annualizedVolatility = portfolioVolDaily * Math.sqrt(252)
  const sharpeRatio = annualizedVolatility > 0 ? (portfolioMean * 252 - 0.02) / annualizedVolatility : null
  const cov = covariance(returns.portfolio, returns.benchmark, portfolioMean, benchmarkMean)
  const betaVsBenchmark = benchmarkVariance > 0 ? cov / benchmarkVariance : null
  const corrDenom = Math.sqrt(portfolioVariance * benchmarkVariance)
  const correlationVsBenchmark = corrDenom > 0 ? cov / corrDenom : null
  return {
    sharpeRatio,
    annualizedVolatility,
    maxDrawdown: maxDrawdown(returns.portfolio),
    betaVsBenchmark,
    correlationVsBenchmark,
  }
}

export function buildOptimizedPortfolioCharts(tiers: OptimizedPortfolioTier[], history: Map<string, DailyBar[]>, benchmarkSymbol = 'SPY') {
  const returnSeries = new Map<string, Array<{ date: string; value: number }>>()
  for (const tier of tiers) {
    returnSeries.set(tier.name, buildPortfolioReturnSeries(tier.positions, history))
  }
  const benchmarkReturns = buildAssetReturnSeries(history.get(benchmarkSymbol))
  const qqqReturns = buildAssetReturnSeries(history.get('QQQ'))
  returnSeries.set(benchmarkSymbol, benchmarkReturns)

  return {
    growth: [
      ...tiers.map((tier) => ({
        id: String(tier.scenario.id),
        name: tier.name,
        values: returnsToGrowth(returnSeries.get(tier.name) ?? [], 10_000),
      })),
      { id: benchmarkSymbol, name: benchmarkSymbol, values: returnsToGrowth(benchmarkReturns, 10_000) },
    ].filter((series) => series.values.length > 0),
    drawdown: tiers
      .map((tier) => ({ id: String(tier.scenario.id), name: tier.name, values: returnsToDrawdown(returnSeries.get(tier.name) ?? []) }))
      .filter((series) => series.values.length > 0),
    riskReturn: tiers.map((tier) => ({
      scenarioId: tier.scenario.id,
      name: tier.name,
      riskLabel: tier.riskLabel,
      annualizedReturn: annualizedReturn(returnSeries.get(tier.name) ?? []),
      annualizedVolatility: tier.metrics.annualizedVolatility,
      effectiveHoldings: tier.metrics.effectiveHoldings,
    })),
    correlationHeatmap: buildCorrelationHeatmap(tiers, returnSeries, benchmarkReturns, qqqReturns, benchmarkSymbol),
  }
}

function buildCorrelationHeatmap(
  tiers: OptimizedPortfolioTier[],
  returns: Map<string, Array<{ date: string; value: number }>>,
  benchmarkReturns: Array<{ date: string; value: number }>,
  qqqReturns: Array<{ date: string; value: number }>,
  benchmarkSymbol: string,
) {
  const rows = tiers.map((tier) => tier.name)
  const columns = [benchmarkSymbol, 'QQQ', ...rows]
  const source = new Map(returns)
  source.set(benchmarkSymbol, benchmarkReturns)
  source.set('QQQ', qqqReturns)
  const cells = rows.flatMap((row) =>
    columns.map((column) => ({
      row,
      column,
      correlation: correlationForDatedReturns(source.get(row) ?? [], source.get(column) ?? []),
    })),
  )
  return { rows, columns, cells }
}

function buildPortfolioReturnSeries(positions: PortfolioPosition[], history: Map<string, DailyBar[]>) {
  if (positions.length === 0) return []
  const dateSet: Set<string> | null = positions.reduce<Set<string> | null>((acc, position) => {
    const bars = history.get(position.symbol.toUpperCase())
    if (!bars?.length) return acc
    const dates = new Set(bars.map((bar) => dayKey(bar.dateMs)))
    if (acc === null) return dates
    return new Set([...acc].filter((date) => dates.has(date)))
  }, null)
  const dates = [...(dateSet ?? new Set<string>())].sort().slice(-91)
  if (dates.length < 2) return []
  const priceBySymbol = new Map(
    positions.map((position) => [
      position.symbol.toUpperCase(),
      new Map((history.get(position.symbol.toUpperCase()) ?? []).map((bar) => [dayKey(bar.dateMs), bar.adjClose])),
    ]),
  )
  const out: Array<{ date: string; value: number }> = []
  for (let index = 1; index < dates.length; index += 1) {
    const previousDate = dates[index - 1]!
    const currentDate = dates[index]!
    let weighted = 0
    let covered = 0
    for (const position of positions) {
      const prices = priceBySymbol.get(position.symbol.toUpperCase())
      const previous = prices?.get(previousDate)
      const current = prices?.get(currentDate)
      if (!previous || !current) continue
      weighted += position.weight * (current / previous - 1)
      covered += position.weight
    }
    if (covered > 0) out.push({ date: currentDate, value: weighted / covered })
  }
  return out
}

function buildAssetReturnSeries(bars: DailyBar[] | undefined) {
  const recent = (bars ?? []).slice(-91)
  const out: Array<{ date: string; value: number }> = []
  for (let index = 1; index < recent.length; index += 1) {
    const previous = recent[index - 1]!
    const current = recent[index]!
    out.push({ date: dayKey(current.dateMs), value: current.adjClose / previous.adjClose - 1 })
  }
  return out
}

function returnsToGrowth(returns: Array<{ date: string; value: number }>, initialValue: number) {
  if (returns.length === 0) return []
  let value = initialValue
  const out = [{ date: returns[0]!.date, value }]
  for (const entry of returns.slice(1)) {
    value *= 1 + entry.value
    out.push({ date: entry.date, value })
  }
  return out
}

function returnsToDrawdown(returns: Array<{ date: string; value: number }>) {
  if (returns.length === 0) return []
  let growth = 1
  let peak = 1
  const out = [{ date: returns[0]!.date, value: 0 }]
  for (const entry of returns.slice(1)) {
    growth *= 1 + entry.value
    peak = Math.max(peak, growth)
    out.push({ date: entry.date, value: growth / peak - 1 })
  }
  return out
}

function annualizedReturn(returns: Array<{ value: number }>) {
  if (returns.length === 0) return null
  const growth = returns.reduce((acc, entry) => acc * (1 + entry.value), 1)
  return growth ** (252 / returns.length) - 1
}

function correlationForDatedReturns(left: Array<{ date: string; value: number }>, right: Array<{ date: string; value: number }>) {
  const rightByDate = new Map(right.map((entry) => [entry.date, entry.value]))
  const pairs = left
    .map((entry) => [entry.value, rightByDate.get(entry.date)] as const)
    .filter((entry): entry is readonly [number, number] => typeof entry[1] === 'number')
  if (pairs.length < 10) return null
  const leftValues = pairs.map((pair) => pair[0])
  const rightValues = pairs.map((pair) => pair[1])
  const leftMean = mean(leftValues)
  const rightMean = mean(rightValues)
  const denom = Math.sqrt(variance(leftValues, leftMean) * variance(rightValues, rightMean))
  return denom > 0 ? covariance(leftValues, rightValues, leftMean, rightMean) / denom : null
}

function buildPortfolioAndBenchmarkReturns(
  positions: PortfolioPosition[],
  benchmarkBars: DailyBar[] | undefined,
  history: Map<string, DailyBar[]>,
) {
  if (!benchmarkBars?.length || positions.length === 0) return { portfolio: [], benchmark: [] }
  const benchmarkByDay = new Map(benchmarkBars.map((bar) => [dayKey(bar.dateMs), bar.adjClose]))
  const dates = [...benchmarkByDay.keys()].sort().slice(-91)
  const pricesBySymbol = new Map(
    positions.map((position) => [
      position.symbol.toUpperCase(),
      new Map((history.get(position.symbol.toUpperCase()) ?? []).map((bar) => [dayKey(bar.dateMs), bar.adjClose])),
    ]),
  )
  const portfolio: number[] = []
  const benchmark: number[] = []

  for (let index = 1; index < dates.length; index += 1) {
    const previousDate = dates[index - 1]!
    const currentDate = dates[index]!
    const previousBenchmark = benchmarkByDay.get(previousDate)
    const currentBenchmark = benchmarkByDay.get(currentDate)
    if (!previousBenchmark || !currentBenchmark) continue
    let weightedReturn = 0
    let coveredWeight = 0
    for (const position of positions) {
      const byDay = pricesBySymbol.get(position.symbol.toUpperCase())
      if (!byDay) continue
      const previous = byDay.get(previousDate)
      const current = byDay.get(currentDate)
      if (!previous || !current) continue
      weightedReturn += position.weight * (current / previous - 1)
      coveredWeight += position.weight
    }
    if (coveredWeight <= 0) continue
    portfolio.push(weightedReturn / coveredWeight)
    benchmark.push(currentBenchmark / previousBenchmark - 1)
  }
  return { portfolio, benchmark }
}

function getEffectiveHoldings(positions: PortfolioPosition[]) {
  const squaredWeightSum = positions.reduce((acc, position) => acc + position.weight * position.weight, 0)
  return squaredWeightSum > 0 ? 1 / squaredWeightSum : 0
}

function mean(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0) / values.length
}

function variance(values: number[], valueMean: number) {
  if (values.length < 2) return 0
  return values.reduce((acc, value) => acc + (value - valueMean) ** 2, 0) / (values.length - 1)
}

function covariance(left: number[], right: number[], leftMean: number, rightMean: number) {
  if (left.length < 2 || right.length !== left.length) return 0
  return left.reduce((acc, value, index) => acc + (value - leftMean) * (right[index]! - rightMean), 0) / (left.length - 1)
}

function maxDrawdown(dailyReturns: number[]) {
  let growth = 1
  let peak = 1
  let drawdown = 0
  for (const dailyReturn of dailyReturns) {
    growth *= 1 + dailyReturn
    peak = Math.max(peak, growth)
    drawdown = Math.min(drawdown, growth / peak - 1)
  }
  return drawdown
}

function dayKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

function riskNovelty(definition: OptimizedPortfolioDefinition) {
  if (definition.keepRatio >= 0.65) return 'low'
  if (definition.keepRatio >= 0.35) return 'medium'
  return 'high'
}

function getNextRunAt(scenarios: PortfolioScenario[]) {
  const nextTimes = scenarios
    .map((scenario) => scenario.quantNextRunAt)
    .filter((value): value is string => Boolean(value))
    .sort()
  return nextTimes[0] ?? null
}

function hashSeed(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], rng: () => number) {
  const out = [...items]
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[out[index], out[swapIndex]] = [out[swapIndex]!, out[index]!]
  }
  return out
}
