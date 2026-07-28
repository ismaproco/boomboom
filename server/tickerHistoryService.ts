import type { Fetcher } from './feeds'
import type { PortfolioRepository, TickerHistoryStatusResponse } from './types'
import { fetchDailyAdjustedHistory } from './yahooHistory'

const DAY_MS = 24 * 60 * 60 * 1000

export class TickerHistoryService {
  constructor(
    private readonly store: PortfolioRepository,
    private readonly fetcher: Fetcher,
    private readonly benchmarkSymbols: string[] = ['SPY', 'QQQ'],
  ) {}

  listTrackedSymbols() {
    const scenarios = this.store.listPortfolioScenarios()
    const symbols = new Set<string>(this.benchmarkSymbols.map((symbol) => symbol.toUpperCase()))
    scenarios.forEach((scenario) => scenario.symbols.forEach((symbol) => symbols.add(symbol.toUpperCase())))
    return [...symbols].sort((left, right) => left.localeCompare(right))
  }

  getStatus(symbols?: string[]): TickerHistoryStatusResponse {
    const target = symbols && symbols.length > 0 ? symbols.map((symbol) => symbol.toUpperCase()) : this.listTrackedSymbols()
    const statusBySymbol = new Map(this.store.getTickerHistorySyncStatuses(target).map((entry) => [entry.symbol, entry]))
    const statuses = target.map(
      (symbol) =>
        statusBySymbol.get(symbol) ?? {
          symbol,
          lastSyncedAt: null,
          lastBarDate: null,
          status: 'never' as const,
          error: null,
        },
    )
    return { updatedAt: new Date().toISOString(), symbols: statuses }
  }

  async sync(symbols?: string[]) {
    const target = symbols && symbols.length > 0 ? symbols.map((symbol) => symbol.toUpperCase()) : this.listTrackedSymbols()
    for (const symbol of target) {
      await this.syncOne(symbol)
    }
    return this.getStatus(target)
  }

  private async syncOne(symbol: string) {
    try {
      const bars = await fetchDailyAdjustedHistory(this.fetcher, symbol, 5)
      if (!bars || bars.length === 0) {
        this.store.upsertTickerHistorySyncStatus({
          symbol,
          lastSyncedAt: new Date().toISOString(),
          lastBarDate: null,
          status: 'error',
          error: 'No history received from upstream provider.',
        })
        return
      }
      const mapped = bars.map((bar) => ({ date: new Date(bar.dateMs).toISOString().slice(0, 10), adjClose: bar.adjClose }))
      this.store.upsertTickerPriceHistory(symbol, mapped)
      const latestMs = bars[bars.length - 1]?.dateMs ?? 0
      const stale = latestMs <= 0 || Date.now() - latestMs > 7 * DAY_MS
      this.store.upsertTickerHistorySyncStatus({
        symbol,
        lastSyncedAt: new Date().toISOString(),
        lastBarDate: latestMs > 0 ? new Date(latestMs).toISOString().slice(0, 10) : null,
        status: stale ? 'stale' : 'ok',
        error: null,
      })
    } catch (error) {
      this.store.upsertTickerHistorySyncStatus({
        symbol,
        lastSyncedAt: new Date().toISOString(),
        lastBarDate: null,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
