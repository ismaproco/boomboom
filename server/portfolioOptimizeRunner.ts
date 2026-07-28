import type { OptimizeQueueStatus } from '../shared/types'
import type { AppConfig } from './config'
import type { SqliteStore } from './database'
import { parseOptimizeJobRequestJson } from './dbJsonSchemas'
import { SP500_SYMBOLS, yahooSymbol } from './data/sp500'
import type { Fetcher } from './feeds'
import { computeWeights, portfolioMetrics } from './portfolioOptimizer'
import type { OptimizeJobBody } from './requestSchemas'
import type { LiveNewsGateway, OptimizeJobStep, PortfolioScenario, QuantMethod, QuantUniversePolicy } from './types'
import { fetchDailyAdjustedHistory, mapWithConcurrency } from './yahooHistory'

export type OptimizeJobRequest = OptimizeJobBody

const MIN_HISTORY_DAYS = 200
const MAX_SAMPLE_ATTEMPTS = 400
const ACTIVE_JOB_STALE_MS = 30 * 60 * 1000
/** Only one optimize job runs at a time; cap queued jobs to avoid memory pressure. */
const MAX_QUEUED_OPTIMIZE_JOBS = 3

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const mulberry32 = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const shuffleInPlace = <T>(arr: T[], rnd: () => number) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
}

const parsePrice = (value: string) => Number(value.replace(/[^0-9.-]/g, ''))
const MIN_PERSISTED_WEIGHT = 0.0001

const pruneTinyWeights = <T extends { weight: number }>(positions: T[]): T[] => {
  const active = positions.filter((position) => position.weight >= MIN_PERSISTED_WEIGHT)
  const total = active.reduce((sum, position) => sum + position.weight, 0)
  if (total <= 0) return positions.filter((position) => position.weight > 0)
  return active.map((position) => ({ ...position, weight: position.weight / total }))
}

