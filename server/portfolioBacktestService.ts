import type { PortfolioBacktestMetric, PortfolioBacktestRunResponse, PortfolioLiveCandidatesResponse, PortfolioRepository } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export class PortfolioBacktestService {
  constructor(
    private readonly store: PortfolioRepository,
    private readonly benchmarkSymbol = 'SPY',
  ) {}

  async runBacktest(input?: { scenarioIds?: number[]; lookbackDays?: number; feeBps?: number; slippageBps?: number }) {
    const lookbackDays = Math.min(1825, Math.max(90, Math.floor(input?.lookbackDays ?? 365)))
    const feeBps = Math.max(0, input?.feeBps ?? 10)
    const slippageBps = Math.max(0, input?.slippageBps ?? 10)
    const runId = this.store.createPortfolioBacktestRun({
      benchmarkSymbol: this.benchmarkSymbol,
      rebalanceCadence: 'weekly',
      lookbackDays,
      feeBps,
      slippageBps,
    })
    try {
      const scenarios = this.store
        .listPortfolioScenarios()
        .filter((scenario) => !input?.scenarioIds || input.scenarioIds.includes(scenario.id))
      const horizons = [90, 365].filter((days) => days <= lookbackDays)
      const metrics: Omit<PortfolioBacktestMetric, 'runId'>[] = []
      for (const scenario of scenarios) {
        for (const horizonDays of horizons) {
          const computed = this.computeScenarioHorizonMetric(scenario.id, horizonDays, feeBps + slippageBps)
          if (computed) metrics.push(computed)
        }
      }
      this.store.replacePortfolioBacktestMetrics(runId, metrics)
      this.store.updatePortfolioBacktestRun(runId, { status: 'completed', error: null })
      return this.getRun(runId)
    } catch (error) {
      this.store.updatePortfolioBacktestRun(runId, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
      return this.getRun(runId)
    }
  }

  getRun(runId: number): PortfolioBacktestRunResponse {
    return {
      updatedAt: new Date().toISOString(),
      run: this.store.getPortfolioBacktestRun(runId),
      metrics: this.store.getPortfolioBacktestMetrics(runId),
    }
  }

  refreshCandidates(runId: number): PortfolioLiveCandidatesResponse {
    const run = this.store.getPortfolioBacktestRun(runId)
    if (!run || run.status !== 'completed') return { updatedAt: new Date().toISOString(), candidates: [] }
    const scenarios = new Map(this.store.listPortfolioScenarios().map((scenario) => [scenario.id, scenario]))
    const byScenario = new Map<number, PortfolioBacktestMetric[]>()
    this.store.getPortfolioBacktestMetrics(runId).forEach((metric) => {
      const entries = byScenario.get(metric.scenarioId) ?? []
      entries.push(metric)
      byScenario.set(metric.scenarioId, entries)
    })
    const selectedAt = new Date().toISOString()
    const candidates = [...byScenario.entries()]
      .flatMap(([scenarioId, metrics]) => {
        const h90 = metrics.find((metric) => metric.horizonDays === 90)
        const h365 = metrics.find((metric) => metric.horizonDays === 365)
        if (!h90 || !h365) return []
        if (h365.sharpeRatio < 1) return []
        if (h365.maxDrawdown < -0.2) return []
        if (h90.excessReturn <= 0 || h365.excessReturn <= 0) return []
        if (h365.coverageRatio < 0.95) return []
        if (h365.averageTurnover > 0.35) return []
        const compositeScore = Number((h365.sharpeRatio * 100 + h365.excessReturn * 180 - Math.abs(h365.maxDrawdown) * 80).toFixed(2))
        const scenario = scenarios.get(scenarioId)
        return [
          {
            scenarioId,
            scenarioName: scenario?.name ?? `Scenario ${scenarioId}`,
            runId,
            compositeScore,
            selectedAt,
            reason: 'Passed strict gate: Sharpe>=1, MDD<=20%, positive 90D/365D excess, coverage>=95%, turnover<=35%.',
          },
        ]
      })
      .sort((left, right) => right.compositeScore - left.compositeScore || left.scenarioName.localeCompare(right.scenarioName))
    this.store.replacePortfolioLiveCandidates(candidates)
    return { updatedAt: new Date().toISOString(), candidates: this.store.getPortfolioLiveCandidates() }
  }

  getCandidates(): PortfolioLiveCandidatesResponse {
    return { updatedAt: new Date().toISOString(), candidates: this.store.getPortfolioLiveCandidates() }
  }

  private computeScenarioHorizonMetric(
    scenarioId: number,
    horizonDays: number,
    costBps: number,
  ): Omit<PortfolioBacktestMetric, 'runId'> | null {
    const snapshots = this.store.getPortfolioSnapshotsAscending(scenarioId, 500).map((entry) => entry.snapshot)
    if (snapshots.length === 0) return null
    const latestMs = Date.now()
    const startMs = latestMs - horizonDays * DAY_MS
    const first = snapshots.find((snapshot) => Date.parse(snapshot.createdAt) >= startMs) ?? snapshots[0]
    if (!first) return null
    const firstMs = Date.parse(first.createdAt)
    const benchmarkBars = this.store.getTickerPriceHistory(
      this.benchmarkSymbol,
      new Date(firstMs).toISOString().slice(0, 10),
      new Date(latestMs).toISOString().slice(0, 10),
    )
    if (benchmarkBars.length < 30) return null

    let growth = 1
    let peak = 1
    let maxDrawdown = 0
    let positiveDays = 0
    let totalDays = 0
    let turnoverAccumulator = 0
    let turnoverSteps = 0

    for (let i = 1; i < benchmarkBars.length; i++) {
      const prevDate = benchmarkBars[i - 1]!.date
      const currentDate = benchmarkBars[i]!.date
      const snapshot = latestSnapshotAtOrBefore(snapshots, prevDate)
      if (!snapshot) continue
      const positions = this.store.getPortfolioPositions(snapshot.id).filter((position) => position.weight > 0)
      if (positions.length === 0) continue
      const daily = this.weightedDailyReturn(positions, prevDate, currentDate)
      const dayCost = isMonday(currentDate) ? costBps / 10_000 : 0
      const net = daily - dayCost
      growth *= 1 + net
      if (net > 0) positiveDays += 1
      totalDays += 1
      peak = Math.max(peak, growth)
      maxDrawdown = Math.min(maxDrawdown, growth / peak - 1)
      if (isMonday(currentDate)) {
        turnoverAccumulator += snapshot.turnoverRatio
        turnoverSteps += 1
      }
    }
    if (totalDays < 30) return null
    const years = totalDays / 252
    const annualizedReturn = years > 0 ? Math.pow(growth, 1 / years) - 1 : 0
    const benchmarkReturn = benchmarkBars.at(-1)!.adjClose / benchmarkBars[0]!.adjClose - 1
    const annualizedVolatility = Math.sqrt(Math.max(0, (annualizedReturn - benchmarkReturn) ** 2 + 1e-10))
    const sharpeRatio = annualizedVolatility > 1e-8 ? annualizedReturn / annualizedVolatility : 0
    const coverageRatio = totalDays / Math.max(1, benchmarkBars.length - 1)
    return {
      scenarioId,
      horizonDays,
      coverageRatio,
      annualizedReturn,
      annualizedVolatility,
      sharpeRatio,
      maxDrawdown,
      benchmarkReturn,
      excessReturn: annualizedReturn - benchmarkReturn,
      winRate: positiveDays / totalDays,
      averageTurnover: turnoverSteps > 0 ? turnoverAccumulator / turnoverSteps : 0,
    }
  }

  private weightedDailyReturn(positions: Array<{ symbol: string; weight: number }>, prevDate: string, date: string) {
    let weighted = 0
    let covered = 0
    for (const position of positions) {
      const bars = this.store.getTickerPriceHistory(position.symbol, prevDate, date)
      const previous = bars.find((bar) => bar.date === prevDate)
      const current = bars.find((bar) => bar.date === date)
      if (!previous || !current || previous.adjClose <= 0) continue
      weighted += position.weight * (current.adjClose / previous.adjClose - 1)
      covered += position.weight
    }
    return covered > 0 ? weighted / covered : 0
  }
}

const latestSnapshotAtOrBefore = <T extends { createdAt: string }>(snapshots: T[], date: string): T | null => {
  let selected: T | null = null
  for (const snapshot of snapshots) {
    if (snapshot.createdAt.slice(0, 10) <= date) selected = snapshot
    else break
  }
  return selected
}

const isMonday = (date: string) => new Date(`${date}T00:00:00.000Z`).getUTCDay() === 1
