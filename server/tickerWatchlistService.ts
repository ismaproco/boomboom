import type { Fetcher } from './feeds'
import type { LiveNewsGateway, SourceState, TickerWatchlistItem, TickerWatchlistResponse } from './types'
import { fetchDailyAdjustedHistory, mapWithConcurrency } from './yahooHistory'

const TICKER_CACHE_MS = 2 * 60_000
const PLACEHOLDER_CACHE_MS = 10_000

const knownNames: Record<string, string> = {
  AAPL: 'Apple',
  AMD: 'Advanced Micro Devices',
  AMZN: 'Amazon',
  AVGO: 'Broadcom',
  BA: 'Boeing',
  BAC: 'Bank of America',
  CAT: 'Caterpillar',
  COIN: 'Coinbase',
  COST: 'Costco',
  CVX: 'Chevron',
  DIA: 'SPDR Dow Jones Industrial Average ETF',
  DIS: 'Disney',
  GOOGL: 'Alphabet',
  GS: 'Goldman Sachs',
  HD: 'Home Depot',
  IWM: 'iShares Russell 2000 ETF',
  JNJ: 'Johnson & Johnson',
  JPM: 'JPMorgan Chase',
  LLY: 'Eli Lilly',
  MA: 'Mastercard',
  META: 'Meta Platforms',
  MSFT: 'Microsoft',
  MSTR: 'MicroStrategy',
  NFLX: 'Netflix',
  NVDA: 'NVIDIA',
  QQQ: 'Invesco QQQ ETF',
  SPY: 'SPDR S&P 500 ETF',
  TSLA: 'Tesla',
  UNH: 'UnitedHealth',
  V: 'Visa',
  WMT: 'Walmart',
  XOM: 'Exxon Mobil',
}

export class TickerWatchlistService {
  private cache: TickerWatchlistResponse | null = null
  private cacheUntil = 0
  private refresh: Promise<void> | null = null

  constructor(
    private readonly market: LiveNewsGateway,
    private readonly historyFetcher: Fetcher,
    private readonly symbols: string[],
  ) {}

  async getWatchlist(forceRefresh = false): Promise<TickerWatchlistResponse> {
    if (!forceRefresh && this.cache && Date.now() < this.cacheUntil) return this.cache

    const watchSymbols = [...new Set(this.symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))]
    if (this.cache) {
      this.refreshInBackground(watchSymbols)
      return this.cache
    }

    const response = this.buildPlaceholderResponse(watchSymbols)
    this.cache = response
    this.cacheUntil = Date.now() + PLACEHOLDER_CACHE_MS
    this.refreshInBackground(watchSymbols)
    return response
  }

  private buildPlaceholderResponse(watchSymbols: string[]): TickerWatchlistResponse {
    return {
      updatedAt: new Date().toISOString(),
      source: 'fallback',
      items: watchSymbols.map((symbol) => buildWatchlistItem(symbol, null, null, null)),
    }
  }

  private refreshInBackground(watchSymbols: string[]) {
    if (this.refresh) return
    this.refresh = this.refreshWatchlist(watchSymbols)
      .catch((error) => console.error('Ticker watchlist refresh failed:', error))
      .finally(() => {
        this.refresh = null
      })
  }

  private async refreshWatchlist(watchSymbols: string[]) {
    const quotes = await this.market.fetchLiveTickers(watchSymbols)
    const quoteBySymbol = new Map(quotes.map((ticker) => [ticker.symbol.toUpperCase(), ticker]))
    const items = watchSymbols.map((symbol) => {
      const quote = quoteBySymbol.get(symbol)
      const price = quote?.lastPrice ?? parsePrice(quote?.value) ?? null
      const change1Day = parsePercent(quote?.change)
      const previous = this.cache?.items.find((item) => item.symbol === symbol)
      const change1Week = previous?.change1Week ?? null
      return buildWatchlistItem(symbol, price, change1Day, change1Week, previous?.weekChangeSeries ?? [])
    })
    const source: SourceState = quotes.length > 0 ? 'live' : 'fallback'
    const response = { updatedAt: new Date().toISOString(), source, items }
    this.cache = response
    this.cacheUntil = Date.now() + TICKER_CACHE_MS
    const changes = await mapWithConcurrency(watchSymbols, 8, async (symbol) => {
      const current = response.items.find((item) => item.symbol === symbol)
      return [symbol, await this.getOneWeekSnapshot(symbol, current?.price ?? null)] as const
    })
    const changeBySymbol = new Map(changes)
    if (this.cache !== response) return

    this.cache = {
      ...response,
      items: response.items.map((item) => {
        const snapshot = changeBySymbol.get(item.symbol)
        return buildWatchlistItem(
          item.symbol,
          item.price,
          item.change1Day,
          snapshot?.change1Week ?? item.change1Week,
          snapshot?.weekChangeSeries ?? item.weekChangeSeries,
        )
      }),
    }
  }

  private async getOneWeekSnapshot(
    symbol: string,
    currentPrice: number | null,
  ): Promise<{ change1Week: number | null; weekChangeSeries: number[] }> {
    const history = await fetchDailyAdjustedHistory(this.historyFetcher, symbol, 1)
    if (!history || history.length < 6) return { change1Week: null, weekChangeSeries: [] }
    const closes = history.slice(-6).map((bar) => bar.adjClose)
    if (currentPrice && currentPrice > 0) closes[closes.length - 1] = currentPrice
    const latest = closes.at(-1)
    const prior = closes[0]
    if (!latest || !prior) return { change1Week: null, weekChangeSeries: [] }
    return {
      change1Week: (latest - prior) / prior,
      weekChangeSeries: closes.map((close) => (close - prior) / prior),
    }
  }
}

const buildWatchlistItem = (
  symbol: string,
  price: number | null,
  change1Day: number | null,
  change1Week: number | null,
  weekChangeSeries: number[] = [],
): TickerWatchlistItem => {
  const momentum = (change1Day ?? 0) * 0.65 + (change1Week ?? 0) * 0.35
  const buyScore = Math.round(clamp(50 + momentum * 650, 0, 100))
  const shortScore = 100 - buyScore
  const sentiment = buyScore >= 62 ? 'Bullish' : shortScore >= 62 ? 'Bearish' : 'Neutral'

  return {
    symbol,
    name: knownNames[symbol] ?? symbol,
    price,
    change1Day,
    change1Week,
    weekChangeSeries,
    shortScore,
    buyScore,
    sentiment,
  }
}

const parsePercent = (value: string | undefined) => {
  if (!value) return null
  const parsed = Number.parseFloat(value.replace('%', ''))
  return Number.isFinite(parsed) ? parsed / 100 : null
}

const parsePrice = (value: string | undefined) => {
  if (!value) return null
  const parsed = Number.parseFloat(value.replace(/[$,]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
