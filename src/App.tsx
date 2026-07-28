import { lazy, Suspense, useEffect, useState } from 'react'
import { isSearchableMenu, menuEntries } from './navigation'
import { CommoditiesDashboard, DataCentersDashboard, MarketSignalsSummary, RawArticlesTable, PopularDashboard, RefreshLogDashboard, TickerWatchlistDashboard } from './dashboards'

const PortfolioDashboard = lazy(() => import('./dashboards/portfolio/portfolioCharts').then((m) => ({ default: m.PortfolioDashboard })))
const OptimizedPortfolioDashboard = lazy(() => import('./dashboards/portfolio/portfolioCharts').then((m) => ({ default: m.OptimizedPortfolioDashboard })))
const PortfolioDecisionDashboard = lazy(() => import('./dashboards/portfolio/portfolioCharts').then((m) => ({ default: m.PortfolioDecisionDashboard })))
const PortfolioPlayoffsDashboard = lazy(() => import('./dashboards/portfolio/portfolioCharts').then((m) => ({ default: m.PortfolioPlayoffsDashboard })))

const ChartDashboardFallback = () => (
  <div className="rounded-lg border border-[color:var(--border)] p-6 text-sm text-[color:var(--muted)]">Loading dashboard…</div>
)
import { formatTerminalTime } from './formatters'
import { getImpactTone, getSectionTone, getSourceTone, SectionHeader, ShortcutRow, StoryLabel, TopMenuButton } from './presentation'
import { dedupeStoryList, getSourceGroup, inferDisplaySection, storyMatchesSection, storyMatchesSignal } from './storyRules'
import { useNewsDashboard } from './useNewsDashboard'

const themeStorageKey = 'boomboom-theme'
const themeOptions = [
  { value: 'warm-reader', label: 'Warm Reader' },
  { value: 'high-contrast', label: 'High Contrast' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'light', label: 'Light' },
] as const

type AppTheme = (typeof themeOptions)[number]['value']

const isAppTheme = (value: string | null): value is AppTheme => themeOptions.some((theme) => theme.value === value)

const getInitialTheme = (): AppTheme => {
  if (typeof window === 'undefined') return 'midnight'
  const storedTheme = window.localStorage.getItem(themeStorageKey)
  return isAppTheme(storedTheme) ? storedTheme : 'midnight'
}

