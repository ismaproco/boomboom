import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HealthResponse, OptimizeQueueStatus } from '../shared/types'
import type { IntervalScheduler } from './scheduler'
import type { PortfolioOptimizeRunner } from './portfolioOptimizeRunner'

export type { HealthResponse } from '../shared/types'

const readAppVersion = () => {
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const appVersion = readAppVersion()
const startedAt = Date.now()

export type HealthDeps = {
  pingDb: () => boolean
  scheduler: IntervalScheduler
  optimizeRunner?: PortfolioOptimizeRunner
}

export const buildHealthResponse = ({ pingDb, scheduler, optimizeRunner }: HealthDeps): HealthResponse => {
  let dbOk = false
  let dbError: string | undefined
  try {
    dbOk = pingDb()
  } catch (error) {
    dbError = error instanceof Error ? error.message : 'db ping failed'
  }
  const includeScheduler = Bun.env.HEALTH_SCHEDULER_DETAILS === '1'
  const includeOptimizeQueue = Bun.env.HEALTH_OPTIMIZE_QUEUE === '1'

  let optimizeQueue: OptimizeQueueStatus | undefined
  if (includeOptimizeQueue && optimizeRunner) {
    optimizeQueue = optimizeRunner.getQueueStatus()
  }

  return {
    ok: dbOk,
    version: appVersion,
    uptimeMs: Date.now() - startedAt,
    db: dbOk ? { ok: true } : { ok: false, error: dbError ?? 'unavailable' },
    ...(includeScheduler ? { scheduler: scheduler.getStatus() } : {}),
    ...(optimizeQueue ? { optimizeQueue } : {}),
  }
}
