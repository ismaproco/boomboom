import type { Fetcher } from './feeds'
import type {
  PortfolioComparisonHorizonResult,
  PortfolioComparisonResponse,
  PortfolioPosition,
  PortfolioRepository,
  PortfolioScenario,
  PortfolioScenarioSource,
  PortfolioSnapshot,
} from './types'
import { fetchDailyAdjustedHistory, mapWithConcurrency, type DailyBar } from './yahooHistory'

type SnapshotWithPositions = PortfolioSnapshot & { positions: PortfolioPosition[] }
type PriceHistoryBySymbol = Map<string, Map<string, number>>

type PortfolioComparisonConfig = {
  benchmarkSymbol: string
  cacheMs: number
  fetchConcurrency: number
}

const DEFAULT_HORIZONS = [30, 90, 365]
const DAY_MS = 86_400_000

export class PortfolioScenarioComparisonService {
  private cache = new Map<string, { expiresAt: number; response: PortfolioComparisonResponse }>()
  private historyCache = new Map<string, { expiresAt: number; bars: DailyBar[] | null }>()

  constructor(
    private readonly store: PortfolioRepository,
    private readonly fetcher: Fetcher,
    private readonly config: PortfolioComparisonConfig,
  ) {}

  async getComparison(
    horizons = DEFAULT_HORIZONS,
    source?: PortfolioScenarioSource,
    forceRefresh = false,
  ): Promise<PortfolioComparisonResponse> {
    const days = normalizeHorizons(horizons)
    const key = `${days.join(',')}:${source ?? 'all'}`
    const cached = this.cache.get(key)
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.response

    const scenarios = source ? this.store.listPortfolioScenariosBySource(source) : this.store.listPortfolioScenarios()
    const scenarioIds = new Set(scenarios.map((scenario) => scenario.id))
    const asOfMs = Date.now()
    const earliestIso = new Date(asOfMs - Math.max(...days) * DAY_MS).toISOString()
    const snapshots = this.store
      .getPortfolioSnapshotsForComparison(earliestIso)
      .filter((snapshot) => scenarioIds.has(snapshot.scenarioId))
      .map((snapshot) => ({ ...snapshot, positions: snapshot.positions.filter((position) => position.weight > 0) }))
    const snapshotsByScenario = groupSnapshotsByScenario(snapshots)
    const symbols = collectSymbols(snapshots, this.config.benchmarkSymbol)
    const history = await this.fetchHistory(symbols)
    const priceHistory = buildPriceHistory(history)
    const benchmarkBars = history.get(this.config.benchmarkSymbol)
    const asOf = new Date(asOfMs).toISOString()

    const response: PortfolioComparisonResponse = {
      updatedAt: new Date().toISOString(),
      asOf,
      benchmarkSymbol: this.config.benchmarkSymbol,
      assumptions: [
        'Daily adjusted closes are used; no intraday marks are attempted.',
        'Snapshot weights are treated as the portfolio held from that snapshot until the next scenario snapshot.',
        'If the first scenario snapshot is newer than a requested lookback, the row is labeled partial and starts at that first snapshot.',
      ],
      scenarios: scenarios.map((scenario) =>
        this.compareScenario(scenario, snapshotsByScenario.get(scenario.id) ?? [], days, benchmarkBars, priceHistory, asOfMs),
      ),
    }

    this.cache.set(key, { expiresAt: Date.now() + this.config.cacheMs, response })
    return response
  }

  warmComparison(horizons = DEFAULT_HORIZONS, source?: PortfolioScenarioSource) {
    return this.getComparison(horizons, source, true)
  }

  private async fetchHistory(symbols: string[]) {
    const now = Date.now()
    const entries = await mapWithConcurrency(symbols, this.config.fetchConcurrency, async (symbol) => {
      const key = symbol.toUpperCase()
      const cached = this.historyCache.get(key)
      if (cached && cached.expiresAt > now) return [key, cached.bars] as const
      const bars = await fetchDailyAdjustedHistory(this.fetcher, key, 2)
      this.historyCache.set(key, { expiresAt: Date.now() + this.config.cacheMs, bars })
      return [symbol, bars] as const
    })
    return new Map(entries.filter((entry): entry is readonly [string, DailyBar[]] => Array.isArray(entry[1])))
  }