function App() {
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme)
  const {
    activeMenu,
    articleRecords,
    articlesError,
    commodities,
    commoditiesError,
    dataCentersError,
    dataCentersRecords,
    isArticlesLoading,
    isDataCentersLoading,
    isCommoditiesLoading,
    isHelpOpen,
    isLogLoading,
    isMainFeedLoading,
    isMarketSignalsLoading,
    isMobileMenuOpen,
    isOptimizedPortfolioLoading,
    isPortfolioDecisionLoading,
    isPortfolioBracketLoading,
    isPortfolioLoading,
    isPortfolioOptimizeRunning,
    isPopularLoading,
    isRefreshing,
    isTickerLoading,
    loadArticles,
    loadError,
    loadPortfolios,
    loadPortfolioBracket,
    openTrendingSnapshotFromPortfolio,
    runPortfolioOptimize,
    loadPopular,
    loadRefreshLog,
    logError,
    mainFeed,
    marketSignals,
    marketSignalsError,
    news,
    optimizedPortfolioComparison,
    optimizedPortfolioError,
    optimizedPortfolios,
    portfolioDecisionError,
    portfolioBracketError,
    portfolioDecisionProfile,
    portfolioDecisions,
    portfolioBracket,
    portfolioBracketIntraday,
    portfolioError,
    portfolioComparison,
    portfolioSignalCalibration,
    portfolioOptimizeJob,
    portfolioHistory,
    portfolioScenarios,
    portfolios,
    removePortfolioScenario,
    renamePortfolioScenario,
    savePortfolioScenario,
    selectPortfolioScenario,
    selectPortfolioDecisionProfile,
    selectedPortfolioScenarioId,
    popular,
    popularError,
    popularSnapshots,
    refreshAll,
    refreshLog,
    searchInputRef,
    searchQuery,
    selectedPopularSnapshotId,
    selectedSection,
    selectedSignal,
    setIsHelpOpen,
    setIsMobileMenuOpen,
    setSearchQuery,
    setSelectedSignal,
    showMenu,
    shouldShowMarketSignals,
    status,
    tickerError,
    tickerWatchlist,
  } = useNewsDashboard()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme === 'light' || theme === 'warm-reader' ? 'light' : 'dark'
    window.localStorage.setItem(themeStorageKey, theme)
  }, [theme])

  const updatedTime = new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(news.updatedAt))

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const allStories = normalizedSearch ? mainFeed.articles : dedupeStoryList([news.lead, ...news.stories, ...mainFeed.articles])
  const filteredStories = allStories.filter((story) => {
    const searchText = `${story.headline} ${story.summary} ${story.section} ${story.source}`.toLowerCase()
    return storyMatchesSection(story, selectedSection) && storyMatchesSignal(story, selectedSignal) && (!normalizedSearch || searchText.includes(normalizedSearch))
  })
  const matchingStoryCount = normalizedSearch ? mainFeed.total : filteredStories.length
  const featuredStory = filteredStories[0]
  const storyList = filteredStories.slice(1)
  const visibleTickers = news.tickers.slice(0, 8)
  const apiStatus = status === 'live' ? 'Live feed' : status === 'stale' ? 'Stale feed' : status === 'fallback' ? 'Fallback data' : status === 'loading' ? 'Loading' : 'Offline'
  const lastRefreshTime = news.lastRefreshAt ? formatTerminalTime(news.lastRefreshAt) : '--:--:--'
  const nextRefreshTime = news.nextRefreshAt ? formatTerminalTime(news.nextRefreshAt) : '--:--:--'
  const statusTone = status === 'live' ? 'bg-emerald-400 text-slate-950' : status === 'offline' ? 'bg-red-400 text-slate-950' : status === 'loading' ? 'bg-sky-300 text-slate-950' : 'bg-violet-300 text-slate-950'
  const isLoadingAnyDashboard = isRefreshing || isTickerLoading || isCommoditiesLoading || isMarketSignalsLoading || isLogLoading || isArticlesLoading || isDataCentersLoading || isPopularLoading || isPortfolioLoading || isOptimizedPortfolioLoading || isPortfolioDecisionLoading || isPortfolioBracketLoading || isPortfolioOptimizeRunning || isMainFeedLoading

  return (
    <main data-theme={theme} className="min-h-dvh bg-slate-950 px-3 py-3 text-slate-100 sm:px-4 lg:px-5">
      <div className="mx-auto flex max-w-[95rem] flex-col gap-3">
        <header className="overflow-hidden rounded-sm border border-cyan-300/20 bg-slate-900/90 shadow-2xl shadow-cyan-950/20">
          <div className="bg-cyan-300 px-4 py-3 text-slate-950 sm:px-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.35em]">BoomBoom News</p>
                <h1 className="mt-1 text-lg/5 font-black tracking-tight sm:text-2xl/7">Market-moving headlines with source links and fast filters.</h1>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-black uppercase sm:flex sm:flex-wrap sm:justify-end">
                <label className="sr-only" htmlFor="theme-select">Theme</label>
                <select
                  id="theme-select"
                  className="rounded-sm border border-slate-950/20 bg-slate-950 px-2.5 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-cyan-100 outline-hidden transition focus:border-slate-950 focus:ring-3 focus:ring-slate-950/20"
                  value={theme}
                  onChange={(event) => setTheme(event.target.value as AppTheme)}
                >
                  {themeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <span className={`rounded-sm px-2.5 py-1.5 ${statusTone}`}>{apiStatus}</span>
                <span className="rounded-sm bg-slate-950 px-2.5 py-1.5 text-cyan-100">Last {updatedTime}</span>
                <span className="rounded-sm bg-slate-950 px-2.5 py-1.5 text-cyan-100">Mkt {(news.marketSource ?? 'fallback').toUpperCase()}</span>
                <span className="rounded-sm bg-slate-950 px-2.5 py-1.5 text-cyan-100">News {(news.newsSource ?? 'fallback').toUpperCase()}</span>
              </div>
            </div>
          </div>

          <nav className="border-b border-white/10 bg-slate-950/80 px-3 py-2" aria-label="News filters">
            <div className="flex items-center justify-between gap-3 sm:hidden">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Current Page</p>
                <p className="text-sm/5 font-black uppercase tracking-[0.16em] text-cyan-100">{activeMenu}</p>
              </div>
              <button
                className="rounded-sm border border-white/10 px-3 py-2 text-sm/5 font-black uppercase tracking-[0.14em] text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-100"
                type="button"
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-top-menu"
                onClick={() => setIsMobileMenuOpen((value) => !value)}
              >
                Menu
              </button>
            </div>

            <div id="mobile-top-menu" className={`${isMobileMenuOpen ? 'grid' : 'hidden'} mt-2 gap-1.5 sm:hidden`}>
              {menuEntries.map((entry) => <TopMenuButton key={entry.label} entry={entry} isActive={activeMenu === entry.label} onSelect={showMenu} />)}
            </div>

            <div className="hidden flex-wrap gap-1.5 sm:flex">
              {menuEntries.map((entry) => <TopMenuButton key={entry.label} entry={entry} isActive={activeMenu === entry.label} onSelect={showMenu} />)}
            </div>
          </nav>

          <div className="grid gap-px bg-white/10 sm:grid-cols-4 xl:grid-cols-8">
            {visibleTickers.map((ticker) => {
              const isDown = ticker.change.startsWith('-')

              return (
                <article key={ticker.symbol} className="bg-slate-950/75 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">{ticker.symbol}</p>
                    <p className={isDown ? 'font-mono text-sm/5 font-black text-red-300' : 'font-mono text-sm/5 font-black text-emerald-300'}>{ticker.change}</p>
                  </div>
                  <p className="mt-1 font-mono text-lg/5 font-black text-white">{ticker.value}</p>
                </article>
              )
            })}
          </div>
        </header>

        <section className="grid gap-3">
          <div className="flex min-w-0 flex-col gap-3">
            <section className="rounded-sm border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/30 sm:p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Command Center</p>
                  <h2 className="mt-1 text-lg/5 font-black tracking-tight text-white">
                    {activeMenu === 'Logs'
                      ? 'Backend gathering log'
                      : activeMenu === 'Tickers'
                        ? `${tickerWatchlist.items.length} watched tickers`
                      : activeMenu === 'Articles'
                        ? `${articleRecords.total} stored articles`
                        : activeMenu === 'Popular'
                          ? 'Trending 100'
                          : activeMenu === 'Portfolios'
                            ? 'Auto Portfolios'
                          : activeMenu === 'Optimized Portfolio'
                            ? 'Optimized Portfolio'
                          : activeMenu === 'Portfolio Decisions'
                            ? 'Daily Portfolio Decisions'
                          : activeMenu === 'Portfolio Playoffs'
                            ? 'Portfolio Playoffs'
                          : activeMenu === 'Data Centers'
                            ? `${dataCentersRecords.total} data center signals`
                            : `${matchingStoryCount} matching stories`}
                  </h2>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {isSearchableMenu(activeMenu) && (
                    <>
                      <label className="sr-only" htmlFor="story-search">Search stories</label>
                      <input
                        ref={searchInputRef}
                        id="story-search"
                        className="min-w-0 rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-sm/5 text-white outline-hidden transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-3 focus:ring-cyan-300/20 sm:min-w-72"
                        placeholder="Search headlines, sources, sectors..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                      />
                    </>
                  )}
                  <button className="rounded-sm bg-cyan-300 px-3 py-2 text-sm/5 font-black uppercase tracking-[0.16em] text-slate-950 transition hover:bg-cyan-200" type="button" onClick={refreshAll}>
                  {isLoadingAnyDashboard ? 'Refreshing' : 'Refresh'}
                  </button>
                  <button className="rounded-sm border border-white/10 px-3 py-2 text-sm/5 font-black uppercase tracking-[0.16em] text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-100" type="button" onClick={() => setIsHelpOpen((value) => !value)}>
                    Help
                  </button>
                </div>
              </div>
              {(loadError || news.refreshError) && <p className="mt-3 rounded-sm border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm/6 text-red-100">{loadError ?? news.refreshError}</p>}
              {activeMenu === 'Tickers' && tickerError && <p className="mt-3 rounded-sm border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm/6 text-red-100">{tickerError}</p>}
              {activeMenu === 'Commodities' && commoditiesError && <p className="mt-3 rounded-sm border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm/6 text-red-100">{commoditiesError}</p>}
              {activeMenu === 'Logs' && logError && <p className="mt-3 rounded-sm border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm/6 text-red-100">{logError}</p>}
              {activeMenu === 'Articles' && articlesError && <p className="mt-3 rounded-sm border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm/6 text-red-100">{articlesError}</p>}
              {activeMenu === 'Data Centers' && dataCentersError && <p className="mt-3 rounded-sm border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm/6 text-red-100">{dataCentersError}</p>}
              {activeMenu === 'Popular' && popularError && <p className="mt-3 rounded-sm border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm/6 text-red-100">{popularError}</p>}
              {activeMenu === 'Portfolios' && portfolioError && <p className="mt-3 rounded-sm border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm/6 text-red-100">{portfolioError}</p>}
              {activeMenu === 'Optimized Portfolio' && optimizedPortfolioError && <p className="mt-3 rounded-sm border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm/6 text-red-100">{optimizedPortfolioError}</p>}
              {activeMenu === 'Portfolio Decisions' && portfolioDecisionError && <p className="mt-3 rounded-sm border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm/6 text-red-100">{portfolioDecisionError}</p>}
              {activeMenu === 'Portfolio Playoffs' && portfolioBracketError && <p className="mt-3 rounded-sm border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm/6 text-red-100">{portfolioBracketError}</p>}
            </section>

            {isHelpOpen && (
              <section className="rounded-sm border border-cyan-300/30 bg-slate-900/90 p-3 shadow-2xl shadow-cyan-950/20">
                <SectionHeader eyebrow="Shortcuts" title="Keyboard Controls" />
                <div className="mt-3 grid gap-2 text-sm/6 text-slate-200 sm:grid-cols-2 lg:grid-cols-4">
                  {menuEntries.map((entry) => <ShortcutRow key={entry.label} keys={entry.shortcut} label={`Show ${entry.label}`} />)}
                  <ShortcutRow keys="/" label="Focus search" />
                  <ShortcutRow keys="R" label="Refresh data" />
                  <ShortcutRow keys="Esc" label="Clear filters" />
                  <ShortcutRow keys="? or H" label="Toggle this panel" />
                </div>
              </section>
            )}

            {shouldShowMarketSignals && (
              <MarketSignalsSummary data={marketSignals} isLoading={isMarketSignalsLoading} error={marketSignalsError} />
            )}

            {activeMenu === 'Logs' ? (
              <RefreshLogDashboard log={refreshLog} isLoading={isLogLoading} onPageChange={(page) => loadRefreshLog(page, true)} />
            ) : activeMenu === 'Tickers' ? (
              <TickerWatchlistDashboard data={tickerWatchlist} isLoading={isTickerLoading} />
            ) : activeMenu === 'Commodities' ? (
              <CommoditiesDashboard data={commodities} isLoading={isCommoditiesLoading} />
            ) : activeMenu === 'Articles' ? (
              <RawArticlesTable data={articleRecords} isLoading={isArticlesLoading} onPageChange={(page) => loadArticles(page, true)} />
            ) : activeMenu === 'Popular' ? (
              <PopularDashboard data={popular} snapshots={popularSnapshots} selectedSnapshotId={selectedPopularSnapshotId} isLoading={isPopularLoading} onSnapshotChange={(snapshotId) => loadPopular(snapshotId, true)} onLatest={() => loadPopular(null, true)} />
            ) : activeMenu === 'Portfolios' ? (
              <Suspense fallback={<ChartDashboardFallback />}>
                <PortfolioDashboard
                  data={portfolios}
                  comparisonData={portfolioComparison}
                  signalCalibration={portfolioSignalCalibration}
                  history={portfolioHistory}
                  isLoading={isPortfolioLoading}
                  isOptimizeRunning={isPortfolioOptimizeRunning}
                  optimizeJob={portfolioOptimizeJob}
                  onPageChange={(page) => loadPortfolios(page, true)}
                  onRunOptimize={runPortfolioOptimize}
                  onOpenTrendingSnapshot={openTrendingSnapshotFromPortfolio}
                  scenarios={portfolioScenarios}
                  selectedScenarioId={selectedPortfolioScenarioId}
                  onSelectScenario={selectPortfolioScenario}
                  onRenameScenario={renamePortfolioScenario}
                  onSaveScenario={savePortfolioScenario}
                  onDeleteScenario={removePortfolioScenario}
                />
              </Suspense>
            ) : activeMenu === 'Optimized Portfolio' ? (
              <Suspense fallback={<ChartDashboardFallback />}>
                <OptimizedPortfolioDashboard data={optimizedPortfolios} comparisonData={optimizedPortfolioComparison} isLoading={isOptimizedPortfolioLoading} />
              </Suspense>
            ) : activeMenu === 'Portfolio Decisions' ? (
              <Suspense fallback={<ChartDashboardFallback />}>
                <PortfolioDecisionDashboard data={portfolioDecisions} profile={portfolioDecisionProfile} isLoading={isPortfolioDecisionLoading} onProfileChange={selectPortfolioDecisionProfile} />
              </Suspense>
            ) : activeMenu === 'Portfolio Playoffs' ? (
              <Suspense fallback={<ChartDashboardFallback />}>
                <PortfolioPlayoffsDashboard finalizedData={portfolioBracket} intradayData={portfolioBracketIntraday} isLoading={isPortfolioBracketLoading} onRangeChange={(startDate, endDate, options) => loadPortfolioBracket(startDate, endDate, true, options)} />
              </Suspense>
            ) : activeMenu === 'Data Centers' ? (
              <DataCentersDashboard stories={dataCentersRecords.articles} isLoading={isDataCentersLoading} lastRefreshTime={lastRefreshTime} nextRefreshTime={nextRefreshTime} />
            ) : (
              <>
                {featuredStory ? (
                  <article className="rounded-sm border border-cyan-300/30 bg-cyan-100 p-4 text-slate-950 shadow-2xl shadow-cyan-950/20 sm:p-5">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-black uppercase tracking-[0.18em]">
                      <span className="rounded-sm bg-slate-950 px-3 py-1.5 text-cyan-100">Featured</span>
                      <StoryLabel label={inferDisplaySection(featuredStory)} tone={getSectionTone(featuredStory)} />
                      <StoryLabel label={`${featuredStory.impact} Impact`} tone={getImpactTone(featuredStory.impact)} />
                      <StoryLabel label={getSourceGroup(featuredStory.source)} tone={getSourceTone(featuredStory.source)} />
                      <span>{featuredStory.time}</span>
                    </div>
                    {featuredStory.url ? (
                      <a href={featuredStory.url} target="_blank" rel="noreferrer" className="mt-3 block text-3xl/8 font-black tracking-[-0.06em] underline decoration-slate-950/20 underline-offset-4 hover:decoration-slate-950 sm:text-4xl/10">
                        {featuredStory.headline}
                      </a>
                    ) : (
                      <h2 className="mt-3 text-3xl/8 font-black tracking-[-0.06em] sm:text-4xl/10">{featuredStory.headline}</h2>
                    )}
                    <p className="mt-3 max-w-5xl text-base/6 font-semibold text-slate-800">{featuredStory.summary}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-950/15 pt-3 text-xs font-black uppercase tracking-[0.16em] text-slate-700">
                      <span>Source: {featuredStory.source}</span>
                      <span>Refresh {lastRefreshTime}</span>
                      <span>Next {nextRefreshTime}</span>
                      {featuredStory.url && <a className="text-slate-950 underline decoration-slate-950/30 underline-offset-4 hover:decoration-slate-950" href={featuredStory.url} target="_blank" rel="noreferrer">Open Source</a>}
                    </div>
                  </article>
                ) : (
                  <section className="rounded-sm border border-white/10 bg-slate-900/90 p-8 text-center shadow-2xl shadow-black/30">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">No Matches</p>
                    <h2 className="mt-2 text-3xl/9 font-black tracking-tight text-white">No stories match the current filters.</h2>
                    <button className="mt-5 rounded-sm bg-cyan-300 px-5 py-3 text-sm/5 font-black uppercase tracking-[0.16em] text-slate-950" type="button" onClick={() => {
                      setSelectedSignal(null)
                      setSearchQuery('')
                      showMenu('Top')
                    }}>
                      Clear Filters
                    </button>
                  </section>
                )}

                <section className="rounded-sm border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/30 sm:p-4">
                  <SectionHeader eyebrow="News Desk" title="Developing Stories" />
                  <div className="mt-3 grid gap-2">
                    {storyList.map((story, index) => (
                      <article key={story.id} className="group grid gap-3 rounded-sm border border-white/10 bg-slate-950/70 p-3 transition hover:border-cyan-300/60 hover:bg-slate-900 sm:grid-cols-[3.75rem_minmax(0,1fr)_12rem] sm:p-3">
                        <div className="font-mono text-xs/5 font-bold uppercase text-slate-300">
                          <p>{String(index + 2).padStart(2, '0')}</p>
                          <p className="mt-1 text-cyan-300">{story.time}</p>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                            <StoryLabel label={inferDisplaySection(story)} tone={getSectionTone(story)} />
                            <StoryLabel label={story.impact} tone={getImpactTone(story.impact)} />
                            <StoryLabel label={getSourceGroup(story.source)} tone={getSourceTone(story.source)} />
                          </div>
                          {story.url ? (
                            <a href={story.url} target="_blank" rel="noreferrer" className="mt-1.5 block text-lg/6 font-black tracking-tight text-white underline decoration-transparent underline-offset-4 group-hover:text-cyan-100 group-hover:decoration-cyan-300/60">
                              {story.headline}
                            </a>
                          ) : (
                            <h3 className="mt-1.5 text-lg/6 font-black tracking-tight text-white">{story.headline}</h3>
                          )}
                          <p className="mt-1 text-sm/6 text-slate-300">{story.summary}</p>
                        </div>
                        <div className="flex flex-col items-start gap-1.5 sm:items-end">
                          <p className="rounded-sm bg-white/5 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-300">{story.source}</p>
                          {story.url && <a className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300 underline decoration-cyan-300/30 underline-offset-4 hover:text-cyan-100" href={story.url} target="_blank" rel="noreferrer">Open</a>}
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="mt-4 rounded-sm border border-white/10 bg-slate-950 px-4 py-3 text-center text-sm/6 text-slate-300">
                    {isMainFeedLoading ? 'Loading more news...' : mainFeed.page * mainFeed.pageSize < mainFeed.total ? 'Scroll down to load more news.' : `Showing all ${filteredStories.length} visible stories.`}
                  </div>
                </section>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}


export default App
