import { describe, expect, test } from 'bun:test'
import { PortfolioCacheCoordinator } from './portfolioCacheCoordinator'

describe('PortfolioCacheCoordinator', () => {
  test('warmAll logs rejections without throwing', async () => {
    const comparison = {
      warmComparison: async () => {
        throw new Error('warm failed')
      },
    }
    const optimized = { warmSummary: async () => {} }
    const decisions = { warmDecisions: async () => {} }
    const signals = { warmSignals: async () => {} }
    const coordinator = new PortfolioCacheCoordinator(
      comparison as never,
      optimized as never,
      decisions as never,
      signals as never,
      () => undefined,
    )

    await expect(coordinator.warmAll('test')).resolves.toBeUndefined()
  })
})
