import { isSectionMenu, type ActiveMenu } from '../navigation'

/** Market signals summary is shown only on section (news feed) menus. */
export const shouldPollMarketSignals = (menu: ActiveMenu) => isSectionMenu(menu)

const portfolioMenus = new Set<ActiveMenu>(['Portfolios', 'Optimized Portfolio', 'Portfolio Decisions', 'Portfolio Playoffs'])

export const isPortfolioMenu = (menu: ActiveMenu) => portfolioMenus.has(menu)