export class PortfolioOptimizeRunner {
  private readonly queue: number[] = []
  private pumping = false
  private acceptingJobs = true
  private readonly payloads = new Map<number, OptimizeJobRequest>()
  private onJobCompleted: ((scenarioId: number) => void | Promise<void>) | null = null
  private workerTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly store: SqliteStore,
    private readonly market: LiveNewsGateway,
    private readonly fetcher: Fetcher,
    private readonly config: AppConfig,
    private readonly benchmarkSymbol = 'SPY',
    private readonly mode: 'server' | 'worker' = 'server',
  ) {
    this.expireStaleActiveJobs()
    if (this.mode === 'worker') {
      this.startWorkerPoll()
    } else if (this.config.optimizeExecutor === 'embedded') {
      this.recoverQueuedJobs()
    }
  }

  stopAcceptingJobs() {
    this.acceptingJobs = false
    if (this.workerTimer) {
      clearInterval(this.workerTimer)
      this.workerTimer = null
    }
  }

  getQueueStatus(): OptimizeQueueStatus {
    return {
      inMemoryQueued: this.queue.length,
      running: this.pumping,
      maxInMemoryQueue: MAX_QUEUED_OPTIMIZE_JOBS,
      db: this.store.countActiveOptimizeJobs(),
    }
  }

  async drain(timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!this.pumping && this.queue.length === 0) return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  enqueue(request: OptimizeJobRequest): number | null {
    if (!this.acceptingJobs) return null
    this.expireStaleActiveJobs()
    if (this.queue.length >= MAX_QUEUED_OPTIMIZE_JOBS) return null
    if (request.scenarioId != null && this.store.scenarioHasActiveOptimizeJob(request.scenarioId)) {
      return null
    }
    const jobId = this.store.createPortfolioOptimizeJob({
      scenarioId: request.scenarioId ?? null,
      requestJson: JSON.stringify(request),
    })
    if (this.config.optimizeExecutor === 'external' && this.mode === 'server') {
      return jobId
    }
    this.payloads.set(jobId, request)
    this.queue.push(jobId)
    queueMicrotask(() => void this.pump())
    return jobId
  }

  private recoverQueuedJobs() {
    for (const jobId of this.store.listQueuedOptimizeJobIds()) {
      if (this.queue.includes(jobId)) continue
      const request = this.loadPersistedRequest(jobId)
      if (!request) {
        this.updateJob(jobId, {
          status: 'failed',
          step: 'queued',
          error: 'Missing persisted job request',
          progress: 0,
        })
        continue
      }
      this.payloads.set(jobId, request)
      this.queue.push(jobId)
    }
    if (this.queue.length > 0) queueMicrotask(() => void this.pump())
  }

  private startWorkerPoll() {
    const tick = () => {
      if (!this.acceptingJobs || this.pumping) return
      void this.pumpFromDatabase()
    }
    this.workerTimer = setInterval(tick, 2000)
    tick()
  }

  private async pumpFromDatabase() {
    if (this.pumping) return
    const jobId = this.store.listQueuedOptimizeJobIds()[0]
    if (jobId === undefined) return
    this.pumping = true
    try {
      await this.runJob(jobId)
    } finally {
      this.pumping = false
    }
  }

  private loadPersistedRequest(jobId: number): OptimizeJobRequest | null {
    return parseOptimizeJobRequestJson(this.store.getPortfolioOptimizeJobRequestJson(jobId))
  }

  private expireStaleActiveJobs() {
    const staleBefore = new Date(Date.now() - ACTIVE_JOB_STALE_MS).toISOString()
    const expired = this.store.expireStaleActiveOptimizeJobs(staleBefore)
    if (expired > 0) console.warn(`Expired ${expired} stale portfolio optimizer job(s).`)
  }

  setCompletionListener(listener: (scenarioId: number) => void | Promise<void>) {
    this.onJobCompleted = listener
  }

  getJob(jobId: number) {
    return this.store.getPortfolioOptimizeJob(jobId)
  }

  enqueueDueQuantScenarios() {
    const scenarios = this.store.listPortfolioScenarios().filter((s) => s.refreshMode === 'quant' && s.source !== 'optimized')
    const now = Date.now()
    for (const sc of scenarios) {
      if (!sc.quantNextRunAt) continue
      const due = new Date(sc.quantNextRunAt).getTime()
      if (due > now) continue
      this.enqueue({
        n: sc.quantTargetN ?? sc.symbols.length,
        method: (sc.quantMethod ?? 'max_sharpe') as QuantMethod,
        scenarioId: sc.id,
        universePolicy: sc.quantUniversePolicy ?? 'reroll',
        keepCount: sc.quantKeepCount ?? 0,
      })
    }
  }

  private async pump() {
    if (this.pumping) return
    const jobId = this.queue.shift()
    if (!jobId) return
    this.pumping = true
    try {
      await this.runJob(jobId)
    } finally {
      this.pumping = false
      queueMicrotask(() => void this.pump())
    }
  }

  private updateJob(
    jobId: number,
    partial: Partial<{
      status: 'queued' | 'running' | 'completed' | 'failed'
      step: OptimizeJobStep
      detail: string | null
      progress: number
      error: string | null
      scenarioId: number | null
      resultJson: string | null
    }>,
  ) {
    this.store.updatePortfolioOptimizeJob(jobId, partial)
  }

  private async runJob(jobId: number) {
    const raw = this.payloads.get(jobId)
    this.payloads.delete(jobId)
    const request = raw ?? this.loadPersistedRequest(jobId)
    if (!request) {
      this.updateJob(jobId, { status: 'failed', step: 'queued', error: 'Missing job payload', progress: 0 })
      return
    }
    const n = Math.min(50, Math.max(5, Math.floor(request.n)))
    const method = request.method

    this.updateJob(jobId, { status: 'running', step: 'queued', detail: 'Starting…', progress: 2 })

    try {
      const rng = mulberry32(request.seed ?? Math.floor(Math.random() * 0xffffffff))

      if (request.scenarioId !== undefined) {
        const existingCheck = this.store.getPortfolioScenario(request.scenarioId)
        if (!existingCheck) throw new Error('Scenario not found')
        if (existingCheck.refreshMode !== 'quant') throw new Error('Only quant scenarios can run this optimizer job')
      }

      const scenarioExisting = request.scenarioId !== undefined ? this.store.getPortfolioScenario(request.scenarioId) : null

      const policy: QuantUniversePolicy = request.universePolicy ?? scenarioExisting?.quantUniversePolicy ?? 'reroll'
      let keepCount = Math.min(n, Math.max(0, request.keepCount ?? scenarioExisting?.quantKeepCount ?? 0))
      if (policy !== 'keep_some') keepCount = 0

      this.updateJob(jobId, { step: 'sampling', detail: 'Building universe…', progress: 8 })

      const symbols = await this.resolveSymbols({
        n,
        policy,
        keepCount,
        rng,
        scenario: scenarioExisting,
        jobId,
      })

      if (symbols.length !== n) throw new Error(`Could not assemble ${n} valid symbols (got ${symbols.length}).`)

      this.updateJob(jobId, { step: 'fetching_history', detail: `Fetching ${symbols.length} histories…`, progress: 15 })

      const seriesMap = new Map<string, NonNullable<Awaited<ReturnType<typeof fetchDailyAdjustedHistory>>>>()
      let fetched = 0
      await mapWithConcurrency(symbols, 8, async (sym) => {
        const y = yahooSymbol(sym)
        const bars = await fetchDailyAdjustedHistory(this.fetcher, y)
        if (!bars?.length) throw new Error(`No history for ${sym}`)
        seriesMap.set(sym, bars)
        fetched++
        if (fetched % 4 === 0 || fetched === symbols.length) {
          this.updateJob(jobId, {
            detail: `Fetched ${fetched}/${symbols.length} symbols`,
            progress: 15 + Math.floor((fetched / symbols.length) * 35),
          })
        }
        return bars
      })

      this.updateJob(jobId, { step: 'aligning_returns', detail: 'Aligning return series…', progress: 52 })

      const { rows, muDailyCol } = this.buildLogReturnMatrix(symbols, seriesMap)
      if (rows.length < MIN_HISTORY_DAYS) throw new Error('Insufficient overlapping history after alignment.')

      this.updateJob(jobId, { step: 'optimizing', detail: `Optimizing (${method})…`, progress: 68 })

      const weights = computeWeights(method, rows)
      const metrics = portfolioMetrics(rows, weights)

      this.updateJob(jobId, { step: 'persisting', detail: 'Saving scenario & snapshot…', progress: 85 })

      const allSyms = [...symbols, this.benchmarkSymbol]
      const tickers = await this.market.fetchLiveTickers(allSyms)
      const quoteMap = new Map<string, number>()
      tickers.forEach((t) => {
        const p = t.lastPrice ?? parsePrice(t.value)
        if (Number.isFinite(p) && p > 0) quoteMap.set(t.symbol.toUpperCase(), p)
      })
      const benchmarkValue = quoteMap.get(this.benchmarkSymbol) ?? 0
      if (!benchmarkValue || benchmarkValue <= 0) throw new Error('Benchmark quote unavailable.')

      const positions = pruneTinyWeights(
        symbols.map((sym, i) => ({
          symbol: sym,
          weight: weights[i]!,
          viewScore: 0,
          impliedReturn: (muDailyCol[i] ?? 0) * 252,
          entryPrice: quoteMap.get(sym) ?? 0,
        })),
      )

      const maxW = Math.max(...weights, 1 / n)
      const maxWeightPerAsset = Math.min(0.5, Math.max(0.05, maxW))

      let scenarioId = scenarioExisting?.id ?? null

      const popularSnap = this.store.getLatestSnapshot()
      const reoptMs = scenarioExisting?.quantReoptimizeMs ?? this.config.portfolioQuantReoptimizeMs
      const nextRun = new Date(Date.now() + reoptMs).toISOString()

      if (!scenarioExisting) {
        const insertName = request.name?.trim() || `S&P 500 · ${method} · ${n} · ${new Date().toISOString().slice(0, 10)}`
        scenarioId = this.store.insertPortfolioScenario({
          name: insertName,
          symbols,
          noveltyProfile: 'medium',
          maxWeightPerAsset: maxWeightPerAsset,
          refreshMode: 'quant',
          blendTrending: false,
          quantMethod: method,
          quantTargetN: n,
          quantReoptimizeMs: reoptMs,
          quantUniversePolicy: policy,
          quantKeepCount: policy === 'keep_some' ? keepCount : 0,
          quantNextRunAt: nextRun,
        })
      } else {
        this.store.updatePortfolioScenario(scenarioExisting.id, {
          symbols,
          maxWeightPerAsset: maxWeightPerAsset,
          quantMethod: method,
          quantTargetN: n,
          quantUniversePolicy: policy,
          quantKeepCount: policy === 'keep_some' ? keepCount : 0,
          quantNextRunAt: nextRun,
        })
        scenarioId = scenarioExisting.id
      }

      const latest = scenarioId !== null ? this.store.getLatestPortfolioSnapshot(scenarioId) : null
      const previousPositions = latest ? this.store.getPortfolioPositions(latest.id) : []
      const symToW = new Map(symbols.map((s, i) => [s, weights[i]!]))
      const overlapRatio =
        previousPositions.length === 0 ? 0 : previousPositions.reduce((acc, p) => acc + Math.min(p.weight, symToW.get(p.symbol) ?? 0), 0)
      const turnoverRatio = previousPositions.length === 0 ? 1 : this.grossTurnover(previousPositions, symbols, weights)

      const comparison =
        latest && previousPositions.length > 0 ? this.buildComparison(latest.id, previousPositions, latest.benchmarkValue, quoteMap) : null

      this.store.savePortfolioSnapshot({
        scenarioId: scenarioId!,
        createdAt: new Date().toISOString(),
        benchmarkSymbol: this.benchmarkSymbol,
        benchmarkValue,
        expectedReturn: metrics.annualizedReturn,
        sourceSnapshotId: popularSnap?.id ?? null,
        viewCount: n,
        noveltyProfile: 'medium',
        overlapRatio,
        turnoverRatio,
        regimeShift: 1,
        newsAlignment: 0,
        lexiconTilt: 0,
        positions,
        comparison,
      })

      this.updateJob(jobId, {
        status: 'completed',
        step: 'persisting',
        detail: 'Done',
        progress: 100,
        error: null,
        scenarioId,
        resultJson: JSON.stringify({
          annualizedReturn: metrics.annualizedReturn,
          annualizedVol: metrics.annualizedVol,
          sharpeRatio: metrics.sharpeRatio,
        }),
      })
      if (scenarioId !== null) {
        void Promise.resolve(this.onJobCompleted?.(scenarioId)).catch((error) =>
          console.error('Portfolio optimize completion listener failed:', error),
        )
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      this.updateJob(jobId, {
        status: 'failed',
        step: 'queued',
        detail: null,
        error: message,
        progress: 0,
      })
    }
  }

  private grossTurnover(prev: { symbol: string; weight: number }[], symbols: string[], nextW: number[]) {
    const prevMap = new Map(prev.map((p) => [p.symbol, p.weight]))
    const symSet = new Set([...symbols, ...prevMap.keys()])
    let gross = 0
    for (const s of symSet) {
      const a = prevMap.get(s) ?? 0
      const idx = symbols.indexOf(s)
      const b = idx >= 0 ? nextW[idx]! : 0
      gross += Math.abs(b - a)
    }
    return Math.min(1, gross / 2)
  }

  private buildComparison(
    comparedSnapshotId: number,
    previousPositions: { symbol: string; weight: number; entryPrice: number }[],
    previousBenchmark: number,
    quotes: Map<string, number>,
  ) {
    if (previousPositions.length === 0 || previousBenchmark <= 0) return null
    const currentBenchmark = quotes.get(this.benchmarkSymbol)
    if (!currentBenchmark || currentBenchmark <= 0) return null

    const portfolioReturn = previousPositions.reduce((acc, position) => {
      const currentPrice = quotes.get(position.symbol)
      if (!currentPrice || position.entryPrice <= 0) return acc
      return acc + position.weight * ((currentPrice - position.entryPrice) / position.entryPrice)
    }, 0)
    const benchmarkReturn = (currentBenchmark - previousBenchmark) / previousBenchmark

    return {
      comparedSnapshotId,
      benchmarkSymbol: this.benchmarkSymbol,
      portfolioReturn,
      benchmarkReturn,
      excessReturn: portfolioReturn - benchmarkReturn,
      maxDrawdownProxy: Math.min(0, portfolioReturn),
      measuredAt: new Date().toISOString(),
    }
  }

  private buildLogReturnMatrix(
    symbols: string[],
    seriesMap: Map<string, NonNullable<Awaited<ReturnType<typeof fetchDailyAdjustedHistory>>>>,
  ) {
    const perSym = new Map<string, Map<string, number>>()
    for (const sym of symbols) {
      const bars = seriesMap.get(sym)
      if (!bars?.length) throw new Error(`Missing series for ${sym}`)
      const m = new Map<string, number>()
      for (const b of bars) {
        m.set(dayKey(b.dateMs), b.adjClose)
      }
      perSym.set(sym, m)
    }

    let inter: Set<string> | null = null
    for (const sym of symbols) {
      const keys = new Set<string>(perSym.get(sym)!.keys())
      inter = inter === null ? keys : new Set<string>([...inter].filter((k: string) => keys.has(k)))
    }
    if (!inter || inter.size < MIN_HISTORY_DAYS + 1) throw new Error('Too few common trading days.')
    const common = [...inter].sort()

    const rows: number[][] = []
    const muDailyCol = new Array(symbols.length).fill(0)

    for (let t = 1; t < common.length; t++) {
      const d0 = common[t - 1]!
      const d1 = common[t]!
      const rets: number[] = []
      let ok = true
      for (let j = 0; j < symbols.length; j++) {
        const sym = symbols[j]!
        const p0 = perSym.get(sym)!.get(d0)
        const p1 = perSym.get(sym)!.get(d1)
        if (!p0 || !p1 || p0 <= 0 || p1 <= 0) {
          ok = false
          break
        }
        rets.push(Math.log(p1 / p0))
      }
      if (ok) rows.push(rets)
    }

    const T = rows.length
    const k = symbols.length
    for (let j = 0; j < k; j++) {
      let s = 0
      for (let i = 0; i < T; i++) s += rows[i]![j]!
      muDailyCol[j] = T > 0 ? s / T : 0
    }

    return { rows, muDailyCol }
  }

  private async resolveSymbols(input: {
    n: number
    policy: QuantUniversePolicy
    keepCount: number
    rng: () => number
    scenario: PortfolioScenario | null
    jobId: number
  }): Promise<string[]> {
    const { n, policy, keepCount, rng, scenario } = input
    const pool = [...SP500_SYMBOLS]

    if (policy === 'keep') {
      if (!scenario?.symbols?.length) throw new Error('keep: scenario has no symbols')
      const sy = normalizeSyms(scenario.symbols)
      if (sy.length < n) throw new Error('keep: scenario has fewer symbols than N')
      return sy.slice(0, n)
    }

    if (policy === 'keep_some' && scenario) {
      const prev = this.store.getLatestPortfolioSnapshot(scenario.id)
      const positions = prev ? this.store.getPortfolioPositions(prev.id) : []
      const hold = Math.min(keepCount, n, positions.length)
      const shuffledPos = [...positions].sort(() => rng() - 0.5)
      const pinned = shuffledPos.slice(0, hold).map((p) => p.symbol.toUpperCase())
      const need = n - pinned.length
      const exclude = new Set(pinned)
      shuffleInPlace(pool, rng)
      const picked = new Set<string>(pinned)
      const out = [...pinned]

      let attempts = 0
      while (out.length < n && attempts < MAX_SAMPLE_ATTEMPTS) {
        const batch: string[] = []
        for (const s of pool) {
          if (batch.length >= need) break
          if (picked.has(s) || exclude.has(s)) continue
          batch.push(s)
          picked.add(s)
          if (batch.length >= Math.min(need, 16)) break
        }
        if (batch.length === 0) break

        const valid = await this.filterValidSymbols(batch)
        for (const s of valid) {
          if (out.length >= n) break
          out.push(s)
        }
        attempts++
      }

      if (out.length !== n) throw new Error('keep_some: could not fill symbol universe.')
      return normalizeSyms(out)
    }

    shuffleInPlace(pool, rng)
    const out: string[] = []
    const used = new Set<string>()
    let i = 0
    while (out.length < n && i < pool.length * 8) {
      const batch: string[] = []
      while (batch.length < 32 && i < pool.length) {
        const s = pool[i++]!
        if (used.has(s)) continue
        used.add(s)
        batch.push(s)
      }
      if (batch.length === 0) break
      const valid = await this.filterValidSymbols(batch)
      this.updateJob(input.jobId, {
        step: 'sampling',
        detail: `Validated ${valid.length}/${batch.length} in batch (${out.length}/${n} in portfolio)`,
        progress: 10,
      })
      for (const s of valid) {
        if (out.length >= n) break
        out.push(s)
      }
    }
    if (out.length !== n) throw new Error(`Could only validate ${out.length} liquid symbols; need ${n}.`)
    return normalizeSyms(out)
  }

  private async filterValidSymbols(candidates: string[]): Promise<string[]> {
    const results = await mapWithConcurrency(candidates, 8, async (sym) => {
      const y = yahooSymbol(sym)
      const bars = await fetchDailyAdjustedHistory(this.fetcher, y)
      if (!bars || bars.length < MIN_HISTORY_DAYS) return null
      return sym
    })
    return results.filter((x): x is string => x !== null)
  }
}

const normalizeSyms = (syms: string[]) => [...new Set(syms.map((s) => s.trim().toUpperCase()).filter(Boolean))]
