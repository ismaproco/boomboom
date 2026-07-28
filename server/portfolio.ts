import {
  buildCalibrationPairs,
  computeLexiconTilt,
  computeNewsAlignment,
  PORTFOLIO_SIGNAL_PRODUCT,
  summarizeCalibrationCorrelation,
} from './portfolioSignals'
import type {
  LiveNewsGateway,
  NoveltyProfile,
  PopularItem,
  PopularRepository,
  PortfolioHistoryResponse,
  PortfolioPosition,
  PortfolioRepository,
  PortfolioResponse,
  PortfolioScenario,
  PortfolioSignalCalibrationResponse,
} from './types'

type PortfolioServiceConfig = {
  refreshMs: number
  benchmarkSymbol: string
  diversityWeight: number
}

type PortfolioStore = PortfolioRepository & PopularRepository

type PositionDraft = {
  symbol: string
  weight: number
  viewScore: number
  impliedReturn: number
  entryPrice: number
}

const noveltyTargets: Record<NoveltyProfile, { minDiff: number; maxDiff: number; riskPenalty: number }> = {
  low: { minDiff: 0.1, maxDiff: 0.2, riskPenalty: 0.65 },
  medium: { minDiff: 0.2, maxDiff: 0.35, riskPenalty: 0.55 },
  high: { minDiff: 0.35, maxDiff: 0.5, riskPenalty: 0.45 },
}

export class AutoPortfolioService {
  constructor(
    private readonly store: PortfolioStore,
    private readonly market: LiveNewsGateway,
    private readonly config: PortfolioServiceConfig,
  ) {}

  getLatest(scenarioId: number): PortfolioResponse {
    const snapshot = this.store.getLatestPortfolioSnapshot(scenarioId)
    if (!snapshot) return { updatedAt: new Date().toISOString(), snapshot: null, positions: [], comparison: null }
    return {
      updatedAt: new Date().toISOString(),
      snapshot,
      positions: this.store.getPortfolioPositions(snapshot.id),
      comparison: this.store.getLatestPortfolioComparison(snapshot.id),
    }
  }

  listScenarios() {
    return this.store.listPortfolioScenarios()
  }

  getHistory(page: number, pageSize: number, scenarioId: number): PortfolioHistoryResponse {
    return this.store.getPortfolioHistory({ page, pageSize, scenarioId })
  }

  /**
   * Pairs prior-snapshot narrative / model-tilt features with realized excess over the next refresh interval.
   * For exploratory diagnostics only; not a performance guarantee.
   */
  getSignalCalibration(scenarioId: number, limit: number): PortfolioSignalCalibrationResponse {
    const cap = Math.min(500, Math.max(10, Math.floor(limit)))
    const rows = this.store.getPortfolioSnapshotsAscending(scenarioId, cap)
    const snapshotsAsc = rows.map((r) => ({
      id: r.snapshot.id,
      createdAt: r.snapshot.createdAt,
      expectedReturn: r.snapshot.expectedReturn,
      regimeShift: r.snapshot.regimeShift,
      newsAlignment: r.snapshot.newsAlignment,
      lexiconTilt: r.snapshot.lexiconTilt,
      comparison: r.comparison ? { comparedSnapshotId: r.comparison.comparedSnapshotId, excessReturn: r.comparison.excessReturn } : null,
    }))
    const pairs = buildCalibrationPairs(snapshotsAsc)
    const summary = summarizeCalibrationCorrelation(pairs)
    return {
      updatedAt: new Date().toISOString(),
      scenarioId,
      productFraming: PORTFOLIO_SIGNAL_PRODUCT.framing,
      realizedHorizonNote: PORTFOLIO_SIGNAL_PRODUCT.realizedHorizonNote,
      assumptions: [
        'Correlation uses prior snapshot model tilt versus realized excess over the following portfolio refresh interval only.',
        'News-mode tilt is a small heuristic; quant snapshots store annualized optimizer return — do not compare magnitudes across modes.',
        'Sample correlation is unstable on short histories and does not imply predictive power.',
      ],
      pairs,
      summary,
    }
  }

