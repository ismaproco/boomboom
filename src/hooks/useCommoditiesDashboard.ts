import { useRef, useState, type RefObject } from 'react'
import { newsApi } from '../api'
import type { ActiveMenu } from '../navigation'
import type { CommoditiesResponse, TickerWatchlistResponse } from '../types'
import { getEmptyCommodities, getEmptyTickerWatchlist } from './dashboardEmptyState'
import { isAbortError, type RequestKey } from './useAbortableRequest'

type AbortApi = {
  createRequestSignal: (key: RequestKey) => AbortSignal
  clearRequestSignal: (key: RequestKey, signal: AbortSignal) => void
}

export function useCommoditiesDashboard(isMountedRef: RefObject<boolean>, activeMenuRef: RefObject<ActiveMenu>, abort: AbortApi) {
  const [tickerWatchlist, setTickerWatchlist] = useState<TickerWatchlistResponse>(getEmptyTickerWatchlist)
  const [commodities, setCommodities] = useState<CommoditiesResponse>(getEmptyCommodities)
  const [isTickerLoading, setIsTickerLoading] = useState(false)
  const [isCommoditiesLoading, setIsCommoditiesLoading] = useState(false)
  const [tickerError, setTickerError] = useState<string | null>(null)
  const [commoditiesError, setCommoditiesError] = useState<string | null>(null)
  const tickerRetryTimeoutRef = useRef<number | null>(null)

  function clearTickerRetry() {
    if (tickerRetryTimeoutRef.current === null) return
    window.clearTimeout(tickerRetryTimeoutRef.current)
    tickerRetryTimeoutRef.current = null
  }

  function scheduleTickerRetry(data: TickerWatchlistResponse) {
    clearTickerRetry()
    const hasLivePrices = data.items.some((item) => item.price !== null)
    if (activeMenuRef.current !== 'Tickers' || data.source !== 'fallback' || hasLivePrices) return
    tickerRetryTimeoutRef.current = window.setTimeout(() => {
      tickerRetryTimeoutRef.current = null
      if (activeMenuRef.current === 'Tickers') void loadTickerWatchlist(false)
    }, 3_000)
  }

  async function loadTickerWatchlist(showActivity = false) {
    if (showActivity) setIsTickerLoading(true)
    const signal = abort.createRequestSignal('tickers')
    try {
      const data = await newsApi.getTickers(signal)
      if (!isMountedRef.current) return
      setTickerWatchlist(data)
      setTickerError(null)
      scheduleTickerRetry(data)
    } catch (error) {
      if (isAbortError(error)) return
      if (!isMountedRef.current) return
      setTickerWatchlist(getEmptyTickerWatchlist())
      setTickerError(error instanceof Error ? error.message : 'Unable to load ticker watchlist')
    } finally {
      abort.clearRequestSignal('tickers', signal)
      if (!signal.aborted && showActivity && isMountedRef.current) setIsTickerLoading(false)
    }
  }

  async function loadCommodities(showActivity = false) {
    if (showActivity) setIsCommoditiesLoading(true)
    const signal = abort.createRequestSignal('commodities')
    try {
      const data = await newsApi.getCommodities(signal)
      if (!isMountedRef.current) return
      setCommodities(data)
      setCommoditiesError(null)
    } catch (error) {
      if (isAbortError(error)) return
      if (!isMountedRef.current) return
      setCommodities(getEmptyCommodities())
      setCommoditiesError(error instanceof Error ? error.message : 'Unable to load commodities')
    } finally {
      abort.clearRequestSignal('commodities', signal)
      if (!signal.aborted && showActivity && isMountedRef.current) setIsCommoditiesLoading(false)
    }
  }

  return {
    tickerWatchlist,
    commodities,
    isTickerLoading,
    isCommoditiesLoading,
    tickerError,
    commoditiesError,
    loadTickerWatchlist,
    loadCommodities,
    clearTickerRetry,
  }
}
