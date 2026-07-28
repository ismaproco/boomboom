import { useRef, useState, type RefObject } from 'react'
import { newsApi } from '../api'
import type { ActiveMenu } from '../navigation'
import type {
  OptimizedPortfoliosResponse,
  PortfolioBracketRankScope,
  PortfolioBracketResponse,
  PortfolioBracketSource,
  PortfolioComparisonResponse,
  PortfolioDecisionProfile,
  PortfolioDecisionResponse,
  PortfolioHistoryResponse,
  PortfolioOptimizeJob,
  PortfolioResponse,
  PortfolioScenario,
  PortfolioScenarioInput,
  PortfolioSignalCalibrationResponse,
  Sp500OptimizePayload,
} from '../types'
import {
  getEmptyOptimizedPortfolios,
  getEmptyPortfolioBracket,
  getEmptyPortfolioComparison,
  getEmptyPortfolioDecisions,
  getEmptyPortfolioHistory,
  getEmptyPortfolios,
  getEmptyPortfolioSignalCalibration,
} from './dashboardEmptyState'
import { isAbortError, type RequestKey } from './useAbortableRequest'

const PORTFOLIO_SCENARIO_STORAGE_KEY = 'boomboom.portfolioScenarioId'

type AbortApi = {
  createRequestSignal: (key: RequestKey) => AbortSignal
  clearRequestSignal: (key: RequestKey, signal: AbortSignal) => void
}

