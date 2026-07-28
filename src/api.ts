import type {
  ArticleRecordsResponse,
  CommoditiesResponse,
  CommodityHistoryResponse,
  CommoditySnapshotSummary,
  MarketSignalsResponse,
  NewsResponse,
  OptimizedPortfoliosResponse,
  PopularResponse,
  PopularSnapshotsResponse,
  PortfolioHistoryResponse,
  PortfolioBracketResponse,
  PortfolioBracketMode,
  PortfolioBracketRankScope,
  PortfolioBracketSource,
  PortfolioComparisonResponse,
  PortfolioDecisionProfile,
  PortfolioDecisionResponse,
  PortfolioOptimizeJob,
  PortfolioResponse,
  PortfolioScenario,
  PortfolioScenarioInput,
  PortfolioScenariosResponse,
  PortfolioSignalCalibrationResponse,
  RefreshLogResponse,
  Sp500OptimizePayload,
  TickerWatchlistResponse,
  HealthResponse,
} from './types'

const getJson = async <T>(url: string, failureMessage: string, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(await parseJsonError(response, failureMessage))
  return response.json() as Promise<T>
}

export const parseApiErrorMessage = (data: unknown, fallback: string): string => {
  if (typeof data !== 'object' || data === null || !('error' in data)) return fallback
  const err = (data as { error: unknown }).error
  if (typeof err === 'string') return err
  if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return fallback
}

const parseJsonError = async (response: Response, fallback: string) => {
  try {
    const data: unknown = await response.json()
    return parseApiErrorMessage(data, fallback)
  } catch {
    return fallback
  }
}

