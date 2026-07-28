import type { Fetcher } from './feeds'
import type {
  ArticleRecord,
  CommoditiesResponse,
  CommodityHistoryResponse,
  CommodityInstrument,
  CommoditySnapshotItem,
  PortfolioRepository,
  SourceState,
} from './types'
import { normalizeSymbol } from './utils'
import { fetchDailyAdjustedHistory } from './yahooHistory'

type CommodityStore = PortfolioRepository & {
  getRecentArticles(sinceIso: string, limit: number): ArticleRecord[]
}

const defaultInstruments: CommodityInstrument[] = [
  {
    symbol: 'GLD',
    name: 'SPDR Gold Shares',
    category: 'precious-metals',
    underlying: 'Gold',
    proxyType: 'etf',
    sortOrder: 10,
    isActive: true,
  },
  {
    symbol: 'SLV',
    name: 'iShares Silver Trust',
    category: 'precious-metals',
    underlying: 'Silver',
    proxyType: 'etf',
    sortOrder: 20,
    isActive: true,
  },
  {
    symbol: 'DBC',
    name: 'Invesco DB Commodity Index',
    category: 'energy',
    underlying: 'Broad Commodities',
    proxyType: 'etf',
    sortOrder: 30,
    isActive: true,
  },
  {
    symbol: 'USO',
    name: 'United States Oil Fund',
    category: 'energy',
    underlying: 'Crude Oil',
    proxyType: 'etf',
    sortOrder: 40,
    isActive: true,
  },
  {
    symbol: 'UNG',
    name: 'United States Natural Gas Fund',
    category: 'energy',
    underlying: 'Natural Gas',
    proxyType: 'etf',
    sortOrder: 50,
    isActive: true,
  },
  {
    symbol: 'CPER',
    name: 'United States Copper Index',
    category: 'industrial-metals',
    underlying: 'Copper',
    proxyType: 'etf',
    sortOrder: 60,
    isActive: true,
  },
  {
    symbol: 'FCX',
    name: 'Freeport-McMoRan',
    category: 'miners',
    underlying: 'Copper Miners',
    proxyType: 'equity',
    sortOrder: 70,
    isActive: true,
  },
  {
    symbol: 'DBA',
    name: 'Invesco DB Agriculture Fund',
    category: 'agriculture',
    underlying: 'Agriculture Basket',
    proxyType: 'etf',
    sortOrder: 80,
    isActive: true,
  },
  {
    symbol: 'URA',
    name: 'Global X Uranium ETF',
    category: 'miners',
    underlying: 'Uranium Miners',
    proxyType: 'etf',
    sortOrder: 90,
    isActive: true,
  },
  {
    symbol: 'GDX',
    name: 'VanEck Gold Miners ETF',
    category: 'miners',
    underlying: 'Gold Miners',
    proxyType: 'etf',
    sortOrder: 100,
    isActive: true,
  },
  {
    symbol: 'SLX',
    name: 'VanEck Steel ETF',
    category: 'industrial-metals',
    underlying: 'Steel Producers',
    proxyType: 'etf',
    sortOrder: 110,
    isActive: true,
  },
]

const newsTermsBySymbol: Record<string, string[]> = {
  USO: ['oil', 'crude', 'opec', 'wti', 'brent', 'energy'],
  UNG: ['natural gas', 'lng', 'henry hub', 'storage'],
  GLD: ['gold', 'bullion', 'safe haven'],
  GDX: ['gold', 'miners', 'bullion'],
  SLV: ['silver'],
  CPER: ['copper', 'industrial metals'],
  FCX: ['copper', 'mining'],
  DBA: ['agriculture', 'corn', 'wheat', 'soybean', 'crop'],
  URA: ['uranium', 'nuclear'],
  DBC: ['commodity', 'commodities', 'raw materials'],
  SLX: ['steel', 'industrial metals'],
}

export class CommoditiesService {
  constructor(
    private readonly store: CommodityStore,
    private readonly market: {
      fetchLiveTickers: (
        symbols: readonly string[],
      ) => Promise<Array<{ symbol: string; lastPrice?: number; value?: string; change?: string }>>
    },
    private readonly fetcher: Fetcher,
  ) {}

