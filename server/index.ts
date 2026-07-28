import { buildRuntime, createApp } from './appFactory'

const runtime = buildRuntime()
const { config, store, scheduler, portfolioCaches, portfolioOptimizeRunner } = runtime

scheduler.start()
void portfolioCaches.warmAll('startup')

const app = createApp(runtime).listen({ hostname: config.hostname, port: config.port })

let shuttingDown = false
const shutdown = async (signal: string) => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Shutting down (${signal})…`)
  scheduler.stop()
  portfolioOptimizeRunner.stopAcceptingJobs()
  await portfolioOptimizeRunner.drain(30_000)
  app.stop()
  store.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

console.log(`BoomBoom app running at http://${app.server?.hostname}:${app.server?.port}`)
console.log(`SQLite database: ${store.path}`)
console.log(`Watchlist symbols: ${config.watchlist.join(',')}`)
console.log(`Live data refresh interval: ${config.dataRefreshMs / 1000}s`)
console.log(`Auto portfolio interval: ${config.portfolioRefreshMs / 1000}s`)
console.log(`Quant reoptimize check: 60s (interval ${config.portfolioQuantReoptimizeMs / 1000}s per scenario)`)