  resolveDefaultScenarioId(): number | null {
    const scenarios = this.store.listPortfolioScenarios()
    const fallback = scenarios.find((entry) => entry.isDefault)?.id ?? scenarios[0]?.id
    return fallback ?? null
  }

  async ensureSnapshot() {
    const scenarioSymbols = this.store.listPortfolioScenarios().flatMap((row) => row.symbols)
    const quoteExtras = [...new Set([...scenarioSymbols, this.config.benchmarkSymbol].map((symbol) => symbol.toUpperCase()))]
    const tickers = await this.market.fetchLiveTickers(quoteExtras)
    const quoteEntries: Array<[string, number]> = tickers
      .map((ticker): [string, number] => [ticker.symbol.toUpperCase(), ticker.lastPrice ?? parsePrice(ticker.value)])
      .filter((entry) => Number.isFinite(entry[1]) && entry[1] > 0)
    const quoteMap = new Map<string, number>(quoteEntries)
    const benchmarkValue = quoteMap.get(this.config.benchmarkSymbol) ?? 0
    if (!Number.isFinite(benchmarkValue) || benchmarkValue <= 0) return

    const popularSnapshot = this.store.getLatestSnapshot()
    const popularItems = popularSnapshot ? this.store.getItems(popularSnapshot.id) : []

    const scenarios = this.store.listPortfolioScenarios()
    for (const scenario of scenarios) {
      this.ensureScenarioSnapshot(scenario, quoteMap, benchmarkValue, popularSnapshot?.id ?? null, popularItems)
    }
  }

  private ensureScenarioSnapshot(
    scenario: PortfolioScenario,
    quoteMap: Map<string, number>,
    benchmarkValue: number,
    sourceSnapshotId: number | null,
    popularItems: PopularItem[],
  ) {
    if (scenario.refreshMode === 'quant') return

    const latest = this.store.getLatestPortfolioSnapshot(scenario.id)
    const latestMs = latest ? new Date(latest.createdAt).getTime() : 0
    if (latest && Number.isFinite(latestMs) && Date.now() - latestMs < this.config.refreshMs) return

    const previousPositions = latest ? this.store.getPortfolioPositions(latest.id) : []
    const built = this.buildPositions(popularItems, quoteMap, previousPositions, scenario)
    const { positions, regimeShift, newsAlignment, lexiconTilt } = built
    if (positions.length === 0) return

    const expectedReturn = positions.reduce((acc, position) => acc + position.weight * position.impliedReturn, 0)
    const overlapRatio = this.getOverlapRatio(previousPositions, positions)
    const turnoverRatio = this.getTurnoverRatio(previousPositions, positions)
    const comparison = latest ? this.createComparison(latest.id, previousPositions, latest.benchmarkValue, quoteMap) : null

    this.store.savePortfolioSnapshot({
      scenarioId: scenario.id,
      createdAt: new Date().toISOString(),
      benchmarkSymbol: this.config.benchmarkSymbol,
      benchmarkValue,
      expectedReturn,
      sourceSnapshotId,
      viewCount: positions.filter((position) => position.viewScore > 0).length,
      noveltyProfile: scenario.noveltyProfile,
      overlapRatio,
      turnoverRatio,
      regimeShift,
      newsAlignment,
      lexiconTilt,
      positions,
      comparison,
    })
  }

