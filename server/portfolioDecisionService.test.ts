import { describe, expect, test } from 'bun:test'
import {
  buildPortfolioDecisionResponse,
  calculateSurvivorScore,
  getFinalizableNyseSessionDate,
  parseDecisionProfile,
  selectDailySurvivors,
} from './portfolioDecisionService'
import type { PortfolioDecision, PortfolioDecisionRun, PortfolioPosition, PortfolioScenario, PortfolioSnapshot } from './types'

const scenario = (id: number, name: string, quantMethod: PortfolioScenario['quantMethod'] = null): PortfolioScenario => ({
  id,
  name,
  symbols: [],
  noveltyProfile: 'medium',
  maxWeightPerAsset: 0.5,
  isDefault: false,
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
  refreshMode: quantMethod ? 'quant' : 'news',
  blendTrending: false,
  quantMethod,
  quantTargetN: quantMethod ? 20 : null,
  quantReoptimizeMs: quantMethod ? 300000 : null,
  quantUniversePolicy: quantMethod ? 'keep' : null,
  quantKeepCount: 0,
  quantNextRunAt: null,
  source: 'optimized',
})

const snapshot = (scenarioId: number, expectedReturn = 0.12, turnoverRatio = 0.2): PortfolioSnapshot => ({
  id: scenarioId * 10,
  scenarioId,
  createdAt: '2026-05-07T00:00:00.000Z',
  benchmarkSymbol: 'SPY',
  benchmarkValue: 100,
  expectedReturn,
  sourceSnapshotId: null,
  viewCount: 20,
  noveltyProfile: 'medium',
  overlapRatio: 0.5,
  turnoverRatio,
  regimeShift: 1,
  newsAlignment: 0,
  lexiconTilt: 0,
})

const position = (snapshotId: number, symbol: string, weight: number, impliedReturn = 0.1): PortfolioPosition => ({
  id: snapshotId * 100 + symbol.charCodeAt(0),
  snapshotId,
  symbol,
  weight,
  viewScore: 0,
  impliedReturn,
  entryPrice: 100,
})

