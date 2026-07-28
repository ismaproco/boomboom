import { describe, expect, test } from 'bun:test'
import type { IntervalScheduler } from './scheduler'
import { buildHealthResponse } from './healthService'

const scheduler = {
  getStatus: () => [],
} as unknown as IntervalScheduler

describe('buildHealthResponse', () => {
  test('includes optimize queue when HEALTH_OPTIMIZE_QUEUE=1', () => {
    const previous = Bun.env.HEALTH_OPTIMIZE_QUEUE
    Bun.env.HEALTH_OPTIMIZE_QUEUE = '1'
    try {
      const response = buildHealthResponse({
        pingDb: () => true,
        scheduler,
        optimizeRunner: {
          getQueueStatus: () => ({
            inMemoryQueued: 1,
            running: false,
            maxInMemoryQueue: 3,
            db: { queued: 2, running: 0 },
          }),
        } as never,
      })
      expect(response.optimizeQueue).toEqual({
        inMemoryQueued: 1,
        running: false,
        maxInMemoryQueue: 3,
        db: { queued: 2, running: 0 },
      })
    } finally {
      if (previous === undefined) delete Bun.env.HEALTH_OPTIMIZE_QUEUE
      else Bun.env.HEALTH_OPTIMIZE_QUEUE = previous
    }
  })

  test('omits optimize queue by default', () => {
    const previous = Bun.env.HEALTH_OPTIMIZE_QUEUE
    delete Bun.env.HEALTH_OPTIMIZE_QUEUE
    try {
      const response = buildHealthResponse({
        pingDb: () => true,
        scheduler,
        optimizeRunner: {
          getQueueStatus: () => ({
            inMemoryQueued: 0,
            running: false,
            maxInMemoryQueue: 3,
            db: { queued: 0, running: 0 },
          }),
        } as never,
      })
      expect(response.optimizeQueue).toBeUndefined()
    } finally {
      if (previous !== undefined) Bun.env.HEALTH_OPTIMIZE_QUEUE = previous
    }
  })
})
