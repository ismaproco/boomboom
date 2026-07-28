import type { QuantMethod, QuantUniversePolicy, TopNewsResponse } from './core'

export type SchedulerTaskStatus = {
  name: string
  intervalMs: number
  running: boolean
  lastStartedAt: string | null
  lastFinishedAt: string | null
  lastError: string | null
  skippedOverlaps: number
}

export type OptimizeQueueStatus = {
  inMemoryQueued: number
  running: boolean
  maxInMemoryQueue: number
  db: {
    queued: number
    running: number
  }
}

export type HealthResponse = {
  ok: boolean
  version: string
  uptimeMs: number
  db: { ok: boolean; error?: string }
  scheduler?: SchedulerTaskStatus[]
  optimizeQueue?: OptimizeQueueStatus
}

/** Client alias for {@link TopNewsResponse}. */
export type NewsResponse = TopNewsResponse

export type Sp500OptimizePayload = {
  n: number
  method: QuantMethod
  seed?: number
  name?: string
  universePolicy?: QuantUniversePolicy
  keepCount?: number
  scenarioId?: number
}
