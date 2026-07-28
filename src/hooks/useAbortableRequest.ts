import { useRef } from 'react'

export type RequestKey =
  | 'topNews'
  | 'tickers'
  | 'commodities'
  | 'marketSignals'
  | 'refreshLog'
  | 'articles'
  | 'popular'
  | 'popularSnapshots'
  | 'dataCenters'
  | 'portfolioScenarios'
  | 'portfolios'
  | 'optimizedPortfolios'
  | 'portfolioDecisions'
  | 'portfolioBracket'
  | 'mainFeed'

export const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

export function useAbortableRequest() {
  const requestControllersRef = useRef<Partial<Record<RequestKey, AbortController>>>({})

  function createRequestSignal(key: RequestKey) {
    requestControllersRef.current[key]?.abort()
    const controller = new AbortController()
    requestControllersRef.current[key] = controller
    return controller.signal
  }

  function clearRequestSignal(key: RequestKey, signal: AbortSignal) {
    if (requestControllersRef.current[key]?.signal === signal) delete requestControllersRef.current[key]
  }

  function abortAll() {
    Object.values(requestControllersRef.current).forEach((controller) => controller?.abort())
    requestControllersRef.current = {}
  }

  return { createRequestSignal, clearRequestSignal, abortAll }
}
