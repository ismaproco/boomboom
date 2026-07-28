import { Elysia } from 'elysia'
import { getRequestId, logError } from './logger'
import { apiError, legacyErrorMessage, statusToErrorCode } from './errors'
import { applyRoutePlugins } from './routePlugins'
import { buildHealthResponse } from './healthService'
import { parseComparisonHorizons, type PortfolioScenarioComparisonService } from './portfolioComparison'
import { parseDecisionProfile, type PortfolioDecisionService } from './portfolioDecisionService'
import type { CommoditiesService } from './commoditiesService'
import type { MarketSignalsService } from './marketSignalsService'
import type { NewsService } from './newsService'
import type { OptimizedPortfolioService } from './optimizedPortfolioService'
import type { AutoPortfolioService } from './portfolio'
import type { PortfolioBacktestService } from './portfolioBacktestService'
import type { PortfolioOptimizeRunner } from './portfolioOptimizeRunner'
import type { PortfolioScenarioService } from './portfolioScenarioService'
import type { PopularSnapshotService } from './popularity'
import { getArticlePageRequest, getPageRequest, parseDecisionRunLimit, parseOptimizeJobBody, parsePositiveIntParam } from './requestParams'
import { parseWithSchema, portfolioBacktestBodySchema, tickerHistorySyncBodySchema } from './requestSchemas'
import type { IntervalScheduler } from './scheduler'
import { serveClient } from './staticFiles'
import type { TickerHistoryService } from './tickerHistoryService'
import type { TickerWatchlistService } from './tickerWatchlistService'

export type ApiRouteDeps = {
  distDir: string
  pingDb: () => boolean
  scheduler: IntervalScheduler
  news: NewsService
  tickerWatchlist: TickerWatchlistService
  tickerHistory: TickerHistoryService
  commodities: CommoditiesService
  marketSignals: MarketSignalsService
  popular: PopularSnapshotService
  portfolios: AutoPortfolioService
  portfolioScenarios: PortfolioScenarioService
  portfolioComparison: PortfolioScenarioComparisonService
  portfolioDecisions: PortfolioDecisionService
  optimizedPortfolios: OptimizedPortfolioService
  portfolioBacktests: PortfolioBacktestService
  portfolioOptimizeRunner: PortfolioOptimizeRunner
}

