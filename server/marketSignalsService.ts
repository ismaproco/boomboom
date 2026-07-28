import type {
  MarketSignalCategory,
  MarketSignalItem,
  MarketSignalsResponse,
  OptimizedPortfoliosResponse,
  PopularItem,
  PopularResponse,
  PortfolioDecisionResponse,
  SourceState,
  TickerWatchlistItem,
  TickerWatchlistResponse,
} from './types'

const CACHE_MS = 2 * 60_000
const MAX_ITEMS = 24
const ETF_SYMBOLS = new Set([
  'SPY',
  'QQQ',
  'DIA',
  'IWM',
  'VTI',
  'VOO',
  'XLK',
  'XLF',
  'XLE',
  'XLV',
  'XLY',
  'XLI',
  'XLP',
  'XLC',
  'XLU',
  'XLB',
])
const RISK_TERMS = [
  'lawsuit',
  'probe',
  'investigation',
  'fraud',
  'bankruptcy',
  'default',
  'recall',
  'crash',
  'miss',
  'cut',
  'layoff',
  'regulatory',
  'sanction',
  'warning',
]

type MarketSignalsSources = {
  tickers: () => Promise<TickerWatchlistResponse>
  popular: () => Promise<PopularResponse>
  optimizedPortfolios: () => Promise<OptimizedPortfoliosResponse>
  portfolioDecisions: () => Promise<PortfolioDecisionResponse> | PortfolioDecisionResponse
}

type Candidate = {
  ticker: TickerWatchlistItem
  portfolioScore: number
  newsScore: number
  momentumScore: number
  sentimentScore: number
  freshnessScore: number
  riskPenalty: number
  evidence: Set<string>
  risks: Set<string>
  relatedPortfolios: Set<string>
  relatedPopularHeadlines: string[]
  decisionAction: string | null
}

export class MarketSignalsService {
  private cache: MarketSignalsResponse | null = null
  private cacheUntil = 0

  constructor(private readonly sources: MarketSignalsSources) {}

  async getSignals(forceRefresh = false): Promise<MarketSignalsResponse> {
    if (!forceRefresh && this.cache && Date.now() < this.cacheUntil) return this.cache

    const [tickers, popular, optimized, decisions] = await Promise.all([
      this.sources.tickers(),
      this.sources.popular(),
      this.sources.optimizedPortfolios(),
      this.sources.portfolioDecisions(),
    ])
    const response = this.buildSignals(tickers, popular, optimized, decisions)
    const hasPlaceholderTickers = tickers.source === 'fallback' && tickers.items.every((item) => item.price === null)
    this.cache = response
    this.cacheUntil = Date.now() + (hasPlaceholderTickers ? 10_000 : CACHE_MS)
    return response
  }

  async warmSignals() {
    await this.getSignals(true)
  }