  private createComparison(
    comparedSnapshotId: number,
    previousPositions: PortfolioPosition[],
    previousBenchmark: number,
    quotes: Map<string, number>,
  ) {
    if (previousPositions.length === 0 || previousBenchmark <= 0) return null
    const currentBenchmark = quotes.get(this.config.benchmarkSymbol)
    if (!currentBenchmark || currentBenchmark <= 0) return null

    const portfolioReturn = previousPositions.reduce((acc, position) => {
      const currentPrice = quotes.get(position.symbol)
      if (!currentPrice || position.entryPrice <= 0) return acc
      return acc + position.weight * ((currentPrice - position.entryPrice) / position.entryPrice)
    }, 0)
    const benchmarkReturn = (currentBenchmark - previousBenchmark) / previousBenchmark

    return {
      comparedSnapshotId,
      benchmarkSymbol: this.config.benchmarkSymbol,
      portfolioReturn,
      benchmarkReturn,
      excessReturn: portfolioReturn - benchmarkReturn,
      maxDrawdownProxy: Math.min(0, portfolioReturn),
      measuredAt: new Date().toISOString(),
    }
  }

  private buildPositions(
    popularItems: PopularItem[],
    quotes: Map<string, number>,
    previousPositions: PortfolioPosition[],
    scenario: PortfolioScenario,
  ): { positions: PositionDraft[]; regimeShift: number; newsAlignment: number; lexiconTilt: number } {
    const universe = new Set(scenario.symbols.map((symbol) => symbol.toUpperCase()))
    if (scenario.blendTrending) {
      this.extractPopularSymbols(popularItems).forEach((symbol) => universe.add(symbol))
    }
    const symbols = [...universe].filter((symbol) => quotes.has(symbol))
    if (symbols.length === 0) return { positions: [], regimeShift: 1, newsAlignment: 0, lexiconTilt: 0 }

    const viewScores = new Map<string, number>()
    symbols.forEach((symbol) => viewScores.set(symbol, 0))
    popularItems.forEach((item) => {
      const strength = item.score * Math.log2(item.sourceCount + 1)
      this.extractPopularSymbols([item]).forEach((symbol) => {
        if (viewScores.has(symbol)) viewScores.set(symbol, (viewScores.get(symbol) ?? 0) + strength)
      })
    })

    const regimeShift = this.getRegimeShift(popularItems)
    const previousMap = new Map(previousPositions.map((position) => [position.symbol, position.weight]))
    const implied = symbols.map((symbol) => {
      const marketPrior = 0.0006
      const normalizedView = Math.min(1, (viewScores.get(symbol) ?? 0) / 200) * regimeShift
      const priorWeight = previousMap.get(symbol) ?? 0
      const noveltyBonus = priorWeight === 0 ? 0.00045 : -priorWeight * 0.0002
      return {
        symbol,
        viewScore: normalizedView,
        impliedReturn: marketPrior + normalizedView * 0.0032 + noveltyBonus,
      }
    })

    const uncappedWeights = softmax(implied.map((entry) => entry.impliedReturn))
    const noveltyAdjusted = this.applyNoveltyTarget(uncappedWeights, symbols, previousMap, scenario.noveltyProfile)
    const capped = capAndNormalize(noveltyAdjusted, scenario.maxWeightPerAsset)
    const positions = implied
      .map((entry, index) => ({
        symbol: entry.symbol,
        weight: capped[index]!,
        viewScore: entry.viewScore,
        impliedReturn: entry.impliedReturn,
        entryPrice: quotes.get(entry.symbol) ?? 0,
      }))
      .sort((left, right) => right.weight - left.weight)
    const newsAlignment = computeNewsAlignment(positions)
    const lexiconTilt = computeLexiconTilt(popularItems, new Set(positions.map((p) => p.symbol)))
    return { positions, regimeShift, newsAlignment, lexiconTilt }
  }

  private extractPopularSymbols(items: PopularItem[]) {
    const symbols = new Set<string>()
    const symbolPattern = /\b[A-Z]{1,5}\b/g
    const parse = (value: string) => value.toUpperCase().match(symbolPattern) ?? []

    items.forEach((item) => {
      parse(`${item.headline} ${item.summary}`).forEach((symbol) => symbols.add(symbol))
      item.keywords
        .map((keyword) => keyword.toUpperCase())
        .filter((keyword) => /^[A-Z]{1,5}$/.test(keyword))
        .forEach((symbol) => symbols.add(symbol))
    })

    return [...symbols]
  }