export function usePortfolioDashboard(
  isMountedRef: RefObject<boolean>,
  activeMenuRef: RefObject<ActiveMenu>,
  abort: AbortApi,
  onNavigatePopular: (snapshotId: number) => void,
) {
  const [portfolios, setPortfolios] = useState<PortfolioResponse>(getEmptyPortfolios)
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryResponse>(getEmptyPortfolioHistory)
  const [portfolioComparison, setPortfolioComparison] = useState<PortfolioComparisonResponse>(getEmptyPortfolioComparison)
  const [optimizedPortfolios, setOptimizedPortfolios] = useState<OptimizedPortfoliosResponse>(getEmptyOptimizedPortfolios)
  const [optimizedPortfolioComparison, setOptimizedPortfolioComparison] = useState<PortfolioComparisonResponse>(getEmptyPortfolioComparison)
  const [portfolioDecisions, setPortfolioDecisions] = useState<PortfolioDecisionResponse>(getEmptyPortfolioDecisions)
  const [portfolioBracket, setPortfolioBracket] = useState<PortfolioBracketResponse>(getEmptyPortfolioBracket)
  const [portfolioBracketIntraday, setPortfolioBracketIntraday] = useState<PortfolioBracketResponse>(() =>
    getEmptyPortfolioBracket('intraday'),
  )
  const [portfolioDecisionProfile, setPortfolioDecisionProfile] = useState<PortfolioDecisionProfile>('balanced')
  const [portfolioSignalCalibration, setPortfolioSignalCalibration] = useState<PortfolioSignalCalibrationResponse>(() =>
    getEmptyPortfolioSignalCalibration(),
  )
  const [portfolioScenarios, setPortfolioScenarios] = useState<PortfolioScenario[]>([])
  const [selectedPortfolioScenarioId, setSelectedPortfolioScenarioId] = useState<number | null>(null)
  const [isPortfolioLoading, setIsPortfolioLoading] = useState(false)
  const [isOptimizedPortfolioLoading, setIsOptimizedPortfolioLoading] = useState(false)
  const [isPortfolioDecisionLoading, setIsPortfolioDecisionLoading] = useState(false)
  const [isPortfolioBracketLoading, setIsPortfolioBracketLoading] = useState(false)
  const [portfolioError, setPortfolioError] = useState<string | null>(null)
  const [optimizedPortfolioError, setOptimizedPortfolioError] = useState<string | null>(null)
  const [portfolioDecisionError, setPortfolioDecisionError] = useState<string | null>(null)
  const [portfolioBracketError, setPortfolioBracketError] = useState<string | null>(null)
  const [portfolioOptimizeJob, setPortfolioOptimizeJob] = useState<PortfolioOptimizeJob | null>(null)
  const [isPortfolioOptimizeRunning, setIsPortfolioOptimizeRunning] = useState(false)

  const selectedPortfolioScenarioIdRef = useRef<number | null>(null)
  const portfolioDecisionProfileRef = useRef<PortfolioDecisionProfile>('balanced')
  const portfolioPageRef = useRef(1)

  selectedPortfolioScenarioIdRef.current = selectedPortfolioScenarioId
  portfolioDecisionProfileRef.current = portfolioDecisionProfile

  function setPortfolioPage(page: number) {
    portfolioPageRef.current = page
  }

  async function loadPortfolioScenarios(): Promise<number | null> {
    const signal = abort.createRequestSignal('portfolioScenarios')
    try {
      const data = await newsApi.getPortfolioScenarios(signal)
      if (!isMountedRef.current) return null
      setPortfolioScenarios(data.scenarios)
      const stored = Number.parseInt(localStorage.getItem(PORTFOLIO_SCENARIO_STORAGE_KEY) ?? '', 10)
      const prev = selectedPortfolioScenarioIdRef.current
      const nextId =
        prev !== null && data.scenarios.some((s) => s.id === prev)
          ? prev
          : Number.isFinite(stored) && data.scenarios.some((s) => s.id === stored)
            ? stored
            : (data.scenarios.find((s) => s.isDefault)?.id ?? data.scenarios[0]?.id ?? null)
      setSelectedPortfolioScenarioId(nextId)
      selectedPortfolioScenarioIdRef.current = nextId
      return nextId
    } catch (error) {
      if (isAbortError(error)) return null
      if (!isMountedRef.current) return null
      setPortfolioScenarios([])
      return null
    } finally {
      abort.clearRequestSignal('portfolioScenarios', signal)
    }
  }

  async function loadPortfolios(page = portfolioPageRef.current, showActivity = false) {
    if (showActivity) setIsPortfolioLoading(true)
    const signal = abort.createRequestSignal('portfolios')
    portfolioPageRef.current = page
    try {
      let scenarioId = selectedPortfolioScenarioIdRef.current
      if (scenarioId === null) scenarioId = await loadPortfolioScenarios()
      if (scenarioId === null) {
        if (!isMountedRef.current) return
        setPortfolios(getEmptyPortfolios())
        setPortfolioHistory(getEmptyPortfolioHistory())
        setPortfolioComparison(getEmptyPortfolioComparison())
        setPortfolioSignalCalibration(getEmptyPortfolioSignalCalibration())
        setPortfolioError(null)
        return
      }
      const [portfolioData, historyData, comparisonData, calibrationData] = await Promise.all([
        newsApi.getPortfolios(scenarioId, signal),
        newsApi.getPortfolioHistory(page, scenarioId, signal),
        newsApi.getPortfolioComparison(signal),
        newsApi.getPortfolioSignalCalibration(scenarioId, signal),
      ])
      if (!isMountedRef.current) return
      setPortfolios(portfolioData)
      setPortfolioHistory(historyData)
      setPortfolioComparison(comparisonData)
      setPortfolioSignalCalibration(calibrationData)
      setPortfolioError(null)
    } catch (error) {
      if (isAbortError(error)) return
      if (!isMountedRef.current) return
      setPortfolioSignalCalibration(getEmptyPortfolioSignalCalibration())
      setPortfolioError(error instanceof Error ? error.message : 'Unable to load auto portfolios')
    } finally {
      abort.clearRequestSignal('portfolios', signal)
      if (!signal.aborted && showActivity && isMountedRef.current) setIsPortfolioLoading(false)
    }
  }

  async function loadOptimizedPortfolios(showActivity = false) {
    if (showActivity) setIsOptimizedPortfolioLoading(true)
    const signal = abort.createRequestSignal('optimizedPortfolios')
    try {
      const [summaryData, comparisonData] = await Promise.all([
        newsApi.getOptimizedPortfolios(signal),
        newsApi.getOptimizedPortfolioComparison(signal),
      ])
      if (!isMountedRef.current) return
      setOptimizedPortfolios(summaryData)
      setOptimizedPortfolioComparison(comparisonData)
      setOptimizedPortfolioError(null)
    } catch (error) {
      if (isAbortError(error)) return
      if (!isMountedRef.current) return
      setOptimizedPortfolios(getEmptyOptimizedPortfolios())
      setOptimizedPortfolioComparison(getEmptyPortfolioComparison())
      setOptimizedPortfolioError(error instanceof Error ? error.message : 'Unable to load optimized portfolios')
    } finally {
      abort.clearRequestSignal('optimizedPortfolios', signal)
      if (!signal.aborted && showActivity && isMountedRef.current) setIsOptimizedPortfolioLoading(false)
    }
  }

  async function loadPortfolioDecisions(profile = portfolioDecisionProfileRef.current, showActivity = false) {
    if (showActivity) setIsPortfolioDecisionLoading(true)
    const signal = abort.createRequestSignal('portfolioDecisions')
    try {
      const data = await newsApi.getPortfolioDecisions(profile, signal)
      if (!isMountedRef.current) return
      setPortfolioDecisions(data)
      setPortfolioDecisionProfile(data.riskProfile)
      portfolioDecisionProfileRef.current = data.riskProfile
      setPortfolioDecisionError(null)
    } catch (error) {
      if (isAbortError(error)) return
      if (!isMountedRef.current) return
      setPortfolioDecisions(getEmptyPortfolioDecisions())
      setPortfolioDecisionError(error instanceof Error ? error.message : 'Unable to load portfolio decisions')
    } finally {
      abort.clearRequestSignal('portfolioDecisions', signal)
      if (!signal.aborted && showActivity && isMountedRef.current) setIsPortfolioDecisionLoading(false)
    }
  }

  async function loadPortfolioBracket(
    startDate?: string,
    endDate?: string,
    showActivity = false,
    options?: { source?: PortfolioBracketSource; rankScope?: PortfolioBracketRankScope },
  ) {
    if (showActivity) setIsPortfolioBracketLoading(true)
    const signal = abort.createRequestSignal('portfolioBracket')
    try {
      const source = options?.source ?? portfolioBracket.source ?? 'all'
      const rankScope = options?.rankScope ?? portfolioBracketIntraday.rankScope ?? 'all'
      const [finalizedData, intradayData] = await Promise.all([
        newsApi.getPortfolioBracket({ startDate, endDate, mode: 'finalized', source, rankScope: 'survivors' }, signal),
        newsApi.getPortfolioBracket({ startDate, endDate, mode: 'intraday', source, rankScope }, signal),
      ])
      if (!isMountedRef.current) return
      setPortfolioBracket(finalizedData)
      setPortfolioBracketIntraday(intradayData)
      setPortfolioBracketError(null)
    } catch (error) {
      if (isAbortError(error)) return
      if (!isMountedRef.current) return
      setPortfolioBracket(getEmptyPortfolioBracket())
      setPortfolioBracketIntraday(getEmptyPortfolioBracket('intraday'))
      setPortfolioBracketError(error instanceof Error ? error.message : 'Unable to load portfolio playoffs')
    } finally {
      abort.clearRequestSignal('portfolioBracket', signal)
      if (!signal.aborted && showActivity && isMountedRef.current) setIsPortfolioBracketLoading(false)
    }
  }

  function selectPortfolioDecisionProfile(profile: PortfolioDecisionProfile) {
    setPortfolioDecisionProfile(profile)
    portfolioDecisionProfileRef.current = profile
    void loadPortfolioDecisions(profile, true)
  }

  function selectPortfolioScenario(scenarioId: number) {
    setSelectedPortfolioScenarioId(scenarioId)
    selectedPortfolioScenarioIdRef.current = scenarioId
    void loadPortfolios(1, true)
  }

  function openTrendingSnapshotFromPortfolio(snapshotId: number) {
    onNavigatePopular(snapshotId)
  }

  async function savePortfolioScenario(input: PortfolioScenarioInput, editId: number | null) {
    if (editId === null) {
      const created = await newsApi.createPortfolioScenario(input)
      await loadPortfolioScenarios()
      selectedPortfolioScenarioIdRef.current = created.id
      setSelectedPortfolioScenarioId(created.id)
    } else {
      await newsApi.updatePortfolioScenario(editId, input)
      await loadPortfolioScenarios()
    }
    void loadPortfolios(1, true)
  }

  async function renamePortfolioScenario(scenarioId: number, name: string) {
    const nextName = name.trim()
    if (!nextName) return
    await newsApi.updatePortfolioScenario(scenarioId, { name: nextName })
    await loadPortfolioScenarios()
    void loadPortfolios(portfolioPageRef.current, true)
  }

  async function removePortfolioScenario(scenarioId: number) {
    await newsApi.deletePortfolioScenario(scenarioId)
    await loadPortfolioScenarios()
    void loadPortfolios(1, true)
  }

  async function runPortfolioOptimize(payload: Sp500OptimizePayload) {
    setPortfolioError(null)
    setPortfolioOptimizeJob(null)
    setIsPortfolioOptimizeRunning(true)
    try {
      const { jobId } = await newsApi.enqueuePortfolioOptimize(payload)
      while (true) {
        const { job } = await newsApi.getPortfolioOptimizeJob(jobId)
        if (!isMountedRef.current) return
        setPortfolioOptimizeJob(job)
        if (job.status === 'completed') {
          await loadPortfolioScenarios()
          if (job.scenarioId !== null) {
            selectedPortfolioScenarioIdRef.current = job.scenarioId
            setSelectedPortfolioScenarioId(job.scenarioId)
          }
          await loadPortfolios(1, true)
          break
        }
        if (job.status === 'failed') {
          setPortfolioError(job.error ?? 'Portfolio optimization failed')
          break
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 1300))
      }
    } catch (error) {
      if (!isMountedRef.current) return
      setPortfolioError(error instanceof Error ? error.message : 'Optimize request failed')
    } finally {
      if (isMountedRef.current) {
        setIsPortfolioOptimizeRunning(false)
        window.setTimeout(() => setPortfolioOptimizeJob(null), 1500)
      }
    }
  }

  return {
    portfolios,
    portfolioHistory,
    portfolioComparison,
    optimizedPortfolios,
    optimizedPortfolioComparison,
    portfolioDecisions,
    portfolioBracket,
    portfolioBracketIntraday,
    portfolioDecisionProfile,
    portfolioSignalCalibration,
    portfolioScenarios,
    selectedPortfolioScenarioId,
    selectedPortfolioScenarioIdRef,
    portfolioPageRef,
    isPortfolioLoading,
    isOptimizedPortfolioLoading,
    isPortfolioDecisionLoading,
    isPortfolioBracketLoading,
    portfolioError,
    optimizedPortfolioError,
    portfolioDecisionError,
    portfolioBracketError,
    portfolioOptimizeJob,
    isPortfolioOptimizeRunning,
    loadPortfolios,
    loadOptimizedPortfolios,
    loadPortfolioDecisions,
    loadPortfolioBracket,
    selectPortfolioDecisionProfile,
    selectPortfolioScenario,
    openTrendingSnapshotFromPortfolio,
    savePortfolioScenario,
    renamePortfolioScenario,
    removePortfolioScenario,
    runPortfolioOptimize,
    setPortfolioPage,
  }
}