  private buildSignals(
    tickers: TickerWatchlistResponse,
    popular: PopularResponse,
    optimized: OptimizedPortfoliosResponse,
    decisions: PortfolioDecisionResponse,
  ): MarketSignalsResponse {
    const tickerItems = tickers.items.filter((ticker) => !ETF_SYMBOLS.has(ticker.symbol))
    const candidates = new Map(tickerItems.map((ticker) => [ticker.symbol, createCandidate(ticker)]))

    for (const tier of optimized.tiers) {
      for (const position of tier.positions) {
        const candidate = candidates.get(position.symbol)
        if (!candidate) continue
        candidate.portfolioScore += Math.min(16, position.weight * 170)
        candidate.relatedPortfolios.add(tier.name)
        candidate.evidence.add(`${tier.name} holding ${(position.weight * 100).toFixed(1)}%`)
        if (tier.metrics.sharpeRatio !== null && tier.metrics.sharpeRatio > 0.75) candidate.portfolioScore += 2
      }
    }

    for (const survivor of decisions.dailySurvivors) {
      const matchingTier = optimized.tiers.find((tier) => tier.scenario.id === survivor.scenarioId)
      for (const position of matchingTier?.positions ?? []) {
        const candidate = candidates.get(position.symbol)
        if (!candidate) continue
        candidate.portfolioScore += Math.min(8, 5 + survivor.rank)
        candidate.evidence.add(`Daily survivor: ${survivor.scenarioName}`)
        candidate.relatedPortfolios.add(survivor.scenarioName)
      }
    }

    for (const decision of decisions.positionDecisions) {
      const candidate = candidates.get(decision.symbol)
      if (!candidate) continue
      candidate.decisionAction = decision.action
      candidate.portfolioScore += decision.action === 'add' ? 10 : decision.action === 'hold' ? 5 : decision.action === 'cap' ? 1 : 0
      candidate.evidence.add(`Decision overlay: ${decision.action}`)
      for (const portfolio of decision.portfolios.slice(0, 3)) candidate.relatedPortfolios.add(portfolio)
      for (const flag of decision.flags) {
        candidate.riskPenalty += flag.severity === 'high' ? 10 : flag.severity === 'medium' ? 6 : 3
        candidate.risks.add(flag.message)
      }
    }

    for (const item of popular.items.slice(0, 60)) {
      for (const candidate of candidates.values()) {
        if (!popularMentionsTicker(item, candidate.ticker)) continue
        const rankBoost = Math.max(0, 12 - item.rank * 0.12)
        const moveBoost = item.rankDelta !== null && item.rankDelta > 0 ? Math.min(6, item.rankDelta / 3) : 0
        const articleBoost = Math.min(5, item.articleCount * 0.8)
        candidate.newsScore += rankBoost + moveBoost + articleBoost
        candidate.freshnessScore = Math.max(candidate.freshnessScore, item.rankDelta === null ? 5 : item.rankDelta > 0 ? 4 : 2)
        if (!candidate.relatedPopularHeadlines.includes(item.headline) && candidate.relatedPopularHeadlines.length < 4)
          candidate.relatedPopularHeadlines.push(item.headline)
        candidate.evidence.add(
          item.rankDelta === null ? 'New Popular cluster' : item.rankDelta > 0 ? 'Popular cluster rising' : 'Popular cluster mention',
        )
        const riskTerm = findRiskTerm(`${item.headline} ${item.summary} ${item.keywords.join(' ')}`)
        if (riskTerm) {
          candidate.riskPenalty += 8
          candidate.risks.add(`Popular news includes ${riskTerm} risk`)
        }
      }
    }

    const items = Array.from(candidates.values())
      .map(toMarketSignalItem)
      .filter((item) => item.score >= 45 || item.category === 'risk-watch')
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ITEMS)

    const highConvictionCount = items.filter((item) => item.category === 'high-conviction').length
    const newsBreakoutCount = items.filter((item) => item.category === 'news-breakout').length
    const riskWatchCount = items.filter((item) => item.category === 'risk-watch').length
    const leader = items[0]
    const source: SourceState = tickers.source === 'live' || popular.items.length > 0 || optimized.tiers.length > 0 ? 'live' : 'fallback'

    return {
      updatedAt: new Date().toISOString(),
      source,
      productFraming: 'exploratory_market_signals',
      summary: {
        title: 'Market Signals',
        narrative: leader
          ? `${leader.symbol} leads the current signal stack with ${leader.category.replace('-', ' ')} evidence from portfolios, news, and momentum.`
          : 'No market signals have enough cross-source evidence yet.',
        highConvictionCount,
        newsBreakoutCount,
        riskWatchCount,
      },
      items,
    }
  }
}