describe('portfolio decision service', () => {
  test('defaults invalid profiles to balanced', () => {
    expect(parseDecisionProfile('aggressive')).toBe('aggressive')
    expect(parseDecisionProfile('unknown')).toBe('balanced')
  })

  test('flags concentrated max-sharpe portfolios as corner solutions', () => {
    const s = scenario(1, 'p2', 'max_sharpe')
    const snap = snapshot(1, 0.3, 1)
    const response = buildPortfolioDecisionResponse({
      profile: 'balanced',
      asOf: '2026-05-07T00:00:00.000Z',
      newsThemes: [],
      bundles: [
        {
          scenario: s,
          snapshot: snap,
          positions: [position(snap.id, 'STT', 0.45), position(snap.id, 'WM', 0.28), position(snap.id, 'KEY', 0.12)],
          comparison: null,
          optimizedMetrics: null,
        },
      ],
    })

    const decision = response.portfolioRankings[0]
    expect(decision.action).toBe('avoid')
    expect(decision.role).toBe('unstable_optimizer')
    expect(decision.riskFlags.map((flag) => flag.code)).toContain('optimizer_corner_solution')
    expect(decision.riskFlags.map((flag) => flag.code)).toContain('extreme_single_name_concentration')
  })

  test('classifies low beta low vol portfolios as defensive anchors', () => {
    const s = scenario(2, 'Capital Shield', 'hrp')
    const snap = snapshot(2, 0.08, 0.1)
    const response = buildPortfolioDecisionResponse({
      profile: 'conservative',
      asOf: '2026-05-07T00:00:00.000Z',
      newsThemes: [],
      bundles: [
        {
          scenario: s,
          snapshot: snap,
          positions: Array.from({ length: 20 }, (_, index) => position(snap.id, `D${index}`, 0.05, 0.06)),
          comparison: {
            id: 1,
            snapshotId: snap.id,
            comparedSnapshotId: snap.id - 1,
            benchmarkSymbol: 'SPY',
            portfolioReturn: 0.01,
            benchmarkReturn: 0,
            excessReturn: 0.01,
            maxDrawdownProxy: -0.01,
            measuredAt: snap.createdAt,
          },
          optimizedMetrics: {
            sharpeRatio: 0.9,
            annualizedVolatility: 0.09,
            maxDrawdown: -0.05,
            betaVsBenchmark: 0.22,
            correlationVsBenchmark: 0.3,
            topFiveConcentration: 0.25,
            effectiveHoldings: 20,
            newPositions: 0,
            droppedPositions: 0,
            winnerDerivedPositions: 20,
            backfilledPositions: 0,
          },
        },
      ],
    })

    expect(response.portfolioRankings[0]!.role).toBe('defensive_anchor')
    expect(response.portfolioRankings[0]!.action).toBe('hold')
    expect(response.recommendedAllocation[0]!.targetPct).toBe(55)
  })

  test('caps high Sharpe growth portfolios when concentration is high', () => {
    const s = scenario(3, 'Growth Core', 'max_sharpe')
    const snap = snapshot(3, 0.22, 0.2)
    const response = buildPortfolioDecisionResponse({
      profile: 'aggressive',
      asOf: '2026-05-07T00:00:00.000Z',
      newsThemes: [],
      bundles: [
        {
          scenario: s,
          snapshot: snap,
          positions: [
            position(snap.id, 'GOOGL', 0.18),
            position(snap.id, 'NVDA', 0.17),
            position(snap.id, 'IRM', 0.15),
            position(snap.id, 'SPG', 0.13),
            position(snap.id, 'PEP', 0.12),
          ],
          comparison: {
            id: 1,
            snapshotId: snap.id,
            comparedSnapshotId: snap.id - 1,
            benchmarkSymbol: 'SPY',
            portfolioReturn: 0.01,
            benchmarkReturn: 0,
            excessReturn: 0.01,
            maxDrawdownProxy: -0.01,
            measuredAt: snap.createdAt,
          },
          optimizedMetrics: {
            sharpeRatio: 3.1,
            annualizedVolatility: 0.15,
            maxDrawdown: -0.09,
            betaVsBenchmark: 0.85,
            correlationVsBenchmark: 0.8,
            topFiveConcentration: 0.75,
            effectiveHoldings: 7.5,
            newPositions: 0,
            droppedPositions: 0,
            winnerDerivedPositions: 5,
            backfilledPositions: 0,
          },
        },
      ],
    })

    const decision = response.portfolioRankings[0]!
    expect(decision.action).toBe('hold')
    expect(decision.riskFlags.map((flag) => flag.code)).toContain('top_five_concentration')
    expect(response.positionDecisions.find((item) => item.symbol === 'GOOGL')?.action).toBe('cap')
  })

  test('negative implied active positions become trim candidates', () => {
    const s = scenario(4, 'Balanced Engine', 'black_litterman')
    const snap = snapshot(4)
    const response = buildPortfolioDecisionResponse({
      profile: 'balanced',
      asOf: '2026-05-07T00:00:00.000Z',
      newsThemes: [],
      bundles: [
        {
          scenario: s,
          snapshot: snap,
          positions: [position(snap.id, 'HRL', 0.03, -0.12), position(snap.id, 'FIX', 0.04, 0.3)],
          comparison: null,
          optimizedMetrics: {
            sharpeRatio: 1.5,
            annualizedVolatility: 0.14,
            maxDrawdown: -0.1,
            betaVsBenchmark: 0.75,
            correlationVsBenchmark: 0.7,
            topFiveConcentration: 0.18,
            effectiveHoldings: 30,
            newPositions: 0,
            droppedPositions: 0,
            winnerDerivedPositions: 2,
            backfilledPositions: 0,
          },
        },
      ],
    })

    expect(response.positionDecisions.find((item) => item.symbol === 'HRL')?.action).toBe('trim')
    expect(response.portfolioRankings[0]!.riskFlags.map((flag) => flag.code)).toContain('negative_active_signal')
  })

  test('energy names get headwind flags when oil theme is negative', () => {
    const s = scenario(5, 'Energy Sleeve', null)
    const snap = snapshot(5)
    const response = buildPortfolioDecisionResponse({
      profile: 'balanced',
      asOf: '2026-05-07T00:00:00.000Z',
      newsThemes: [{ key: 'oil_geopolitics', label: 'Oil', stance: 'headwind', score: 3, rationale: 'Oil prices sliding.' }],
      bundles: [
        {
          scenario: s,
          snapshot: snap,
          positions: [position(snap.id, 'XOM', 0.04, 0.08), position(snap.id, 'KMI', 0.04, 0.08)],
          comparison: null,
          optimizedMetrics: null,
        },
      ],
    })

    const xom = response.positionDecisions.find((item) => item.symbol === 'XOM')
    const kmi = response.positionDecisions.find((item) => item.symbol === 'KMI')
    expect(xom?.action).toBe('trim')
    expect(xom?.flags.map((flag) => flag.code)).toContain('energy_price_headwind')
    expect(kmi?.action).toBe('add')
  })

  test('survivor score blends return, decision score, drawdown, concentration, and turnover', () => {
    const stable = decisionForSurvivor(1, 'Stable Winner', {
      excessReturn: 0.03,
      score: 80,
      maxDrawdown: -0.02,
      topFiveConcentration: 0.35,
      turnoverRatio: 0.2,
    })
    const concentrated = decisionForSurvivor(2, 'Concentrated Winner', {
      excessReturn: 0.04,
      score: 82,
      maxDrawdown: -0.12,
      topFiveConcentration: 0.95,
      turnoverRatio: 0.9,
    })

    expect(calculateSurvivorScore(stable)).toBeGreaterThan(calculateSurvivorScore(concentrated))
  })

  test('selects top three survivors across all portfolios without deleting others', () => {
    const run: PortfolioDecisionRun = {
      id: 1,
      createdAt: '2026-05-07T21:00:00.000Z',
      marketSessionDate: '2026-05-07',
      profile: 'balanced',
      status: 'intraday',
      portfolioRankings: [
        decisionForSurvivor(1, 'One', { excessReturn: 0.03, score: 90 }),
        decisionForSurvivor(2, 'Two', { excessReturn: 0.02, score: 85 }),
        decisionForSurvivor(3, 'Three', { excessReturn: 0.01, score: 80 }),
        decisionForSurvivor(4, 'Four', { excessReturn: -0.01, score: 70 }),
      ],
      positionDecisions: [],
      newsThemes: [],
      dailyChecklist: [],
      assumptions: [],
    }

    const survivors = selectDailySurvivors(run, (scenarioId) => snapshot(scenarioId))
    expect(survivors).toHaveLength(3)
    expect(survivors.map((item) => item.scenarioName)).toEqual(['One', 'Two', 'Three'])
    expect(run.portfolioRankings).toHaveLength(4)
  })

  test('NYSE finalization date uses close buffer and previous weekday', () => {
    expect(getFinalizableNyseSessionDate(new Date('2026-05-07T20:20:00.000Z'))).toBe('2026-05-07')
    expect(getFinalizableNyseSessionDate(new Date('2026-05-07T19:59:00.000Z'))).toBe('2026-05-06')
    expect(getFinalizableNyseSessionDate(new Date('2026-05-11T13:00:00.000Z'))).toBe('2026-05-08')
  })
})

const decisionForSurvivor = (
  id: number,
  name: string,
  overrides: Partial<PortfolioDecision['metrics']> & { score?: number } = {},
): PortfolioDecision => ({
  portfolioId: id,
  portfolioName: name,
  latestSnapshotId: id * 10,
  source: 'manual',
  refreshMode: 'quant',
  action: 'hold',
  conviction: 'medium',
  role: 'alpha_source',
  score: overrides.score ?? 75,
  suggestedAllocationPct: 10,
  maxAllocationPct: 25,
  metrics: {
    expectedReturn: 0.1,
    sharpeRatio: 1,
    annualizedVolatility: 0.1,
    betaVsBenchmark: 0.8,
    maxDrawdown: overrides.maxDrawdown ?? -0.04,
    topFiveConcentration: overrides.topFiveConcentration ?? 0.35,
    effectiveHoldings: 20,
    turnoverRatio: overrides.turnoverRatio ?? 0.2,
    excessReturn: overrides.excessReturn ?? 0.01,
  },
  riskFlags: [],
  rationale: [],
})
