import { describe, expect, test } from 'bun:test'
import { isPortfolioMenu, shouldPollMarketSignals } from './pollingHelpers'

describe('pollingHelpers', () => {
  test('shouldPollMarketSignals only on section menus', () => {
    expect(shouldPollMarketSignals('Top')).toBe(true)
    expect(shouldPollMarketSignals('Markets')).toBe(true)
    expect(shouldPollMarketSignals('Popular')).toBe(false)
    expect(shouldPollMarketSignals('Portfolios')).toBe(false)
    expect(shouldPollMarketSignals('Tickers')).toBe(false)
  })

  test('isPortfolioMenu identifies portfolio views', () => {
    expect(isPortfolioMenu('Portfolios')).toBe(true)
    expect(isPortfolioMenu('Optimized Portfolio')).toBe(true)
    expect(isPortfolioMenu('Portfolio Playoffs')).toBe(true)
    expect(isPortfolioMenu('Top')).toBe(false)
    expect(isPortfolioMenu('Commodities')).toBe(false)
  })
})
