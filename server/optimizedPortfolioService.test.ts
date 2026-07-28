import { describe, expect, test } from 'bun:test'
import {
  buildOptimizedPortfolioCharts,
  buildTierSymbols,
  calculatePortfolioRiskMetrics,
  scoreWinnerCandidates,
} from './optimizedPortfolioService'

describe('optimized portfolio helpers', () => {
  test('scores winners by blended realized return contribution frequency and recency', () => {
    const now = Date.parse('2026-05-07T12:00:00.000Z')
    const snapshots = [
      {
        id: 1,
        scenarioId: 1,
        createdAt: '2026-05-06T12:00:00.000Z',
        benchmarkSymbol: 'SPY',
        benchmarkValue: 500,
        expectedReturn: 0,
        sourceSnapshotId: null,
        viewCount: 2,
        noveltyProfile: 'medium' as const,
        overlapRatio: 0,
        turnoverRatio: 0,
        regimeShift: 1,
        newsAlignment: 0,
        lexiconTilt: 0,
        comparison: {
          id: 1,
          snapshotId: 1,
          comparedSnapshotId: 0,
          benchmarkSymbol: 'SPY',
          portfolioReturn: 0.06,
          benchmarkReturn: 0.02,
          excessReturn: 0.04,
          maxDrawdownProxy: 0,
          measuredAt: '2026-05-07T12:00:00.000Z',
        },
        positions: [
          { id: 1, snapshotId: 1, symbol: 'AAA', weight: 0.5, viewScore: 0, impliedReturn: 0, entryPrice: 100 },
          { id: 2, snapshotId: 1, symbol: 'BBB', weight: 0.5, viewScore: 0, impliedReturn: 0, entryPrice: 100 },
        ],
      },
      {
        id: 2,
        scenarioId: 2,
        createdAt: '2026-05-01T12:00:00.000Z',
        benchmarkSymbol: 'SPY',
        benchmarkValue: 500,
        expectedReturn: 0,
        sourceSnapshotId: null,
        viewCount: 1,
        noveltyProfile: 'medium' as const,
        overlapRatio: 0,
        turnoverRatio: 0,
        regimeShift: 1,
        newsAlignment: 0,
        lexiconTilt: 0,
        positions: [{ id: 3, snapshotId: 2, symbol: 'AAA', weight: 0.3, viewScore: 0, impliedReturn: 0, entryPrice: 100 }],
      },
    ]
    const quotes = new Map([
      ['AAA', 125],
      ['BBB', 102],
    ])

    const ranked = scoreWinnerCandidates(snapshots, quotes, now)

    expect(ranked[0]?.symbol).toBe('AAA')
    expect(ranked.find((candidate) => candidate.symbol === 'AAA')!.score).toBeGreaterThan(
      ranked.find((candidate) => candidate.symbol === 'BBB')!.score,
    )
  })

  test('builds deterministic tier symbols with kept names and backfilled pool names', () => {
    const symbols = buildTierSymbols({
      definition: { key: 'growth-core', n: 5, keepRatio: 0.4 },
      candidatePool: ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG'],
      currentSymbols: ['AAA', 'CCC', 'ZZZ'],
      seed: 'growth-core:123',
      priorTiers: [['BBB', 'DDD']],
    })

    expect(symbols).toHaveLength(5)
    expect(new Set(symbols).size).toBe(5)
    expect(symbols.some((symbol) => symbol === 'AAA' || symbol === 'CCC')).toBe(true)
    expect(symbols.every((symbol) => ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG'].includes(symbol))).toBe(true)
  })

  test('calculates risk metrics from portfolio and benchmark history', () => {
    const start = Date.parse('2026-01-01T00:00:00.000Z')
    const mkBars = (base: number, dailyStep: number) =>
      Array.from({ length: 32 }, (_, index) => ({
        dateMs: start + index * 86_400_000,
        adjClose: base * (1 + dailyStep) ** index,
      }))
    const positions = [
      { id: 1, snapshotId: 1, symbol: 'AAA', weight: 0.6, viewScore: 0, impliedReturn: 0, entryPrice: 100 },
      { id: 2, snapshotId: 1, symbol: 'BBB', weight: 0.4, viewScore: 0, impliedReturn: 0, entryPrice: 100 },
    ]
    const history = new Map([
      ['AAA', mkBars(100, 0.002)],
      ['BBB', mkBars(100, 0.001)],
    ])
    const metrics = calculatePortfolioRiskMetrics(positions, mkBars(400, 0.0012), history)

    expect(metrics.annualizedVolatility).not.toBeNull()
    expect(metrics.sharpeRatio).not.toBeNull()
    expect(metrics.maxDrawdown).toBe(0)
    expect(metrics.betaVsBenchmark).not.toBeNull()
    expect(metrics.correlationVsBenchmark).not.toBeNull()
  })

  test('builds normalized growth drawdown and symmetric heatmap chart data', () => {
    const start = Date.parse('2026-01-01T00:00:00.000Z')
    const bars = (base: number, dailyStep: number) =>
      Array.from({ length: 32 }, (_, index) => ({
        dateMs: start + index * 86_400_000,
        adjClose: base * (1 + dailyStep) ** index,
      }))
    const tier = {
      key: 'growth-core',
      name: 'Growth Core',
      riskLabel: 'Medium risk',
      description: '',
      scenario: {
        id: 7,
        name: 'Growth Core',
        symbols: ['AAA', 'BBB'],
        noveltyProfile: 'medium' as const,
        maxWeightPerAsset: 0.2,
        isDefault: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        refreshMode: 'quant' as const,
        blendTrending: false,
        quantMethod: 'max_sharpe' as const,
        quantTargetN: 2,
        quantReoptimizeMs: 3600000,
        quantUniversePolicy: 'keep' as const,
        quantKeepCount: 0,
        quantNextRunAt: null,
        source: 'optimized' as const,
      },
      snapshot: null,
      comparison: null,
      positions: [
        { id: 1, snapshotId: 1, symbol: 'AAA', weight: 0.5, viewScore: 0, impliedReturn: 0, entryPrice: 100 },
        { id: 2, snapshotId: 1, symbol: 'BBB', weight: 0.5, viewScore: 0, impliedReturn: 0, entryPrice: 100 },
      ],
      metrics: {
        sharpeRatio: 1,
        annualizedVolatility: 0.2,
        maxDrawdown: -0.03,
        betaVsBenchmark: 1,
        correlationVsBenchmark: 0.9,
        topFiveConcentration: 1,
        effectiveHoldings: 2,
        newPositions: 2,
        droppedPositions: 0,
        winnerDerivedPositions: 2,
        backfilledPositions: 0,
      },
    }
    const history = new Map([
      ['AAA', bars(100, 0.002)],
      ['BBB', bars(90, 0.001)],
      ['SPY', bars(400, 0.0012)],
      ['QQQ', bars(300, 0.0014)],
    ])

    const charts = buildOptimizedPortfolioCharts([tier], history, 'SPY')
    const growth = charts.growth.find((series) => series.name === 'Growth Core')
    const drawdown = charts.drawdown.find((series) => series.name === 'Growth Core')
    const selfCorrelation = charts.correlationHeatmap.cells.find((cell) => cell.row === 'Growth Core' && cell.column === 'Growth Core')

    expect(growth?.values[0]?.value).toBe(10000)
    expect(drawdown?.values.every((point) => point.value <= 0)).toBe(true)
    expect(selfCorrelation?.correlation).toBeCloseTo(1, 5)
  })
})