  async getLatest() {
    this.store.upsertCommodityInstruments(defaultInstruments)
    let snapshot = this.store.getLatestCommoditySnapshot()
    if (!snapshot) await this.refresh()
    snapshot = this.store.getLatestCommoditySnapshot()
    const items = snapshot ? this.store.getCommoditySnapshotItems(snapshot.id) : []
    const relatedNews = snapshot ? this.getRelatedNews(snapshot.id) : []
    return {
      updatedAt: new Date().toISOString(),
      source: snapshot?.source ?? 'fallback',
      snapshot,
      items,
      snapshots: this.store.getCommoditySnapshots(50),
      relatedNews,
      assumptions: [
        'All entries are ETF/equity proxies; no futures contracts are used.',
        'Signals separate direction from volatility risk labels.',
      ],
    } satisfies CommoditiesResponse
  }

  getHistory(symbol: string, days = 180): CommodityHistoryResponse {
    const target = normalizeSymbol(symbol) ?? symbol.trim().toUpperCase()
    const clampedDays = Math.min(1825, Math.max(30, Math.floor(days)))
    const points = this.store
      .getCommodityPriceHistory(target, isoDaysAgo(clampedDays + 2), isoToday())
      .map((row) => ({ date: row.date, close: row.close }))
    return { updatedAt: new Date().toISOString(), symbol: target, days: clampedDays, points }
  }

  getSnapshots(limit = 50) {
    return {
      updatedAt: new Date().toISOString(),
      snapshots: this.store.getCommoditySnapshots(Math.min(200, Math.max(1, Math.floor(limit)))),
    }
  }

  async refresh() {
    this.store.upsertCommodityInstruments(defaultInstruments)
    const instruments = this.store.listCommodityInstruments(true)
    const quotes = await this.market.fetchLiveTickers(instruments.map((instrument) => instrument.symbol))
    const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote]))

    const items = await Promise.all(
      instruments.map(async (instrument) => {
        const history = await fetchDailyAdjustedHistory(this.fetcher, instrument.symbol, 1)
        if (history && history.length > 0) {
          this.store.upsertCommodityPriceHistory(
            instrument.symbol,
            history.map((bar) => ({ date: new Date(bar.dateMs).toISOString().slice(0, 10), close: bar.adjClose })),
          )
        }
        const recent = this.store.getCommodityPriceHistory(instrument.symbol, isoDaysAgo(45), isoToday())
        const quote = quoteBySymbol.get(instrument.symbol)
        return buildItem(
          instrument,
          quote,
          recent.map((row) => row.close),
        )
      }),
    )

    const source: SourceState = quotes.length > 0 ? 'live' : 'fallback'
    const status: 'ok' | 'partial' | 'error' = items.every((item) => item.price !== null)
      ? 'ok'
      : items.some((item) => item.price !== null)
        ? 'partial'
        : 'error'
    const summaryJson = JSON.stringify({ universe: items.length })
    const snapshotId = this.store.saveCommoditySnapshot({ source, status, summaryJson, items })
    this.persistNewsLinks(snapshotId, items)
    return this.getLatest()
  }

  private persistNewsLinks(snapshotId: number, items: CommoditySnapshotItem[]) {
    const articles = this.store.getRecentArticles(new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString(), 500)
    const links: Array<{ symbol: string; articleId: number; score: number; matchedTerms: string[] }> = []
    for (const item of items) {
      const terms = newsTermsBySymbol[item.symbol] ?? []
      if (terms.length === 0) continue
      for (const article of articles) {
        const haystack = `${article.headline} ${article.summary} ${article.section} ${article.source}`.toLowerCase()
        const matchedTerms = terms.filter((term) => haystack.includes(term))
        if (matchedTerms.length === 0) continue
        links.push({ symbol: item.symbol, articleId: article.id, score: matchedTerms.length, matchedTerms })
      }
    }
    const deduped = new Map<string, { symbol: string; articleId: number; score: number; matchedTerms: string[] }>()
    links.forEach((link) => {
      const key = `${link.symbol}:${link.articleId}`
      const existing = deduped.get(key)
      if (!existing || link.score > existing.score) deduped.set(key, link)
    })
    this.store.replaceCommodityNewsLinks(snapshotId, [...deduped.values()])
  }

  private getRelatedNews(snapshotId: number) {
    const links = this.store.getCommodityNewsLinks(snapshotId)
    if (links.length === 0) return []
    const articleLookup = new Map(
      this.store
        .getRecentArticles(new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString(), 1000)
        .map((article) => [article.id, article]),
    )
    const bySymbol = new Map<string, ArticleRecord[]>()
    links.forEach((link) => {
      const article = articleLookup.get(link.articleId)
      if (!article) return
      const entries = bySymbol.get(link.symbol) ?? []
      if (!entries.some((entry) => entry.id === article.id)) entries.push(article)
      bySymbol.set(link.symbol, entries)
    })
    return [...bySymbol.entries()].map(([symbol, articles]) => ({ symbol, articles: articles.slice(0, 5) }))
  }
}

