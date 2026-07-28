import { describe, expect, test } from 'bun:test'
import { MarketSignalsService } from './marketSignalsService'
import type { OptimizedPortfoliosResponse, PopularResponse, PortfolioDecisionResponse, TickerWatchlistResponse } from './types'

describe('MarketSignalsService', () => {
  test('ranks cross-source stock signals with explainable metrics', async () => {
    const service = new MarketSignalsService({
      tickers: async () => tickerResponse,
      popular: async () => popularResponse,
      optimizedPortfolios: async () => optimizedResponse,
      portfolioDecisions: async () => decisionResponse,
    })

    const data = await service.getSignals(true)
    const nvidia = data.items.find((item) => item.symbol === 'NVDA')

    expect(data.productFraming).toBe('exploratory_market_signals')
    expect(nvidia).toBeDefined()
    expect(nvidia?.score).toBeGreaterThan(70)
    expect(nvidia?.category).toBe('high-conviction')
    expect(nvidia?.evidence.some((entry) => entry.includes('Decision overlay'))).toBe(true)
    expect(nvidia?.relatedPopularHeadlines.length).toBeGreaterThan(0)
  })

  test('keeps material negative news in risk watch', async () => {
    const service = new MarketSignalsService({
      tickers: async () => tickerResponse,
      popular: async () => ({ ...popularResponse, items: [riskPopularItem] }),
      optimizedPortfolios: async () => optimizedResponse,
      portfolioDecisions: async () => riskDecisionResponse,
    })

    const data = await service.getSignals(true)
    const boeing = data.items.find((item) => item.symbol === 'BA')

    expect(boeing).toBeDefined()
    expect(boeing?.category).toBe('risk-watch')
    expect(boeing?.metrics.riskPenalty).toBeLessThan(0)
    expect(boeing?.risks.length).toBeGreaterThan(0)
  })
})

const tickerResponse: TickerWatchlistResponse = {
  updatedAt: '2026-01-01T00:00:00.000Z',
  source: 'live',
  items: [
    {
      symbol: 'NVDA',
      name: 'NVIDIA',
      price: 900,
      change1Day: 0.025,
      change1Week: 0.08,
      weekChangeSeries: [0, 0.01, 0.025, 0.04, 0.06, 0.08],
      shortScore: 18,
      buyScore: 82,
      sentiment: 'Bullish',
    },
    {
      symbol: 'BA',
      name: 'Boeing',
      price: 180,
      change1Day: -0.03,
      change1Week: -0.08,
      weekChangeSeries: [0, -0.02, -0.03, -0.05, -0.06, -0.08],
      shortScore: 74,
      buyScore: 26,
      sentiment: 'Bearish',
    },
    {
      symbol: 'SPY',
      name: 'SPDR S&P 500 ETF',
      price: 500,
      change1Day: 0.01,
      change1Week: 0.02,
      weekChangeSeries: [0, 0.004, 0.006, 0.01, 0.015, 0.02],
      shortScore: 35,
      buyScore: 65,
      sentiment: 'Bullish',
    },
  ],
}

const popularResponse: PopularResponse = {
  updatedAt: '2026-01-01T00:00:00.000Z',
  snapshot: { id: 1, createdAt: '2026-01-01T00:00:00.000Z', articleCount: 2, clusterCount: 2 },
  previousSnapshot: null,
  items: [
    {
      id: 1,
      snapshotId: 1,
      rank: 1,
      previousRank: 8,
      rankDelta: 7,
      score: 100,
      headline: 'NVIDIA data-center demand accelerates on AI infrastructure orders',
      summary: 'NVDA suppliers point to stronger accelerator demand.',
      section: 'Markets',
      primarySource: 'Test',
      sourceCount: 4,
      articleCount: 5,
      sources: ['Test'],
      articleIds: [1, 2],
      keywords: ['nvidia', 'ai', 'data centers'],
      latestPublishedAt: null,
      earliestPublishedAt: null,
    },
  ],
}