  private getRegimeShift(items: PopularItem[]) {
    if (items.length === 0) return 1
    const recencyBoost = items.slice(0, 15).reduce((acc, item, index) => acc + (1 / (index + 1)) * item.score, 0) / 120
    return Math.max(0.75, Math.min(1.25, 1 + recencyBoost))
  }

  private applyNoveltyTarget(weights: number[], symbols: string[], previousMap: Map<string, number>, noveltyProfile: NoveltyProfile) {
    const target = noveltyTargets[noveltyProfile]
    const current = [...weights]
    const totalPrevious = [...previousMap.values()].reduce((acc, value) => acc + value, 0) || 1
    const overlap = symbols.reduce(
      (acc, symbol, index) => acc + Math.min(current[index] ?? 0, (previousMap.get(symbol) ?? 0) / totalPrevious),
      0,
    )
    const targetOverlap = 1 - (target.minDiff + target.maxDiff) / 2
    const noveltyPressure = (targetOverlap - overlap) * this.config.diversityWeight

    if (Math.abs(noveltyPressure) < 0.0001) return current

    const adjusted = current.map((weight, index) => {
      const prevWeight = (previousMap.get(symbols[index] ?? '') ?? 0) / totalPrevious
      const noveltyTerm = prevWeight > 0 ? -prevWeight * target.riskPenalty : target.riskPenalty / symbols.length
      return Math.max(0, weight + noveltyPressure * noveltyTerm)
    })
    const sum = adjusted.reduce((acc, value) => acc + value, 0)
    return sum > 0 ? adjusted.map((value) => value / sum) : current
  }

  private getOverlapRatio(previous: PortfolioPosition[], next: PositionDraft[]) {
    if (previous.length === 0) return 0
    const previousMap = new Map(previous.map((position) => [position.symbol, position.weight]))
    return next.reduce((acc, position) => acc + Math.min(position.weight, previousMap.get(position.symbol) ?? 0), 0)
  }

  private getTurnoverRatio(previous: PortfolioPosition[], next: PositionDraft[]) {
    if (previous.length === 0) return 1
    const previousMap = new Map(previous.map((position) => [position.symbol, position.weight]))
    const symbols = new Set([...previous.map((position) => position.symbol), ...next.map((position) => position.symbol)])
    const grossDiff = [...symbols].reduce((acc, symbol) => {
      const previousWeight = previousMap.get(symbol) ?? 0
      const nextWeight = next.find((position) => position.symbol === symbol)?.weight ?? 0
      return acc + Math.abs(nextWeight - previousWeight)
    }, 0)
    return Math.min(1, grossDiff / 2)
  }
}

const parsePrice = (value: string) => Number(value.replace(/[^0-9.-]/g, ''))

const softmax = (values: number[]) => {
  const maxValue = Math.max(...values)
  const exps = values.map((value) => Math.exp(value - maxValue))
  const total = exps.reduce((acc, value) => acc + value, 0)
  return total > 0 ? exps.map((value) => value / total) : values.map(() => 0)
}

const capAndNormalize = (weights: number[], cap: number) => {
  const next = [...weights]
  let excess = 0

  next.forEach((weight, index) => {
    if (weight > cap) {
      excess += weight - cap
      next[index] = cap
    }
  })

  if (excess > 0) {
    const eligible = next.map((weight, index) => ({ weight, index })).filter((entry) => entry.weight < cap)
    const eligibleTotal = eligible.reduce((acc, entry) => acc + entry.weight, 0)
    if (eligibleTotal > 0) {
      eligible.forEach((entry) => {
        next[entry.index] = Math.min(cap, entry.weight + (entry.weight / eligibleTotal) * excess)
      })
    }
  }

  const total = next.reduce((acc, weight) => acc + weight, 0)
  return total > 0 ? next.map((weight) => weight / total) : next.map(() => 0)
}