  private compareScenario(
    scenario: PortfolioScenario,
    snapshots: SnapshotWithPositions[],
    horizons: number[],
    benchmarkBars: DailyBar[] | undefined,
    priceHistory: PriceHistoryBySymbol,
    asOfMs: number,
  ) {
    const latestSnapshotAt = snapshots.at(-1)?.createdAt ?? null
    const benchmarkSymbol = snapshots.at(-1)?.benchmarkSymbol ?? this.config.benchmarkSymbol
    return {
      scenarioId: scenario.id,
      name: scenario.name,
      refreshMode: scenario.refreshMode,
      benchmarkSymbol,
      latestSnapshotAt,
      horizons: horizons.map((days) => this.compareHorizon(days, snapshots, benchmarkBars, priceHistory, asOfMs)),
      chartSeries: this.buildScenarioSeries(Math.max(...horizons), snapshots, benchmarkBars, priceHistory, asOfMs),
    }
  }

  private buildScenarioSeries(
    lookbackDays: number,
    snapshots: SnapshotWithPositions[],
    benchmarkBars: DailyBar[] | undefined,
    priceHistory: PriceHistoryBySymbol,
    asOfMs: number,
  ) {
    if (snapshots.length === 0 || !benchmarkBars?.length) return []
    const requestedStartMs = asOfMs - lookbackDays * DAY_MS
    const firstSnapshotMs = Date.parse(snapshots[0]!.createdAt)
    const effectiveStartMs = Math.max(requestedStartMs, firstSnapshotMs)
    const marks = benchmarkBars.filter((bar) => bar.dateMs >= effectiveStartMs && bar.dateMs <= asOfMs)
    if (marks.length < 2) return []

    let growth = 1
    const benchmarkBase = marks[0]!.adjClose
    const snapshotTimes = snapshots.map((snapshot) => Date.parse(snapshot.createdAt))
    const series = [{ date: toDateKey(marks[0]!.dateMs), portfolioReturn: 0, benchmarkReturn: 0, excessReturn: 0 }]

    for (let i = 1; i < marks.length; i++) {
      const previousMark = marks[i - 1]!
      const currentMark = marks[i]!
      const snapshot = latestSnapshotForDate(snapshots, snapshotTimes, previousMark.dateMs)
      const dailyReturn = snapshot ? portfolioDailyReturn(snapshot.positions, previousMark.dateMs, currentMark.dateMs, priceHistory) : 0
      growth *= 1 + dailyReturn
      const portfolioReturn = growth - 1
      const benchmarkReturn = benchmarkBase > 0 ? currentMark.adjClose / benchmarkBase - 1 : 0
      series.push({
        date: toDateKey(currentMark.dateMs),
        portfolioReturn,
        benchmarkReturn,
        excessReturn: portfolioReturn - benchmarkReturn,
      })
    }

    return series
  }

  private compareHorizon(
    days: number,
    snapshots: SnapshotWithPositions[],
    benchmarkBars: DailyBar[] | undefined,
    priceHistory: PriceHistoryBySymbol,
    asOfMs: number,
  ): PortfolioComparisonHorizonResult {
    const label = `${days}D`
    if (snapshots.length === 0) return emptyHorizon(days, label, 'No snapshots for this scenario.')
    if (!benchmarkBars?.length) return emptyHorizon(days, label, `No ${this.config.benchmarkSymbol} history available.`)

    const requestedStartMs = asOfMs - days * DAY_MS
    const firstSnapshotMs = Date.parse(snapshots[0]!.createdAt)
    const effectiveStartMs = Math.max(requestedStartMs, firstSnapshotMs)
    const marks = benchmarkBars.filter((bar) => bar.dateMs >= effectiveStartMs && bar.dateMs <= asOfMs)
    if (marks.length < 2) return emptyHorizon(days, label, 'Not enough daily marks in this window.')

    let growth = 1
    let peak = 1
    let maxDrawdown = 0
    const snapshotTimes = snapshots.map((snapshot) => Date.parse(snapshot.createdAt))

    for (let i = 1; i < marks.length; i++) {
      const previousMark = marks[i - 1]!
      const currentMark = marks[i]!
      const snapshot = latestSnapshotForDate(snapshots, snapshotTimes, previousMark.dateMs)
      if (!snapshot) continue
      const dailyReturn = portfolioDailyReturn(snapshot.positions, previousMark.dateMs, currentMark.dateMs, priceHistory)
      growth *= 1 + dailyReturn
      peak = Math.max(peak, growth)
      maxDrawdown = Math.min(maxDrawdown, growth / peak - 1)
    }

    const benchmarkReturn = marks.at(-1)!.adjClose / marks[0]!.adjClose - 1
    const portfolioReturn = growth - 1
    const isPartial = firstSnapshotMs > requestedStartMs
    return {
      days,
      label,
      status: isPartial ? 'partial' : 'complete',
      startDate: toDateKey(marks[0]!.dateMs),
      endDate: toDateKey(marks.at(-1)!.dateMs),
      portfolioReturn,
      benchmarkReturn,
      excessReturn: portfolioReturn - benchmarkReturn,
      maxDrawdown,
      note: isPartial ? 'Partial window: scenario has no snapshot old enough for the full lookback.' : null,
    }
  }
}

