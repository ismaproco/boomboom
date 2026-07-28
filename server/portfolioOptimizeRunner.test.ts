import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createConfig } from './config'
import { SqliteStore } from './database'
import { createTimeoutFetcher } from './feeds'
import { PortfolioOptimizeRunner } from './portfolioOptimizeRunner'

let testDir = ''
let store: SqliteStore

const createTestConfig = () => ({
  ...createConfig(),
  // These tests exercise admission and conflict behavior, not job execution.
  // Keeping execution external prevents a background pump from outliving the
  // per-test SQLite store on faster CI runners.
  optimizeExecutor: 'external' as const,
})

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'boomboom-opt-'))
  store = new SqliteStore(join(testDir, 'opt.sqlite'), testDir)
})

afterEach(() => {
  store.close()
  if (testDir) rmSync(testDir, { recursive: true, force: true })
  testDir = ''
})

describe('PortfolioOptimizeRunner', () => {
  test('enqueue returns null when not accepting jobs', () => {
    const config = createTestConfig()
    const fetcher = createTimeoutFetcher(config.fetchTimeoutMs)
    const runner = new PortfolioOptimizeRunner(store, { fetchLiveTickers: async () => [], fetchLiveNews: async () => [] }, fetcher, config)
    runner.stopAcceptingJobs()
    const jobId = runner.enqueue({ n: 10, method: 'max_sharpe' })
    expect(jobId).toBeNull()
  })

  test('enqueue returns null when scenario already has active job', () => {
    const config = createTestConfig()
    const fetcher = createTimeoutFetcher(config.fetchTimeoutMs)
    const runner = new PortfolioOptimizeRunner(store, { fetchLiveTickers: async () => [], fetchLiveNews: async () => [] }, fetcher, config)
    const scenarioId = store.insertPortfolioScenario({
      name: 'Test Quant',
      symbols: ['SPY', 'QQQ'],
      noveltyProfile: 'medium',
      maxWeightPerAsset: 0.15,
      refreshMode: 'quant',
      quantMethod: 'max_sharpe',
      quantTargetN: 10,
    })
    const first = runner.enqueue({ n: 10, method: 'max_sharpe', scenarioId })
    expect(first).not.toBeNull()
    const second = runner.enqueue({ n: 10, method: 'hrp', scenarioId })
    expect(second).toBeNull()
  })
})