export const newsApi = {
  getHealth: (signal?: AbortSignal) => getJson<HealthResponse>('/api/health', 'Health check failed', signal),
  getTopNews: (signal?: AbortSignal) => getJson<NewsResponse>('/api/top-news', 'API request failed', signal),
  getTickers: (signal?: AbortSignal) => getJson<TickerWatchlistResponse>('/api/tickers', 'Ticker watchlist request failed', signal),
  getMarketSignals: (signal?: AbortSignal) => getJson<MarketSignalsResponse>('/api/market-signals', 'Market signals request failed', signal),
  getCommodities: (signal?: AbortSignal) => getJson<CommoditiesResponse>('/api/commodities', 'Commodities request failed', signal),
  getCommodityHistory: (symbol: string, days: number, signal?: AbortSignal) =>
    getJson<CommodityHistoryResponse>(`/api/commodities/history?symbol=${encodeURIComponent(symbol)}&days=${days}`, 'Commodity history request failed', signal),
  getCommoditySnapshots: async (limit = 50, signal?: AbortSignal) =>
    getJson<{ updatedAt: string; snapshots: CommoditySnapshotSummary[] }>(`/api/commodities/snapshots?limit=${limit}`, 'Commodity snapshots request failed', signal),
  getRefreshLog: (page: number, signal?: AbortSignal) => getJson<RefreshLogResponse>(`/api/refresh-log?page=${page}`, 'Refresh log request failed', signal),
  getArticles: (page: number, signal?: AbortSignal) => getJson<ArticleRecordsResponse>(`/api/articles?page=${page}`, 'Article records request failed', signal),
  getDataCenters: (query: string, signal?: AbortSignal, options?: { page?: number; fetchAll?: boolean; limit?: number }) => {
    const params = new URLSearchParams()
    if (options?.fetchAll) {
      params.set('all', '1')
      if (options.limit) params.set('limit', String(options.limit))
    } else {
      params.set('page', String(options?.page ?? 1))
    }
    if (query) params.set('q', query)
    return getJson<ArticleRecordsResponse>(`/api/data-centers?${params.toString()}`, 'Data Centers request failed', signal)
  },
  getPopular: (snapshotId: number | null, signal?: AbortSignal) => getJson<PopularResponse>(snapshotId ? `/api/popular/${snapshotId}` : '/api/popular', 'Popular ranking request failed', signal),
  getPopularSnapshots: (signal?: AbortSignal) => getJson<PopularSnapshotsResponse>('/api/popular/snapshots', 'Popular snapshots request failed', signal),
  getPortfolioScenarios: (signal?: AbortSignal) => getJson<PortfolioScenariosResponse>('/api/portfolio-scenarios', 'Portfolio scenarios request failed', signal),
  getPortfolios: (scenarioId: number, signal?: AbortSignal) =>
    getJson<PortfolioResponse>(`/api/portfolios?scenarioId=${scenarioId}`, 'Portfolio request failed', signal),
  getPortfolioHistory: (page: number, scenarioId: number, signal?: AbortSignal) =>
    getJson<PortfolioHistoryResponse>(`/api/portfolios/history?page=${page}&scenarioId=${scenarioId}`, 'Portfolio history request failed', signal),
  getPortfolioSignalCalibration: (scenarioId: number, signal?: AbortSignal) =>
    getJson<PortfolioSignalCalibrationResponse>(`/api/portfolios/signal-calibration?scenarioId=${scenarioId}`, 'Portfolio signal calibration request failed', signal),
  getPortfolioComparison: (signal?: AbortSignal) =>
    getJson<PortfolioComparisonResponse>('/api/portfolios/comparison?horizons=30,90,365', 'Portfolio comparison request failed', signal),
  getOptimizedPortfolios: (signal?: AbortSignal) =>
    getJson<OptimizedPortfoliosResponse>('/api/optimized-portfolios', 'Optimized portfolio request failed', signal),
  getOptimizedPortfolioComparison: (signal?: AbortSignal) =>
    getJson<PortfolioComparisonResponse>('/api/optimized-portfolios/comparison?horizons=7,30,90,365', 'Optimized portfolio comparison request failed', signal),
  getPortfolioDecisions: (profile: PortfolioDecisionProfile, signal?: AbortSignal) =>
    getJson<PortfolioDecisionResponse>(`/api/portfolio-decisions?profile=${profile}`, 'Portfolio decisions request failed', signal),
  getPortfolioBracket: (input?: { startDate?: string; endDate?: string; mode?: PortfolioBracketMode; source?: PortfolioBracketSource; rankScope?: PortfolioBracketRankScope }, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    if (input?.startDate) params.set('startDate', input.startDate)
    if (input?.endDate) params.set('endDate', input.endDate)
    if (input?.mode) params.set('mode', input.mode)
    if (input?.source) params.set('source', input.source)
    if (input?.rankScope) params.set('rankScope', input.rankScope)
    const query = params.toString()
    return getJson<PortfolioBracketResponse>(`/api/portfolio-decisions/bracket${query ? `?${query}` : ''}`, 'Portfolio bracket request failed', signal)
  },
  createPortfolioScenario: async (input: PortfolioScenarioInput): Promise<PortfolioScenario> => {
    const response = await fetch('/api/portfolio-scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) throw new Error(await parseJsonError(response, 'Create scenario failed'))
    return response.json() as Promise<PortfolioScenario>
  },
  updatePortfolioScenario: async (id: number, input: Partial<PortfolioScenarioInput> | PortfolioScenarioInput): Promise<PortfolioScenario | null> => {
    const response = await fetch(`/api/portfolio-scenarios/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) throw new Error(await parseJsonError(response, 'Update scenario failed'))
    return response.json() as Promise<PortfolioScenario | null>
  },
  deletePortfolioScenario: async (id: number) => {
    const response = await fetch(`/api/portfolio-scenarios/${id}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(await parseJsonError(response, 'Delete scenario failed'))
  },
  enqueuePortfolioOptimize: async (payload: Sp500OptimizePayload): Promise<{ jobId: number }> => {
    const response = await fetch('/api/portfolios/optimize-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (response.status === 409) throw new Error(await parseJsonError(response, 'Optimize job already running'))
    if (!response.ok) throw new Error(await parseJsonError(response, 'Enqueue optimize job failed'))
    return response.json() as Promise<{ jobId: number }>
  },
  getPortfolioOptimizeJob: async (jobId: number): Promise<{ updatedAt: string; job: PortfolioOptimizeJob }> =>
    getJson(`/api/portfolios/optimize-jobs/${jobId}`, 'Optimize job request failed'),
  getArticleFeed: (page: number, query: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({ page: String(page) })
    if (query) params.set('q', query)
    return getJson<ArticleRecordsResponse>(`/api/articles?${params.toString()}`, 'Main feed request failed', signal)
  },
}
