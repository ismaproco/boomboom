import { describe, expect, test } from 'bun:test'
import { buildCalibrationPairs, computeLexiconTilt, computeNewsAlignment, summarizeCalibrationCorrelation } from './portfolioSignals'
import type { PopularItem, PortfolioCalibrationPair } from './types'

const item = (overrides: Partial<PopularItem> & Pick<PopularItem, 'headline' | 'summary' | 'score'>): PopularItem => ({
  id: 1,
  snapshotId: 1,
  rank: 1,
  previousRank: null,
  rankDelta: null,
  section: 'Markets',
  primarySource: 'Test',
  sourceCount: 2,
  articleCount: 1,
  sources: ['Test'],
  articleIds: [1],
  keywords: [],
  latestPublishedAt: null,
  earliestPublishedAt: null,
  ...overrides,
})

describe('computeNewsAlignment', () => {
  test('weights narrative heat by positions', () => {
    const v = computeNewsAlignment([
      { weight: 0.5, viewScore: 0.4 },
      { weight: 0.5, viewScore: 0.2 },
    ])
    expect(v).toBeCloseTo(0.3, 5)
  })
})

describe('computeLexiconTilt', () => {
  test('returns positive when bullish words hit portfolio symbols', () => {
    const tilt = computeLexiconTilt(
      [item({ headline: 'AAPL rally continues', summary: 'Gains expected', score: 5, keywords: [] })],
      new Set(['AAPL']),
    )
    expect(tilt).toBeGreaterThan(0)
  })

  test('returns negative when bearish words hit portfolio symbols', () => {
    const tilt = computeLexiconTilt(
      [item({ headline: 'MSFT plunge', summary: 'selloff deepens', score: 5, keywords: [] })],
      new Set(['MSFT']),
    )
    expect(tilt).toBeLessThan(0)
  })
})

describe('buildCalibrationPairs', () => {
  test('pairs prior snapshot with realized excess on next row', () => {
    const pairs = buildCalibrationPairs([
      {
        id: 1,
        createdAt: '2020-01-01T00:00:00Z',
        expectedReturn: 0.01,
        regimeShift: 1,
        newsAlignment: 0.2,
        lexiconTilt: 0.1,
        comparison: null,
      },
      {
        id: 2,
        createdAt: '2020-01-02T00:00:00Z',
        expectedReturn: 0.02,
        regimeShift: 1,
        newsAlignment: 0.3,
        lexiconTilt: 0,
        comparison: { comparedSnapshotId: 1, excessReturn: 0.004 },
      },
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.priorSnapshotId).toBe(1)
    expect(pairs[0]!.modelTilt).toBe(0.01)
    expect(pairs[0]!.realizedExcessReturn).toBe(0.004)
  })
})

describe('summarizeCalibrationCorrelation', () => {
  test('returns null correlation when model tilt is flat', () => {
    const base = {
      intervalEndAt: '',
      priorSnapshotAt: '',
      regimeShift: 1,
      newsAlignment: 0,
      lexiconTilt: 0,
      modelTilt: 0.01,
    }
    const pairs: PortfolioCalibrationPair[] = [
      { ...base, intervalEndSnapshotId: 2, priorSnapshotId: 1, realizedExcessReturn: 0.01 },
      { ...base, intervalEndSnapshotId: 3, priorSnapshotId: 2, realizedExcessReturn: 0.02 },
      { ...base, intervalEndSnapshotId: 4, priorSnapshotId: 3, realizedExcessReturn: -0.01 },
    ]
    const s = summarizeCalibrationCorrelation(pairs)
    expect(s.sampleSize).toBe(3)
    expect(s.correlationModelTiltVsExcess).toBeNull()
  })

  test('computes correlation when tilt tracks excess', () => {
    const pairs: PortfolioCalibrationPair[] = [
      {
        intervalEndSnapshotId: 2,
        intervalEndAt: 'b',
        priorSnapshotId: 1,
        priorSnapshotAt: 'a',
        modelTilt: 0.01,
        regimeShift: 1,
        newsAlignment: 0,
        lexiconTilt: 0,
        realizedExcessReturn: 0.02,
      },
      {
        intervalEndSnapshotId: 3,
        intervalEndAt: 'c',
        priorSnapshotId: 2,
        priorSnapshotAt: 'b',
        modelTilt: 0.02,
        regimeShift: 1,
        newsAlignment: 0,
        lexiconTilt: 0,
        realizedExcessReturn: 0.04,
      },
      {
        intervalEndSnapshotId: 4,
        intervalEndAt: 'd',
        priorSnapshotId: 3,
        priorSnapshotAt: 'c',
        modelTilt: 0.03,
        regimeShift: 1,
        newsAlignment: 0,
        lexiconTilt: 0,
        realizedExcessReturn: 0.06,
      },
    ]
    const s = summarizeCalibrationCorrelation(pairs)
    expect(s.sampleSize).toBe(3)
    expect(s.correlationModelTiltVsExcess).not.toBeNull()
    expect(s.correlationModelTiltVsExcess!).toBeGreaterThan(0.99)
  })
})