export function parseComparisonHorizons(value: string | undefined) {
  if (!value) return DEFAULT_HORIZONS
  return value
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((days) => Number.isFinite(days) && days > 0)
}

function normalizeHorizons(horizons: number[]) {
  const unique = [...new Set(horizons.map((days) => Math.floor(days)).filter((days) => days > 0 && days <= 1825))]
  return unique.length > 0 ? unique.sort((a, b) => a - b) : DEFAULT_HORIZONS
}

function groupSnapshotsByScenario(snapshots: SnapshotWithPositions[]) {
  const grouped = new Map<number, SnapshotWithPositions[]>()
  for (const snapshot of snapshots) {
    const entries = grouped.get(snapshot.scenarioId) ?? []
    entries.push(snapshot)
    grouped.set(snapshot.scenarioId, entries)
  }
  return grouped
}

function collectSymbols(snapshots: SnapshotWithPositions[], benchmarkSymbol: string) {
  const symbols = new Set<string>([benchmarkSymbol.toUpperCase()])
  for (const snapshot of snapshots) {
    for (const position of snapshot.positions) {
      if (position.weight > 0) symbols.add(position.symbol.toUpperCase())
    }
  }
  return [...symbols]
}

function latestSnapshotForDate(snapshots: SnapshotWithPositions[], times: number[], dateMs: number) {
  let selected: SnapshotWithPositions | null = null
  for (let i = 0; i < snapshots.length; i++) {
    if (times[i]! <= dateMs + DAY_MS - 1) selected = snapshots[i]!
    else break
  }
  return selected
}

function portfolioDailyReturn(
  positions: PortfolioPosition[],
  previousDateMs: number,
  currentDateMs: number,
  priceHistory: PriceHistoryBySymbol,
) {
  let weightedReturn = 0
  let coveredWeight = 0
  const previousKey = toDateKey(previousDateMs)
  const currentKey = toDateKey(currentDateMs)
  for (const position of positions) {
    const prices = priceHistory.get(position.symbol.toUpperCase())
    if (!prices) continue
    const previous = prices.get(previousKey)
    const current = prices.get(currentKey)
    if (!previous || !current) continue
    weightedReturn += position.weight * (current / previous - 1)
    coveredWeight += position.weight
  }
  return coveredWeight > 0 ? weightedReturn / coveredWeight : 0
}

function buildPriceHistory(history: Map<string, DailyBar[]>): PriceHistoryBySymbol {
  return new Map(
    [...history.entries()].map(([symbol, bars]) => [
      symbol.toUpperCase(),
      new Map(bars.map((bar) => [toDateKey(bar.dateMs), bar.adjClose])),
    ]),
  )
}

function emptyHorizon(days: number, label: string, note: string): PortfolioComparisonHorizonResult {
  return {
    days,
    label,
    status: 'unavailable',
    startDate: null,
    endDate: null,
    portfolioReturn: null,
    benchmarkReturn: null,
    excessReturn: null,
    maxDrawdown: null,
    note,
  }
}

function toDateKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}
