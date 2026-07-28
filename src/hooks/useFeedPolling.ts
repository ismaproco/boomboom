import { useRef, useState, type RefObject } from 'react'
import { newsApi } from '../api'
import { fallbackNews } from '../fallbackData'
import type { ArticleRecordsResponse, MarketSignalsResponse, NewsResponse, RefreshLogResponse } from '../types'
import { dedupeStoryList } from '../storyRules'
import { getEmptyArticleRecords, getEmptyMarketSignals, getEmptyRefreshLog } from './dashboardEmptyState'
import { isAbortError, type RequestKey } from './useAbortableRequest'

type AbortApi = {
  createRequestSignal: (key: RequestKey) => AbortSignal
  clearRequestSignal: (key: RequestKey, signal: AbortSignal) => void
}

export function useFeedPolling(isMountedRef: RefObject<boolean>, abort: AbortApi) {
  const [news, setNews] = useState<NewsResponse>(fallbackNews)
  const [marketSignals, setMarketSignals] = useState<MarketSignalsResponse>(getEmptyMarketSignals)
  const [refreshLog, setRefreshLog] = useState<RefreshLogResponse>(getEmptyRefreshLog)
  const [articleRecords, setArticleRecords] = useState<ArticleRecordsResponse>(() => getEmptyArticleRecords())
  const [mainFeed, setMainFeed] = useState<ArticleRecordsResponse>(() => getEmptyArticleRecords(0))
  const [dataCentersRecords, setDataCentersRecords] = useState<ArticleRecordsResponse>(() => getEmptyArticleRecords())
  const [status, setStatus] = useState<'loading' | 'live' | 'stale' | 'fallback' | 'offline'>('loading')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isMarketSignalsLoading, setIsMarketSignalsLoading] = useState(false)
  const [isLogLoading, setIsLogLoading] = useState(false)
  const [isArticlesLoading, setIsArticlesLoading] = useState(false)
  const [isMainFeedLoading, setIsMainFeedLoading] = useState(false)
  const [isDataCentersLoading, setIsDataCentersLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [marketSignalsError, setMarketSignalsError] = useState<string | null>(null)
  const [logError, setLogError] = useState<string | null>(null)
  const [articlesError, setArticlesError] = useState<string | null>(null)
  const [dataCentersError, setDataCentersError] = useState<string | null>(null)

  const mainFeedRequestRef = useRef(0)
  const isMainFeedLoadingRef = useRef(false)
  const articlePageRef = useRef(1)
  const dataCentersPageRef = useRef(1)
  const refreshLogPageRef = useRef(1)
  const searchQueryRef = useRef('')

  isMainFeedLoadingRef.current = isMainFeedLoading

  function setMainFeedLoading(value: boolean) {
    isMainFeedLoadingRef.current = value
    setIsMainFeedLoading(value)
  }

  function syncPaginationRefs(articlePage: number, dataCentersPage: number, refreshLogPage: number, searchQuery: string) {
    articlePageRef.current = articlePage
    dataCentersPageRef.current = dataCentersPage
    refreshLogPageRef.current = refreshLogPage
    searchQueryRef.current = searchQuery
  }

  async function loadTopNews(showActivity = false) {
    if (showActivity) setIsRefreshing(true)
    const signal = abort.createRequestSignal('topNews')
    try {
      const data = await newsApi.getTopNews(signal)
      if (!isMountedRef.current) return
      setNews(data)
      setStatus(data.dataSource ?? 'fallback')
      setLoadError(data.refreshError ?? null)
    } catch (error) {
      if (isAbortError(error)) return
      if (!isMountedRef.current) return
      setStatus('offline')
      setLoadError(error instanceof Error ? error.message : 'Unable to load news')
    } finally {
      abort.clearRequestSignal('topNews', signal)
      if (!signal.aborted && showActivity && isMountedRef.current) setIsRefreshing(false)
    }
  }

  async function loadMarketSignals(showActivity = false) {
    if (showActivity) setIsMarketSignalsLoading(true)
    const signal = abort.createRequestSignal('marketSignals')
    try {
      const data = await newsApi.getMarketSignals(signal)
      if (!isMountedRef.current) return
      setMarketSignals(data)
      setMarketSignalsError(null)
    } catch (error) {
      if (isAbortError(error)) return
      if (!isMountedRef.current) return
      setMarketSignalsError(error instanceof Error ? error.message : 'Unable to load market signals')
    } finally {
      abort.clearRequestSignal('marketSignals', signal)
      if (!signal.aborted && showActivity && isMountedRef.current) setIsMarketSignalsLoading(false)
    }
  }

  async function loadRefreshLog(page = refreshLogPageRef.current, showActivity = false) {
    if (showActivity) setIsLogLoading(true)
    const signal = abort.createRequestSignal('refreshLog')
    try {
      const data = await newsApi.getRefreshLog(page, signal)
      if (!isMountedRef.current) return
      setRefreshLog(data)
      refreshLogPageRef.current = page
      setLogError(null)
    } catch (error) {
      if (isAbortError(error)) return
      if (!isMountedRef.current) return
      setLogError(error instanceof Error ? error.message : 'Unable to load refresh log')
    } finally {
      abort.clearRequestSignal('refreshLog', signal)
      if (!signal.aborted && showActivity && isMountedRef.current) setIsLogLoading(false)
    }
  }

  async function loadArticles(page = articlePageRef.current, showActivity = false) {
    if (showActivity) setIsArticlesLoading(true)
    const signal = abort.createRequestSignal('articles')
    try {
      const data = await newsApi.getArticles(page, signal)
      if (!isMountedRef.current) return
      setArticleRecords(data)
      articlePageRef.current = page
      setArticlesError(null)
    } catch (error) {
      if (isAbortError(error)) return
      if (!isMountedRef.current) return
      setArticlesError(error instanceof Error ? error.message : 'Unable to load article records')
    } finally {
      abort.clearRequestSignal('articles', signal)
      if (!signal.aborted && showActivity && isMountedRef.current) setIsArticlesLoading(false)
    }
  }

  async function loadDataCenters(page = dataCentersPageRef.current, showActivity = false, query = searchQueryRef.current.trim()) {
    if (showActivity) setIsDataCentersLoading(true)
    const signal = abort.createRequestSignal('dataCenters')
    try {
      const data = await newsApi.getDataCenters(query, signal, { fetchAll: true, limit: 500 })
      if (!isMountedRef.current) return
      setDataCentersRecords({ ...data, page })
      dataCentersPageRef.current = page
      setDataCentersError(null)
    } catch (error) {
      if (isAbortError(error)) return
      if (!isMountedRef.current) return
      setDataCentersError(error instanceof Error ? error.message : 'Unable to load data center stories')
    } finally {
      abort.clearRequestSignal('dataCenters', signal)
      if (!signal.aborted && showActivity && isMountedRef.current) setIsDataCentersLoading(false)
    }
  }

  async function loadMainFeed(page: number, append = true, query = searchQueryRef.current.trim()) {
    if (isMainFeedLoadingRef.current && append) return
    const requestId = mainFeedRequestRef.current + 1
    mainFeedRequestRef.current = requestId
    setMainFeedLoading(true)
    const signal = abort.createRequestSignal('mainFeed')
    try {
      const data = await newsApi.getArticleFeed(page, query, signal)
      if (!isMountedRef.current || requestId !== mainFeedRequestRef.current) return
      setMainFeed((current) => ({
        ...data,
        articles: append ? dedupeStoryList([...current.articles, ...data.articles]) : data.articles,
      }))
    } catch (error) {
      if (isAbortError(error)) return
      if (!isMountedRef.current || requestId !== mainFeedRequestRef.current) return
      setLoadError(error instanceof Error ? error.message : 'Unable to load more news')
    } finally {
      abort.clearRequestSignal('mainFeed', signal)
      if (!signal.aborted && isMountedRef.current && requestId === mainFeedRequestRef.current) setMainFeedLoading(false)
    }
  }

  return {
    news,
    marketSignals,
    refreshLog,
    articleRecords,
    mainFeed,
    dataCentersRecords,
    status,
    isRefreshing,
    isMarketSignalsLoading,
    isLogLoading,
    isArticlesLoading,
    isMainFeedLoading,
    isDataCentersLoading,
    isMainFeedLoadingRef,
    loadError,
    marketSignalsError,
    logError,
    articlesError,
    dataCentersError,
    articlePageRef,
    dataCentersPageRef,
    refreshLogPageRef,
    searchQueryRef,
    loadTopNews,
    loadMarketSignals,
    loadRefreshLog,
    loadArticles,
    loadDataCenters,
    loadMainFeed,
    syncPaginationRefs,
  }
}
