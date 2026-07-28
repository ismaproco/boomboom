import { useEffect, useRef, useState, type RefObject } from 'react'
import { dashboardConfig } from './dashboardConfig'
import { usePageVisibility } from './hooks/usePageVisibility'
import { useAbortableRequest } from './hooks/useAbortableRequest'
import { useCommoditiesDashboard } from './hooks/useCommoditiesDashboard'
import { useFeedPolling } from './hooks/useFeedPolling'
import { usePopularDashboard } from './hooks/usePopularDashboard'
import { usePortfolioDashboard } from './hooks/usePortfolioDashboard'
import { shouldPollMarketSignals } from './hooks/pollingHelpers'
import {
  getInitialMenu,
  getMenuFromPath,
  isMainFeedMenu,
  isSearchableMenu,
  isSectionMenu,
  menuEntries,
  menuRoutes,
  sectionFilters,
  type ActiveMenu,
  type SectionFilter,
  type SignalFilter,
} from './navigation'

const PORTFOLIO_SCENARIO_STORAGE_KEY = 'boomboom.portfolioScenarioId'

export function useNewsDashboard() {
  const pageVisible = usePageVisibility()
  const initialMenu = getInitialMenu()
  const abort = useAbortableRequest()
  const isMountedRef = useRef(false)
  const activeMenuRef = useRef<ActiveMenu>(initialMenu)

  const [activeMenu, setActiveMenu] = useState<ActiveMenu>(initialMenu)
  const [selectedSection, setSelectedSection] = useState<SectionFilter>(
    sectionFilters.some((entry) => entry.label === initialMenu) ? (initialMenu as SectionFilter) : 'Top',
  )
  const [selectedSignal, setSelectedSignal] = useState<SignalFilter | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const hasRunSearchEffectRef = useRef(false)

  activeMenuRef.current = activeMenu

  const feed = useFeedPolling(isMountedRef as RefObject<boolean>, abort)
  const popular = usePopularDashboard(isMountedRef as RefObject<boolean>, abort)
  const markets = useCommoditiesDashboard(isMountedRef as RefObject<boolean>, activeMenuRef as RefObject<ActiveMenu>, abort)

  const portfolio = usePortfolioDashboard(
    isMountedRef as RefObject<boolean>,
    activeMenuRef as RefObject<ActiveMenu>,
    abort,
    (snapshotId) => {
      setActiveMenu('Popular')
      activeMenuRef.current = 'Popular'
      setSelectedSignal(null)
      setIsMobileMenuOpen(false)
      if (window.location.pathname !== menuRoutes.Popular) window.history.pushState(null, '', menuRoutes.Popular)
      void popular.loadPopular(snapshotId, true)
    },
  )

  feed.syncPaginationRefs(
    feed.articleRecords.page,
    feed.dataCentersRecords.page,
    feed.refreshLog.page,
    searchQuery,
  )

  function showMenu(menu: ActiveMenu, updateRoute = true) {
    setActiveMenu(menu)
    activeMenuRef.current = menu
    setSelectedSignal(null)
    setIsMobileMenuOpen(false)
    if (isSectionMenu(menu)) setSelectedSection(menu)
    if (updateRoute && window.location.pathname !== menuRoutes[menu]) window.history.pushState(null, '', menuRoutes[menu])
    void loadActiveMenu(menu, true)
  }

  function loadActiveMenu(menu = activeMenuRef.current, showActivity = false) {
    if (isSectionMenu(menu)) {
      void feed.loadTopNews(showActivity)
      void feed.loadMainFeed(1, false)
      return
    }
    if (menu === 'Tickers') {
      void markets.loadTickerWatchlist(showActivity)
      return
    }
    if (menu === 'Commodities') {
      void markets.loadCommodities(showActivity)
      return
    }
    if (menu === 'Logs') {
      void feed.loadRefreshLog(feed.refreshLogPageRef.current, showActivity)
      return
    }
    if (menu === 'Articles') {
      void feed.loadArticles(feed.articlePageRef.current, showActivity)
      return
    }
    if (menu === 'Data Centers') {
      void feed.loadDataCenters(feed.dataCentersPageRef.current, showActivity)
      return
    }
    if (menu === 'Popular') {
      void popular.loadPopular(popular.selectedPopularSnapshotIdRef.current, showActivity)
      return
    }
    if (menu === 'Portfolios') {
      void portfolio.loadPortfolios(portfolio.portfolioPageRef.current, showActivity)
      return
    }
    if (menu === 'Optimized Portfolio') {
      void portfolio.loadOptimizedPortfolios(showActivity)
      return
    }
    if (menu === 'Portfolio Decisions') void portfolio.loadPortfolioDecisions(undefined, showActivity)
    if (menu === 'Portfolio Playoffs') void portfolio.loadPortfolioBracket(undefined, undefined, showActivity)
  }

  function refreshAll() {
    void loadActiveMenu(activeMenuRef.current, true)
    if (shouldPollMarketSignals(activeMenuRef.current)) void feed.loadMarketSignals(true)
  }

  useEffect(() => {
    if (portfolio.selectedPortfolioScenarioId !== null) {
      localStorage.setItem(PORTFOLIO_SCENARIO_STORAGE_KEY, String(portfolio.selectedPortfolioScenarioId))
    }
  }, [portfolio.selectedPortfolioScenarioId])

  useEffect(() => {
    isMountedRef.current = true
    if (shouldPollMarketSignals(initialMenu)) void feed.loadMarketSignals()
    void loadActiveMenu(initialMenu)
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void loadActiveMenu(activeMenuRef.current)
      if (shouldPollMarketSignals(activeMenuRef.current)) void feed.loadMarketSignals()
    }, dashboardConfig.pollIntervalMs)

    return () => {
      isMountedRef.current = false
      abort.abortAll()
      markets.clearTickerRetry()
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!pageVisible || !isMountedRef.current) return
    void loadActiveMenu(activeMenuRef.current)
    if (shouldPollMarketSignals(activeMenuRef.current)) void feed.loadMarketSignals()
  }, [pageVisible])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isTyping = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable))
      if (isTyping && event.key !== 'Escape') return
      const key = event.key.toLowerCase()
      if (key === '/') {
        event.preventDefault()
        searchInputRef.current?.focus()
        return
      }
      if (key === 'escape') {
        setSearchQuery('')
        setSelectedSignal(null)
        showMenu('Top')
        setIsHelpOpen(false)
        setIsMobileMenuOpen(false)
        searchInputRef.current?.blur()
        return
      }
      if (key === '?' || key === 'h') {
        setIsHelpOpen((value) => !value)
        return
      }
      if (key === 'r') {
        refreshAll()
        return
      }
      const menuMatch = menuEntries.find((entry) => entry.shortcut.toLowerCase() === key)
      if (menuMatch) showMenu(menuMatch.label)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    function handlePopState() {
      showMenu(getMenuFromPath(window.location.pathname), false)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    feed.syncPaginationRefs(feed.articleRecords.page, feed.dataCentersRecords.page, feed.refreshLog.page, searchQuery)
  }, [feed.articleRecords.page, feed.dataCentersRecords.page, feed.refreshLog.page, searchQuery])

  useEffect(() => {
    if (!hasRunSearchEffectRef.current) {
      hasRunSearchEffectRef.current = true
      return
    }
    const menu = activeMenuRef.current
    if (!isSearchableMenu(menu)) return
    const timeout = window.setTimeout(() => {
      if (activeMenuRef.current === 'Data Centers') {
        void feed.loadDataCenters(1, false, searchQuery.trim())
        return
      }
      void feed.loadMainFeed(1, false, searchQuery.trim())
    }, dashboardConfig.searchDebounceMs)
    return () => window.clearTimeout(timeout)
  }, [searchQuery])

  useEffect(() => {
    function handleScroll() {
      const isNewsPage = isMainFeedMenu(activeMenu)
      const hasMore = feed.mainFeed.page * feed.mainFeed.pageSize < feed.mainFeed.total
      const distanceFromBottom = document.documentElement.scrollHeight - window.innerHeight - window.scrollY
      if (!isNewsPage || !hasMore || feed.isMainFeedLoadingRef.current || distanceFromBottom > dashboardConfig.infiniteScrollThresholdPx) return
      void feed.loadMainFeed(feed.mainFeed.page + 1, true)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [activeMenu, feed.mainFeed.page, feed.mainFeed.pageSize, feed.mainFeed.total, searchQuery])

  return {
    activeMenu,
    articleRecords: feed.articleRecords,
    articlesError: feed.articlesError,
    dataCentersError: feed.dataCentersError,
    dataCentersRecords: feed.dataCentersRecords,
    isMarketSignalsLoading: feed.isMarketSignalsLoading,
    isCommoditiesLoading: markets.isCommoditiesLoading,
    isArticlesLoading: feed.isArticlesLoading,
    isDataCentersLoading: feed.isDataCentersLoading,
    isHelpOpen,
    isLogLoading: feed.isLogLoading,
    isMainFeedLoading: feed.isMainFeedLoading,
    isMobileMenuOpen,
    isOptimizedPortfolioLoading: portfolio.isOptimizedPortfolioLoading,
    isPortfolioDecisionLoading: portfolio.isPortfolioDecisionLoading,
    isPortfolioBracketLoading: portfolio.isPortfolioBracketLoading,
    isPortfolioLoading: portfolio.isPortfolioLoading,
    isPopularLoading: popular.isPopularLoading,
    isRefreshing: feed.isRefreshing,
    isTickerLoading: markets.isTickerLoading,
    loadArticles: feed.loadArticles,
    loadError: feed.loadError,
    loadMarketSignals: feed.loadMarketSignals,
    loadPopular: popular.loadPopular,
    loadRefreshLog: feed.loadRefreshLog,
    logError: feed.logError,
    mainFeed: feed.mainFeed,
    marketSignals: feed.marketSignals,
    commodities: markets.commodities,
    commoditiesError: markets.commoditiesError,
    marketSignalsError: feed.marketSignalsError,
    news: feed.news,
    tickerError: markets.tickerError,
    tickerWatchlist: markets.tickerWatchlist,
    popular: popular.popular,
    optimizedPortfolioComparison: portfolio.optimizedPortfolioComparison,
    optimizedPortfolioError: portfolio.optimizedPortfolioError,
    optimizedPortfolios: portfolio.optimizedPortfolios,
    portfolioDecisionError: portfolio.portfolioDecisionError,
    portfolioBracketError: portfolio.portfolioBracketError,
    portfolioDecisionProfile: portfolio.portfolioDecisionProfile,
    portfolioDecisions: portfolio.portfolioDecisions,
    portfolioBracket: portfolio.portfolioBracket,
    portfolioBracketIntraday: portfolio.portfolioBracketIntraday,
    portfolioError: portfolio.portfolioError,
    portfolioOptimizeJob: portfolio.portfolioOptimizeJob,
    isPortfolioOptimizeRunning: portfolio.isPortfolioOptimizeRunning,
    runPortfolioOptimize: portfolio.runPortfolioOptimize,
    portfolioHistory: portfolio.portfolioHistory,
    portfolioComparison: portfolio.portfolioComparison,
    portfolioSignalCalibration: portfolio.portfolioSignalCalibration,
    portfolioScenarios: portfolio.portfolioScenarios,
    portfolios: portfolio.portfolios,
    removePortfolioScenario: portfolio.removePortfolioScenario,
    renamePortfolioScenario: portfolio.renamePortfolioScenario,
    savePortfolioScenario: portfolio.savePortfolioScenario,
    selectPortfolioScenario: portfolio.selectPortfolioScenario,
    selectPortfolioDecisionProfile: portfolio.selectPortfolioDecisionProfile,
    loadPortfolioBracket: portfolio.loadPortfolioBracket,
    selectedPortfolioScenarioId: portfolio.selectedPortfolioScenarioId,
    popularError: popular.popularError,
    popularSnapshots: popular.popularSnapshots,
    refreshAll,
    refreshLog: feed.refreshLog,
    searchInputRef,
    searchQuery,
    selectedPopularSnapshotId: popular.selectedPopularSnapshotId,
    selectedSection,
    selectedSignal,
    setIsHelpOpen,
    setIsMobileMenuOpen,
    setSearchQuery,
    setSelectedSignal,
    showMenu,
    loadPortfolios: portfolio.loadPortfolios,
    openTrendingSnapshotFromPortfolio: portfolio.openTrendingSnapshotFromPortfolio,
    status: feed.status,
    shouldShowMarketSignals: shouldPollMarketSignals(activeMenu),
  }
}
