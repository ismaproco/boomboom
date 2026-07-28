import { describe, expect, test } from 'bun:test'
import { AutoPortfolioService } from './portfolio'
import type { LiveNewsGateway, PopularRepository, PortfolioRepository } from './types'

describe('AutoPortfolioService.getSignalCalibration', () => {
  test('requests at least 10 snapshots when limit is 10', () => {
    let requestedLimit = 0

    const store = {
      getPortfolioSnapshotsAscending: (_scenarioId: number, limit: number) => {
        requestedLimit = limit
        return []
      },
    } as unknown as PortfolioRepository & PopularRepository

    const market: LiveNewsGateway = {
      fetchLiveTickers: async () => [],
      fetchLiveNews: async () => [],
    }

    const service = new AutoPortfolioService(store, market, { refreshMs: 60_000, benchmarkSymbol: 'SPY', diversityWeight: 1 })
    service.getSignalCalibration(1, 10)

    expect(requestedLimit).toBe(10)
  })
})