const buildItem = (
  instrument: CommodityInstrument,
  quote: { lastPrice?: number; value?: string; change?: string } | undefined,
  closes: number[],
): CommoditySnapshotItem => {
  const lastClose = closes.at(-1) ?? null
  const price = quote?.lastPrice ?? parsePrice(quote?.value) ?? lastClose
  const change1Day = parsePercent(quote?.change) ?? ratio(closes.at(-2), lastClose)
  const change1Week = ratio(closes.at(-6), lastClose)
  const change1Month = ratio(closes.at(-22), lastClose)
  const weekChangeSeries = buildChangeSeries(closes.slice(-6), price)
  const volatility30d = calcVolatility(closes.slice(-30))
  const directionScore = Math.round(((change1Day ?? 0) * 1.4 + (change1Week ?? 0) * 1.0 + (change1Month ?? 0) * 0.8) * 100)
  const riskScore = Math.round((volatility30d ?? 0) * 100)
  const signal = directionScore >= 4 ? 'bullish' : directionScore <= -4 ? 'bearish' : 'neutral'
  const riskLabel: 'low-vol' | 'elevated-vol' | 'shock-vol' = riskScore >= 45 ? 'shock-vol' : riskScore >= 25 ? 'elevated-vol' : 'low-vol'
  const note = `${instrument.proxyType.toUpperCase()} proxy for ${instrument.underlying}; not a spot commodity quote.`
  return {
    symbol: instrument.symbol,
    name: instrument.name,
    category: instrument.category,
    underlying: instrument.underlying,
    proxyType: instrument.proxyType,
    price,
    change1Day,
    change1Week,
    change1Month,
    weekChangeSeries,
    volatility30d,
    signal,
    signalScore: directionScore,
    riskLabel,
    riskScore,
    note,
  }
}

const buildChangeSeries = (closes: number[], currentPrice: number | null) => {
  if (closes.length < 2) return []
  const values = closes.slice()
  if (currentPrice && currentPrice > 0) values[values.length - 1] = currentPrice
  const base = values[0]
  if (!base || base <= 0) return []
  return values.map((value) => (value - base) / base)
}

const ratio = (prior: number | undefined | null, current: number | undefined | null) => {
  if (!prior || !current || prior <= 0 || current <= 0) return null
  return (current - prior) / prior
}

const calcVolatility = (closes: number[]) => {
  if (closes.length < 10) return null
  const returns = closes.slice(1).map((value, index) => (closes[index]! > 0 ? value / closes[index]! - 1 : 0))
  const avg = returns.reduce((sum, value) => sum + value, 0) / returns.length
  const variance = returns.reduce((sum, value) => sum + (value - avg) ** 2, 0) / returns.length
  return Math.sqrt(Math.max(0, variance)) * Math.sqrt(252)
}

const parsePrice = (value?: string) => {
  if (!value) return null
  const parsed = Number.parseFloat(value.replace(/[$,]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

const parsePercent = (value?: string) => {
  if (!value) return null
  const parsed = Number.parseFloat(value.replace('%', ''))
  return Number.isFinite(parsed) ? parsed / 100 : null
}

const isoToday = () => new Date().toISOString().slice(0, 10)
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60_000).toISOString().slice(0, 10)