const createCandidate = (ticker: TickerWatchlistItem): Candidate => {
  const day = ticker.change1Day ?? 0
  const week = ticker.change1Week ?? 0
  const momentum = Math.max(0, Math.min(20, day * 350 + week * 180 + 8))
  const sentimentScore = ticker.sentiment === 'Bullish' ? 15 : ticker.sentiment === 'Neutral' ? 7 : 1
  const riskPenalty = ticker.shortScore >= 70 ? 8 : ticker.shortScore >= 62 ? 4 : 0
  return {
    ticker,
    portfolioScore: 0,
    newsScore: 0,
    momentumScore: momentum,
    sentimentScore,
    freshnessScore: 0,
    riskPenalty,
    evidence: new Set(
      ticker.sentiment === 'Bullish' ? ['Bullish ticker sentiment'] : ticker.buyScore >= 55 ? ['Positive ticker bias'] : [],
    ),
    risks: new Set(riskPenalty > 0 ? ['Elevated short score from ticker momentum'] : []),
    relatedPortfolios: new Set(),
    relatedPopularHeadlines: [],
    decisionAction: null,
  }
}

const toMarketSignalItem = (candidate: Candidate): MarketSignalItem => {
  const metrics = {
    portfolioScore: Math.round(Math.min(35, candidate.portfolioScore)),
    newsScore: Math.round(Math.min(25, candidate.newsScore)),
    momentumScore: Math.round(Math.min(20, candidate.momentumScore)),
    sentimentScore: Math.round(Math.min(15, candidate.sentimentScore)),
    freshnessScore: Math.round(Math.min(5, candidate.freshnessScore)),
    riskPenalty: -Math.round(Math.min(30, candidate.riskPenalty)),
  }
  const rawScore =
    metrics.portfolioScore +
    metrics.newsScore +
    metrics.momentumScore +
    metrics.sentimentScore +
    metrics.freshnessScore +
    metrics.riskPenalty
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))
  const category = getCategory(score, metrics, candidate)
  return {
    symbol: candidate.ticker.symbol,
    name: candidate.ticker.name,
    score,
    category,
    rationale: buildRationale(candidate, category),
    evidence: Array.from(candidate.evidence).slice(0, 6),
    risks: Array.from(candidate.risks).slice(0, 5),
    metrics,
    relatedPortfolios: Array.from(candidate.relatedPortfolios).slice(0, 5),
    relatedPopularHeadlines: candidate.relatedPopularHeadlines,
  }
}

const getCategory = (score: number, metrics: MarketSignalItem['metrics'], _candidate: Candidate): MarketSignalCategory => {
  if (metrics.riskPenalty <= -12 && (metrics.newsScore >= 10 || metrics.portfolioScore >= 10)) return 'risk-watch'
  if (score >= 72 && metrics.portfolioScore >= 12) return 'high-conviction'
  if (metrics.newsScore >= 14 && metrics.portfolioScore < 12) return 'news-breakout'
  if (metrics.portfolioScore >= 16 && metrics.momentumScore <= 8 && metrics.riskPenalty > -8) return 'contrarian'
  return score >= 65 ? 'high-conviction' : 'news-breakout'
}

const buildRationale = (candidate: Candidate, category: MarketSignalCategory) => {
  const parts = []
  if (candidate.relatedPortfolios.size > 0)
    parts.push(`portfolio support from ${Array.from(candidate.relatedPortfolios).slice(0, 2).join(', ')}`)
  if (candidate.relatedPopularHeadlines.length > 0) parts.push('Popular news confirmation')
  if (candidate.momentumScore >= 12) parts.push('positive market momentum')
  if (candidate.riskPenalty >= 12) parts.push('meaningful risk flags')
  const fallback =
    category === 'risk-watch' ? 'High attention with unresolved risk flags.' : 'Cross-source signal from current market data.'
  return parts.length > 0 ? `${candidate.ticker.symbol}: ${parts.join(', ')}.` : fallback
}

const popularMentionsTicker = (item: PopularItem, ticker: TickerWatchlistItem) => {
  const text = `${item.headline} ${item.summary} ${item.keywords.join(' ')}`.toLowerCase()
  const symbolPattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(ticker.symbol.toLowerCase())}([^a-z0-9]|$)`)
  if (symbolPattern.test(text)) return true
  const name = ticker.name.toLowerCase()
  return name.length >= 4 && text.includes(name)
}

const findRiskTerm = (text: string) => RISK_TERMS.find((term) => text.toLowerCase().includes(term)) ?? null
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