const riskPopularItem = {
  ...popularResponse.items[0],
  id: 2,
  headline: 'Boeing faces regulatory investigation after safety warning',
  summary: 'BA shares fall as probe expands.',
  keywords: ['boeing', 'regulatory', 'investigation'],
}

const optimizedResponse: OptimizedPortfoliosResponse = {
  updatedAt: '2026-01-01T00:00:00.000Z',
  nextRunAt: null,
  benchmarkSymbol: 'SPY',
  charts: { growth: [], drawdown: [], riskReturn: [], correlationHeatmap: { rows: [], columns: [], cells: [] } },
  tiers: [
    {
      key: 'growth',
      name: 'Growth Optimized',
      riskLabel: 'Growth',
      description: 'Test tier',
      scenario: {
        id: 10,
        name: 'Growth Optimized',
        symbols: ['NVDA', 'BA'],
        noveltyProfile: 'medium',
        maxWeightPerAsset: 0.25,
        isDefault: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        refreshMode: 'quant',
        blendTrending: false,
        quantMethod: null,
        quantTargetN: null,
        quantReoptimizeMs: null,
        quantUniversePolicy: null,
        quantKeepCount: null,
        quantNextRunAt: null,
        source: 'optimized',
      },
      snapshot: null,
      positions: [
        { id: 1, snapshotId: 1, symbol: 'NVDA', weight: 0.16, viewScore: 1, impliedReturn: 0.2, entryPrice: 900 },
        { id: 2, snapshotId: 1, symbol: 'BA', weight: 0.12, viewScore: 1, impliedReturn: 0.1, entryPrice: 180 },
      ],
      comparison: null,
      metrics: {
        sharpeRatio: 1.1,
        annualizedVolatility: 0.2,
        maxDrawdown: -0.1,
        betaVsBenchmark: 1,
        correlationVsBenchmark: 0.8,
        topFiveConcentration: 0.5,
        effectiveHoldings: 8,
        newPositions: 1,
        droppedPositions: 0,
        winnerDerivedPositions: 2,
        backfilledPositions: 0,
      },
    },
  ],
}

const decisionResponse: PortfolioDecisionResponse = {
  updatedAt: '2026-01-01T00:00:00.000Z',
  asOf: '2026-01-01T00:00:00.000Z',
  riskProfile: 'balanced',
  productFraming: 'exploratory_decision_overlay',
  assumptions: [],
  portfolioRankings: [],
  recommendedAllocation: [],
  positionDecisions: [
    {
      symbol: 'NVDA',
      action: 'add',
      conviction: 'high',
      currentWeight: 0.16,
      suggestedMaxWeight: 0.2,
      impliedReturn: 0.2,
      portfolios: ['Growth Optimized'],
      rationale: ['Strong AI alignment'],
      flags: [],
    },
  ],
  riskFlags: [],
  newsThemes: [],
  dailyChecklist: [],
  dailySurvivors: [
    {
      id: 1,
      decisionRunId: 1,
      marketSessionDate: '2026-01-01',
      scenarioId: 10,
      scenarioName: 'Growth Optimized',
      snapshotId: 1,
      rank: 1,
      survivorScore: 90,
      realizedExcessReturn: null,
      decisionScore: 90,
      maxDrawdown: null,
      topFiveConcentration: 0.5,
      turnoverRatio: null,
      selectedAt: '2026-01-01T00:00:00.000Z',
      selectionReason: 'Top score',
    },
  ],
}

const riskDecisionResponse: PortfolioDecisionResponse = {
  ...decisionResponse,
  positionDecisions: [
    {
      symbol: 'BA',
      action: 'trim',
      conviction: 'high',
      currentWeight: 0.12,
      suggestedMaxWeight: 0.05,
      impliedReturn: -0.05,
      portfolios: ['Growth Optimized'],
      rationale: ['Risk pressure'],
      flags: [{ code: 'theme_headwind', severity: 'high', message: 'Regulatory headline pressure' }],
    },
  ],
  dailySurvivors: [],
}
