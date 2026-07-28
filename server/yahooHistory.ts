import type { Fetcher } from './feeds'

export type DailyBar = {
  dateMs: number
  adjClose: number
}

type YahooChartHistoryResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        adjclose?: Array<{ adjclose?: Array<number | null> }>
        quote?: Array<{
          close?: Array<number | null>
          open?: Array<number | null>
        }>
      }
    }>
  }
}

/** Fetch daily adjusted closes (~5y / 1d) for Yahoo chart symbol (dots → hyphens). */
export async function fetchDailyAdjustedHistory(fetcher: Fetcher, yahooSymbol: string, rangeYears = 5): Promise<DailyBar[] | null> {
  const sym = encodeURIComponent(yahooSymbol)
  const range = rangeYears >= 10 ? '10y' : `${rangeYears}y`
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=${range}`
  const response = await fetcher(url)
  if (!response.ok) return null

  const data = (await response.json()) as YahooChartHistoryResponse
  const result = data.chart?.result?.[0]
  if (!result) return null
  const timestamps = result.timestamp
  if (!timestamps?.length) return null

  const adjRow = result.indicators?.adjclose?.[0]?.adjclose
  const quoteClose = result.indicators?.quote?.[0]?.close

  const closes: Array<number | null | undefined> = adjRow ?? quoteClose ?? []
  if (!closes.length || closes.length !== timestamps.length) return null

  const out: DailyBar[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const raw = closes[i]
    const adjClose = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null
    if (adjClose === null) continue
    out.push({ dateMs: timestamps[i]! * 1000, adjClose })
  }

  return out.length >= 120 ? out : null
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index]!, index)
    }
  })

  await Promise.all(workers)
  return results
}
