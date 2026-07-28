export type SectionFilter = 'Top' | 'Markets' | 'Technology' | 'Energy'
export type ActiveMenu = SectionFilter | 'Tickers' | 'Commodities' | 'Popular' | 'Portfolios' | 'Optimized Portfolio' | 'Portfolio Decisions' | 'Portfolio Playoffs' | 'Articles' | 'Data Centers' | 'Logs'
export type SignalFilter = 'Breaking' | 'Fed' | 'Earnings' | 'Rates' | 'Energy' | 'Crypto'

export const sectionFilters: Array<{ label: SectionFilter; shortcut: string }> = [
  { label: 'Top', shortcut: 'T' },
  { label: 'Markets', shortcut: 'M' },
  { label: 'Technology', shortcut: 'G' },
  { label: 'Energy', shortcut: 'E' },
]

export const menuEntries: Array<{ label: ActiveMenu; shortcut: string }> = [
  ...sectionFilters,
  { label: 'Tickers', shortcut: 'K' },
  { label: 'Commodities', shortcut: 'Y' },
  { label: 'Popular', shortcut: 'O' },
  { label: 'Portfolios', shortcut: 'B' },
  { label: 'Optimized Portfolio', shortcut: 'Z' },
  { label: 'Portfolio Decisions', shortcut: 'D' },
  { label: 'Portfolio Playoffs', shortcut: 'P' },
  { label: 'Articles', shortcut: 'A' },
  { label: 'Data Centers', shortcut: 'C' },
  { label: 'Logs', shortcut: 'L' },
]

export const menuRoutes: Record<ActiveMenu, string> = {
  Top: '/',
  Markets: '/markets',
  Technology: '/technology',
  Energy: '/energy',
  Tickers: '/tickers',
  Commodities: '/commodities',
  Popular: '/popular',
  Portfolios: '/portfolios',
  'Optimized Portfolio': '/optimized-portfolio',
  'Portfolio Decisions': '/portfolio-decisions',
  'Portfolio Playoffs': '/portfolio-playoffs',
  Articles: '/articles',
  'Data Centers': '/data-centers',
  Logs: '/logs',
}

export const getMenuFromPath = (pathname: string): ActiveMenu => menuEntries.find((entry) => menuRoutes[entry.label] === pathname)?.label ?? 'Top'

export const getInitialMenu = (): ActiveMenu => {
  if (typeof window === 'undefined') return 'Top'
  return getMenuFromPath(window.location.pathname)
}

export const isSectionMenu = (menu: ActiveMenu): menu is SectionFilter => sectionFilters.some((entry) => entry.label === menu)
export const isSearchableMenu = (menu: ActiveMenu) => isSectionMenu(menu) || menu === 'Data Centers'
export const isMainFeedMenu = (menu: ActiveMenu) => isSectionMenu(menu)