export const registerApiRoutes = (deps: ApiRouteDeps) => {
  const {
    distDir,
    pingDb,
    scheduler,
    news,
    tickerWatchlist,
    tickerHistory,
    commodities,
    marketSignals,
    popular,
    portfolios,
    portfolioScenarios,
    portfolioComparison,
    portfolioDecisions,
    optimizedPortfolios,
    portfolioBacktests,
    portfolioOptimizeRunner,
  } = deps

  return applyRoutePlugins(new Elysia())
    .derive(({ request }) => ({ requestId: getRequestId(request.headers) }))
    .onAfterHandle(({ response, set }) => {
      const status = typeof set.status === 'number' ? set.status : 200
      if (status < 400) return
      const legacy = legacyErrorMessage(response)
      if (legacy) return apiError(statusToErrorCode(status), legacy)
    })
    .onError(({ error, set, requestId }) => {
      set.status = 500
      logError('request_failed', requestId, {
        err: error instanceof Error ? error.message : String(error),
      })
      return apiError('internal_error', 'Internal server error')
    })
    .get('/api/health', () => buildHealthResponse({ pingDb, scheduler, optimizeRunner: portfolioOptimizeRunner }))
    .get('/api/top-news', () => news.getTopNews())
    .get('/api/tickers', () => tickerWatchlist.getWatchlist())
    .get('/api/commodities', () => commodities.getLatest())
    .post('/api/commodities/refresh', () => commodities.refresh())
    .get('/api/commodities/history', ({ query, set }) => {
      const symbol = typeof query.symbol === 'string' ? query.symbol : ''
      if (!symbol.trim()) {
        set.status = 400
        return apiError('validation_error', 'symbol query parameter is required')
      }
      const days = Number(query.days)
      return commodities.getHistory(symbol, Number.isFinite(days) ? days : 180)
    })
    .get('/api/commodities/snapshots', ({ query }) => {
      const limit = Number(query.limit)
      return commodities.getSnapshots(Number.isFinite(limit) ? limit : 50)
    })
    .get('/api/ticker-history/status', ({ query }) => {
      const symbols =
        typeof query.symbols === 'string' && query.symbols.trim()
          ? query.symbols
              .split(',')
              .map((symbol) => symbol.trim())
              .filter(Boolean)
          : undefined
      return tickerHistory.getStatus(symbols)
    })
    .post('/api/ticker-history/sync', async ({ body, set }) => {
      const parsed = parseWithSchema(tickerHistorySyncBodySchema, body)
      if (!parsed.success) {
        set.status = 400
        return apiError('validation_error', 'Invalid body: optional symbols[] of ticker strings.')
      }
      const symbols = parsed.data.symbols?.map((symbol) => String(symbol).trim()).filter(Boolean)
      return tickerHistory.sync(symbols?.length ? symbols : undefined)
    })
    .get('/api/market-signals', () => marketSignals.getSignals())
    .get('/api/articles', ({ query }) => news.getArticles(getArticlePageRequest(query)))
    .get('/api/data-centers', ({ query }) => news.getDataCenters(getArticlePageRequest(query)))
    .get('/api/popular', () => popular.getLatest())
    .post('/api/popular/ensure', ({ set }) => {
      popular.ensureSnapshot()
      set.status = 202
      return { updatedAt: new Date().toISOString(), ok: true }
    })
    .get('/api/popular/snapshots', () => popular.getSnapshots())
    .get('/api/popular/:snapshotId', ({ params, set }) => {
      const snapshotId = parsePositiveIntParam(params.snapshotId)
      if (!snapshotId) {
        set.status = 400
        return apiError('validation_error', 'Invalid snapshot id')
      }
      return popular.getById(String(snapshotId))
    })
    .get('/api/portfolio-scenarios', () => ({ updatedAt: new Date().toISOString(), scenarios: portfolios.listScenarios() }))
    .post('/api/portfolio-scenarios', ({ body, set }) => {
      const result = portfolioScenarios.create(body)
      set.status = result.status
      return result.body
    })
    .patch('/api/portfolio-scenarios/:id', ({ params, body, set }) => {
      const scenarioId = parsePositiveIntParam(params.id)
      if (!scenarioId) {
        set.status = 400
        return apiError('validation_error', 'Invalid scenario id')
      }
      const result = portfolioScenarios.update(String(scenarioId), body)
      set.status = result.status
      return result.body
    })
    .delete('/api/portfolio-scenarios/:id', ({ params, set }) => {
      const scenarioId = parsePositiveIntParam(params.id)
      if (!scenarioId) {
        set.status = 400
        return apiError('validation_error', 'Invalid scenario id')
      }
      const result = portfolioScenarios.delete(String(scenarioId))
      set.status = result.status
      return result.body
    })
    .get('/api/portfolios', ({ query, set }) => {
      const scenarioId = portfolioScenarios.resolveScenarioId(query)
      if (scenarioId === null) {
        set.status = 404
        return apiError('not_found', 'No portfolio scenarios configured')
      }
      return portfolios.getLatest(scenarioId)
    })
    .get('/api/portfolios/history', ({ query, set }) => {
      const scenarioId = portfolioScenarios.resolveScenarioId(query)
      if (scenarioId === null) {
        set.status = 404
        return apiError('not_found', 'No portfolio scenarios configured')
      }
      const request = getPageRequest(query)
      return portfolios.getHistory(request.page, request.pageSize, scenarioId)
    })
    .get('/api/portfolios/signal-calibration', ({ query, set }) => {
      const scenarioId = portfolioScenarios.resolveScenarioId(query)
      if (scenarioId === null) {
        set.status = 404
        return apiError('not_found', 'No portfolio scenarios configured')
      }
      const rawLimit = Number(query.limit)
      const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(10, Math.floor(rawLimit))) : 80
      return portfolios.getSignalCalibration(scenarioId, limit)
    })
    .get('/api/portfolios/comparison', ({ query }) => portfolioComparison.getComparison(parseComparisonHorizons(query.horizons)))
    .get('/api/portfolio-decisions', ({ query }) => portfolioDecisions.getDecisions(parseDecisionProfile(query.profile)))
    .get('/api/portfolio-decisions/latest', ({ query }) => ({
      updatedAt: new Date().toISOString(),
      run: portfolioDecisions.getLatestRun(parseDecisionProfile(query.profile)),
    }))
    .get('/api/portfolio-decisions/runs', ({ query }) => ({
      updatedAt: new Date().toISOString(),
      runs: portfolioDecisions.getRuns(parseDecisionRunLimit(query.limit)),
    }))
    .get('/api/portfolio-decisions/survivors', ({ query }) => ({
      updatedAt: new Date().toISOString(),
      marketSessionDate: query.date ?? null,
      survivors: portfolioDecisions.getDailySurvivors(query.date),
    }))
    .get('/api/portfolio-decisions/bracket', ({ query }) =>
      portfolioDecisions.getBracket({
        startDate: query.startDate,
        endDate: query.endDate,
        mode: query.mode,
        source: query.source,
        rankScope: query.rankScope,
      }),
    )
    .post('/api/portfolio-decisions/finalize', async ({ query }) => {
      const result = await portfolioDecisions.finalizeDailySurvivors(
        parseDecisionProfile(query.profile),
        typeof query.date === 'string' && query.date ? query.date : undefined,
      )
      return { updatedAt: new Date().toISOString(), ...result }
    })
    .get('/api/optimized-portfolios', () => optimizedPortfolios.getSummary())
    .get('/api/optimized-portfolios/comparison', ({ query }) =>
      portfolioComparison.getComparison(parseComparisonHorizons(query.horizons), 'optimized'),
    )
    .post('/api/portfolios/backtest', async ({ body, set }) => {
      const parsed = parseWithSchema(portfolioBacktestBodySchema, body)
      if (!parsed.success) {
        set.status = 400
        return apiError('validation_error', 'Invalid backtest body: optional scenarioIds[], lookbackDays, feeBps, slippageBps.')
      }
      const result = await portfolioBacktests.runBacktest({
        scenarioIds: parsed.data.scenarioIds,
        lookbackDays: parsed.data.lookbackDays,
        feeBps: parsed.data.feeBps,
        slippageBps: parsed.data.slippageBps,
      })
      if (result.run?.status === 'completed') portfolioBacktests.refreshCandidates(result.run.id)
      return result
    })
    .get('/api/portfolios/backtest/:runId', ({ params, set }) => {
      const runId = parsePositiveIntParam(params.runId)
      if (!runId) {
        set.status = 400
        return apiError('validation_error', 'Invalid run id')
      }
      return portfolioBacktests.getRun(runId)
    })
    .get('/api/portfolios/candidates', () => portfolioBacktests.getCandidates())
    .post('/api/portfolios/optimize-jobs', ({ body, set }) => {
      const parsed = parseOptimizeJobBody(body as Record<string, unknown>)
      if (!parsed) {
        set.status = 400
        return apiError(
          'validation_error',
          'Invalid body: require n (5–50), method (max_sharpe|hrp|black_litterman); optional seed, name, universePolicy, keepCount, scenarioId.',
        )
      }
      const jobId = portfolioOptimizeRunner.enqueue(parsed)
      if (jobId === null) {
        set.status = 409
        return apiError('conflict', 'An optimize job is already queued or running for this scenario.')
      }
      set.status = 202
      return { jobId }
    })
    .get('/api/portfolios/optimize-jobs/:id', ({ params, set }) => {
      const id = parsePositiveIntParam(params.id)
      if (!id) {
        set.status = 400
        return apiError('validation_error', 'Invalid job id')
      }
      const job = portfolioOptimizeRunner.getJob(id)
      if (!job) {
        set.status = 404
        return apiError('not_found', 'Job not found')
      }
      return { updatedAt: new Date().toISOString(), job }
    })
    .get('/api/refresh-log', ({ query }) => news.getRefreshLog(getPageRequest(query)))
    .get('/*', ({ request, set }) => {
      const file = serveClient(distDir, new URL(request.url).pathname)
      if (!file) {
        set.status = 403
        return apiError('validation_error', 'Forbidden path')
      }
      return file
    })
}
