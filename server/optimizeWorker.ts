import { createConfig } from './config'
import { SqliteStore } from './database'
import { createTimeoutFetcher, OpenDataClient } from './feeds'
import { PortfolioOptimizeRunner } from './portfolioOptimizeRunner'

const config = createConfig()
const store = new SqliteStore(config.dbPath, config.dataDir)
const openData = new OpenDataClient(createTimeoutFetcher(config.fetchTimeoutMs), config.watchlist, config.newsFeedSources)
const historyFetcher = createTimeoutFetcher(Math.max(config.fetchTimeoutMs, 45_000))
const runner = new PortfolioOptimizeRunner(store, openData, historyFetcher, config, 'SPY', 'worker')

console.log(`BoomBoom optimize worker connected to ${store.path}`)
console.log('Run the API with OPTIMIZE_EXECUTOR=external so jobs enqueue without in-process execution.')

const shutdown = async (signal: string) => {
  console.log(`Optimize worker shutting down (${signal})…`)
  runner.stopAcceptingJobs()
  await runner.drain(30_000)
  store.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
