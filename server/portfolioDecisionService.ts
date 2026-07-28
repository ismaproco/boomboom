import type {
  OptimizedPortfolioMetrics,
  OptimizedPortfoliosResponse,
  PortfolioComparison,
  PortfolioBracketParticipant,
  PortfolioBracketMode,
  PortfolioBracketResponse,
  PortfolioBracketRankScope,
  PortfolioBracketSource,
  PortfolioDecision,
  PortfolioDecisionAllocation,
  PortfolioDecisionNewsTheme,
  PortfolioDecisionProfile,
  PortfolioDecisionRun,
  PortfolioDecisionResponse,
  PortfolioDailySurvivor,
  PortfolioPosition,
  PortfolioRepository,
  PortfolioRiskFlag,
  PortfolioScenario,
  PortfolioSnapshot,
  PopularRepository,
  PositionDecision,
  PositionRiskFlag,
} from './types'

const SINGLE_NAME_CAP = 0.1
const TACTICAL_NAME_CAP = 0.05
const NEGATIVE_ACTIVE_WEIGHT = 0.001
const DECISION_CACHE_MS = 5 * 60_000
const DECISION_RUN_PERSIST_MS = 15 * 60_000
const INTRADAY_HALF_LIFE_HOURS = 12
const INTRADAY_SAMPLE_FLOOR = 3

type PortfolioBundle = {
  scenario: PortfolioScenario
  snapshot: PortfolioSnapshot | null
  positions: PortfolioPosition[]
  comparison: PortfolioComparison | null
  optimizedMetrics: OptimizedPortfolioMetrics | null
}

type DecisionEngineInput = {
  bundles: PortfolioBundle[]
  newsThemes: PortfolioDecisionNewsTheme[]
  profile: PortfolioDecisionProfile
  asOf: string
}

const profileTemplates: Record<PortfolioDecisionProfile, Record<string, number>> = {
  conservative: { 'Capital Shield': 55, 'Balanced Engine': 30, 'Growth Core': 15, Momentum: 0, Speculative: 0 },
  balanced: { 'Growth Core': 35, 'Balanced Engine': 30, 'Capital Shield': 25, Momentum: 5, Speculative: 5 },
  aggressive: { 'Growth Core': 45, 'Balanced Engine': 25, 'Capital Shield': 15, Momentum: 8, Speculative: 7 },
}

export const parseDecisionProfile = (value: unknown): PortfolioDecisionProfile =>
  value === 'conservative' || value === 'aggressive' || value === 'balanced' ? value : 'balanced'

export class PortfolioDecisionService {
  private responseCache = new Map<PortfolioDecisionProfile, { expiresAt: number; response: PortfolioDecisionResponse }>()

  constructor(
    private readonly portfolios: PortfolioRepository,
    private readonly popular: PopularRepository,
    private readonly optimizedSummary: () => Promise<OptimizedPortfoliosResponse>,
  ) {}

  getDecisions(profile: PortfolioDecisionProfile): Promise<PortfolioDecisionResponse> {
    return this.buildDecisions(profile, { persistRun: true })
  }

  warmDecisions(profile: PortfolioDecisionProfile = 'balanced') {
    return this.buildDecisions(profile, { persistRun: false, forceRefresh: true })
  }

  private async buildDecisions(
    profile: PortfolioDecisionProfile,
    options: { persistRun: boolean; forceRefresh?: boolean },
  ): Promise<PortfolioDecisionResponse> {
    const cached = this.responseCache.get(profile)
    if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.response
    const optimized = await this.optimizedSummary()
    const optimizedByScenarioId = new Map(optimized.tiers.map((tier) => [tier.scenario.id, tier.metrics]))
    const scenarios = this.portfolios.listPortfolioScenarios()
    const bundles = scenarios.map((scenario): PortfolioBundle => {
      const snapshot = this.portfolios.getLatestPortfolioSnapshot(scenario.id)
      const positions = snapshot ? this.portfolios.getPortfolioPositions(snapshot.id).filter((position) => position.weight > 0) : []
      return {
        scenario,
        snapshot,
        positions,
        comparison: snapshot ? this.portfolios.getLatestPortfolioComparison(snapshot.id) : null,
        optimizedMetrics: optimizedByScenarioId.get(scenario.id) ?? null,
      }
    })
    const newsThemes = inferPortfolioNewsThemes(this.popular)
    const asOf = new Date().toISOString()
    const marketSessionDate = getNyseSessionDate(new Date(asOf))
    const response = buildPortfolioDecisionResponse({
      bundles,
      newsThemes,
      profile,
      asOf,
      dailySurvivors: this.portfolios.getDailySurvivors(marketSessionDate),
    })
    this.responseCache.set(profile, { expiresAt: Date.now() + DECISION_CACHE_MS, response })
    if (options.persistRun && this.shouldPersistRun(profile, marketSessionDate, asOf))
      this.portfolios.savePortfolioDecisionRun({
        createdAt: asOf,
        marketSessionDate,
        profile,
        status: 'intraday',
        portfolioRankings: response.portfolioRankings,
        positionDecisions: response.positionDecisions,
        newsThemes: response.newsThemes,
        dailyChecklist: response.dailyChecklist,
        assumptions: response.assumptions,
      })
    return response
  }

  private shouldPersistRun(profile: PortfolioDecisionProfile, marketSessionDate: string, asOf: string) {
    const latest = this.portfolios.getLatestPortfolioDecisionRun(profile, marketSessionDate)
    if (!latest) return true
    return Date.parse(asOf) - Date.parse(latest.createdAt) >= DECISION_RUN_PERSIST_MS
  }

  getLatestRun(profile?: PortfolioDecisionProfile) {
    return this.portfolios.getLatestPortfolioDecisionRun(profile)
  }

  getRuns(limit = 30) {
    return this.portfolios.getPortfolioDecisionRuns(limit)
  }

  getDailySurvivors(marketSessionDate?: string) {
    return this.portfolios.getDailySurvivors(marketSessionDate)
  }

  getBracket(
    input: { startDate?: unknown; endDate?: unknown; mode?: unknown; source?: unknown; rankScope?: unknown } = {},
  ): PortfolioBracketResponse {
    const range = resolveBracketDateRange(input.startDate, input.endDate)
    const mode = parseBracketMode(input.mode)
    const source = parseBracketSource(input.source)
    const rankScope = parseBracketRankScope(input.rankScope)
    if (mode === 'intraday') {
      const runs = this.portfolios.getPortfolioDecisionRunsRange(range.startDate, range.endDate)
      const scenarios = new Map(this.portfolios.listPortfolioScenarios().map((scenario) => [scenario.id, scenario]))
      return buildIntradayPortfolioBracket({
        runs,
        scenarios,
        source,
        rankScope,
        startDate: range.startDate,
        endDate: range.endDate,
        defaultRange: range.defaultRange,
        updatedAt: new Date().toISOString(),
      })
    }
    const scenarios = new Map(this.portfolios.listPortfolioScenarios().map((scenario) => [scenario.id, scenario]))
    const survivors = this.portfolios
      .getDailySurvivorsRange(range.startDate, range.endDate)
      .filter((survivor) => source === 'all' || scenarios.get(survivor.scenarioId)?.source === source)
    return buildPortfolioBracket({
      survivors,
      scenarios,
      source,
      startDate: range.startDate,
      endDate: range.endDate,
      defaultRange: range.defaultRange,
      updatedAt: new Date().toISOString(),
    })
  }

  async finalizeDailySurvivors(profile: PortfolioDecisionProfile = 'balanced', date = getFinalizableNyseSessionDate(new Date())) {
    let run = this.portfolios.getLatestPortfolioDecisionRun(profile, date)
    if (!run) {
      await this.getDecisions(profile)
      run = this.portfolios.getLatestPortfolioDecisionRun(profile, date)
    }
    if (!run) return { marketSessionDate: date, survivors: [] as PortfolioDailySurvivor[] }
    const selectedAt = new Date().toISOString()
    const survivors = selectDailySurvivors(run, (scenarioId) => this.portfolios.getLatestPortfolioSnapshot(scenarioId))
    this.portfolios.replaceDailySurvivors({ marketSessionDate: date, decisionRunId: run.id, survivors, selectedAt })
    this.portfolios.updatePortfolioDecisionRunStatus(run.id, 'finalized')
    this.responseCache.delete(profile)
    return { marketSessionDate: date, survivors: this.portfolios.getDailySurvivors(date) }
  }

  async finalizeBalancedSurvivorsIfDue() {
    if (getFinalizableNyseSessionDate(new Date()) !== getNyseSessionDate(new Date())) return
    await this.finalizeDailySurvivors('balanced')
    await this.warmDecisions('balanced')
  }
}

export const buildPortfolioBracket = ({
  survivors,
  scenarios,
  source,
  startDate,
  endDate,
  defaultRange,
  updatedAt,
}: {
  survivors: PortfolioDailySurvivor[]
  scenarios?: Map<number, PortfolioScenario>
  source?: PortfolioBracketSource
  startDate: string
  endDate: string
  defaultRange: boolean
  updatedAt: string
}): PortfolioBracketResponse => {
  const participants = buildBracketParticipants(survivors, scenarios)
  const rounds = buildBracketRounds(participants, 'aggregate_survivor_score')
  const champion = rounds.at(-1)?.matches[0]?.winner ?? participants[0] ?? null
  return {
    updatedAt,
    startDate,
    endDate,
    defaultRange,
    mode: 'finalized',
    source: source ?? 'all',
    rankScope: 'survivors',
    asOf: survivors[0]?.selectedAt ?? null,
    participantCount: participants.length,
    sourceSurvivorCount: survivors.length,
    champion,
    participants,
    rounds,
    assumptions: [
      'Default bracket range is the latest seven calendar days ending today unless custom dates are provided.',
      'Participants are seeded by aggregate survivor score across the selected period.',
      'Head-to-head winners advance by aggregate survivor score; realized excess return is used as the first tiebreaker.',
      'Only portfolios present in persisted daily survivor history can enter the bracket.',
    ],
  }
}

const buildBracketParticipants = (
  survivors: PortfolioDailySurvivor[],
  scenarios?: Map<number, PortfolioScenario>,
): PortfolioBracketParticipant[] => {
  const byScenario = new Map<number, PortfolioDailySurvivor[]>()
  for (const survivor of survivors) {
    const entries = byScenario.get(survivor.scenarioId) ?? []
    entries.push(survivor)
    byScenario.set(survivor.scenarioId, entries)
  }

  return Array.from(byScenario.entries())
    .map(([scenarioId, entries]) => {
      const sorted = entries
        .slice()
        .sort((left, right) => right.marketSessionDate.localeCompare(left.marketSessionDate) || left.rank - right.rank)
      const activeDates = Array.from(new Set(sorted.map((entry) => entry.marketSessionDate))).sort()
      const totalSurvivorScore = sum(sorted.map((entry) => entry.survivorScore))
      return {
        seed: 0,
        scenarioId,
        scenarioName: sorted[0]?.scenarioName ?? `Portfolio ${scenarioId}`,
        source: scenarios?.get(scenarioId)?.source,
        appearanceCount: sorted.length,
        activeDates,
        totalSurvivorScore: roundMetric(totalSurvivorScore),
        averageSurvivorScore: roundMetric(totalSurvivorScore / sorted.length),
        averageDecisionScore: roundMetric(sum(sorted.map((entry) => entry.decisionScore)) / sorted.length),
        averageRealizedExcessReturn: averageNullable(sorted.map((entry) => entry.realizedExcessReturn)),
        averageMaxDrawdown: averageNullable(sorted.map((entry) => entry.maxDrawdown)),
        averageTopFiveConcentration: averageNullable(sorted.map((entry) => entry.topFiveConcentration)),
        averageTurnoverRatio: averageNullable(sorted.map((entry) => entry.turnoverRatio)),
        latestRunAt: sorted[0]?.selectedAt ?? null,
        averageRank: roundMetric(sum(sorted.map((entry) => entry.rank)) / sorted.length),
        scoreStability: scoreStability(sorted.map((entry) => entry.survivorScore)),
        latestSelectionReason: sorted[0]?.selectionReason ?? 'No selection rationale available.',
      }
    })
    .sort(compareBracketParticipants)
    .map((participant, index) => ({ ...participant, seed: index + 1 }))
}

const buildIntradayPortfolioBracket = ({
  runs,
  scenarios,
  source,
  rankScope,
  startDate,
  endDate,
  defaultRange,
  updatedAt,
}: {
  runs: PortfolioDecisionRun[]
  scenarios: Map<number, PortfolioScenario>
  source: PortfolioBracketSource
  rankScope: PortfolioBracketRankScope
  startDate: string
  endDate: string
  defaultRange: boolean
  updatedAt: string
}): PortfolioBracketResponse => {
  const entries = buildIntradayEntries(runs, scenarios, source, rankScope)
  const participants = buildIntradayParticipants(entries)
  const rounds = buildBracketRounds(participants, 'recency_weighted_intraday_score')
  const champion = rounds.at(-1)?.matches[0]?.winner ?? participants[0] ?? null
  return {
    updatedAt,
    startDate,
    endDate,
    defaultRange,
    mode: 'intraday',
    source,
    rankScope,
    asOf: runs[0]?.createdAt ?? null,
    participantCount: participants.length,
    sourceSurvivorCount: entries.length,
    champion,
    participants,
    rounds,
    assumptions: [
      'Intraday brackets use every ranked portfolio from persisted decision runs in the selected date range.',
      'Run observations are recency-weighted with a 12-hour half-life so newer checks matter more.',
      'Portfolios with fewer than three intraday samples receive a confidence penalty rather than being excluded.',
      'Head-to-head winners advance by recency-weighted intraday score; realized excess return is used as the first tiebreaker.',
    ],
  }
}

type IntradayBracketEntry = {
  runId: number
  runAt: string
  marketSessionDate: string
  scenarioId: number
  scenarioName: string
  source: PortfolioBracketParticipant['source']
  rank: number
  score: number
  decisionScore: number
  realizedExcessReturn: number | null
  maxDrawdown: number | null
  topFiveConcentration: number | null
  turnoverRatio: number | null
  reason: string
}

const buildIntradayEntries = (
  runs: PortfolioDecisionRun[],
  scenarios: Map<number, PortfolioScenario>,
  source: PortfolioBracketSource,
  rankScope: PortfolioBracketRankScope,
): IntradayBracketEntry[] =>
  runs.flatMap((run) => {
    const rankings = rankScope === 'survivors' ? run.portfolioRankings.slice(0, 3) : run.portfolioRankings
    return rankings.flatMap((decision, index) => {
      const scenario = scenarios.get(decision.portfolioId)
      if (source !== 'all' && scenario?.source !== source) return []
      const score = calculateIntradayPlayoffScore(decision)
      return [
        {
          runId: run.id,
          runAt: run.createdAt,
          marketSessionDate: run.marketSessionDate,
          scenarioId: decision.portfolioId,
          scenarioName: decision.portfolioName,
          source: scenario?.source,
          rank: index + 1,
          score,
          decisionScore: decision.score,
          realizedExcessReturn: decision.metrics.excessReturn,
          maxDrawdown: decision.metrics.maxDrawdown,
          topFiveConcentration: decision.metrics.topFiveConcentration,
          turnoverRatio: decision.metrics.turnoverRatio,
          reason: `Intraday rank #${index + 1} with decision score ${decision.score.toFixed(1)} and playoff score ${score.toFixed(1)}.`,
        },
      ]
    })
  })

const buildIntradayParticipants = (entries: IntradayBracketEntry[]): PortfolioBracketParticipant[] => {
  const latestMs = Math.max(...entries.map((entry) => Date.parse(entry.runAt)).filter(Number.isFinite), Date.now())
  const byScenario = new Map<number, IntradayBracketEntry[]>()
  for (const entry of entries) {
    const current = byScenario.get(entry.scenarioId) ?? []
    current.push(entry)
    byScenario.set(entry.scenarioId, current)
  }

  return Array.from(byScenario.entries())
    .map(([scenarioId, scenarioEntries]) => {
      const sorted = scenarioEntries.slice().sort((left, right) => right.runAt.localeCompare(left.runAt) || left.rank - right.rank)
      let weightedScore = 0
      let weightTotal = 0
      for (const entry of sorted) {
        const ageHours = Math.max(0, (latestMs - Date.parse(entry.runAt)) / 3_600_000)
        const weight = Math.pow(0.5, ageHours / INTRADAY_HALF_LIFE_HOURS)
        weightedScore += entry.score * weight
        weightTotal += weight
      }
      const confidence = Math.min(1, sorted.length / INTRADAY_SAMPLE_FLOOR)
      const totalSurvivorScore = (weightTotal > 0 ? weightedScore / weightTotal : 0) * (0.8 + 0.2 * confidence)
      return {
        seed: 0,
        scenarioId,
        scenarioName: sorted[0]?.scenarioName ?? `Portfolio ${scenarioId}`,
        source: sorted[0]?.source,
        appearanceCount: sorted.length,
        activeDates: Array.from(new Set(sorted.map((entry) => entry.marketSessionDate))).sort(),
        totalSurvivorScore: roundMetric(totalSurvivorScore),
        averageSurvivorScore: roundMetric(sum(sorted.map((entry) => entry.score)) / sorted.length),
        averageDecisionScore: roundMetric(sum(sorted.map((entry) => entry.decisionScore)) / sorted.length),
        averageRealizedExcessReturn: averageNullable(sorted.map((entry) => entry.realizedExcessReturn)),
        averageMaxDrawdown: averageNullable(sorted.map((entry) => entry.maxDrawdown)),
        averageTopFiveConcentration: averageNullable(sorted.map((entry) => entry.topFiveConcentration)),
        averageTurnoverRatio: averageNullable(sorted.map((entry) => entry.turnoverRatio)),
        latestRunAt: sorted[0]?.runAt ?? null,
        averageRank: roundMetric(sum(sorted.map((entry) => entry.rank)) / sorted.length),
        scoreStability: scoreStability(sorted.map((entry) => entry.score)),
        intradaySampleCount: sorted.length,
        latestSelectionReason: sorted[0]?.reason ?? 'No intraday rationale available.',
      }
    })
    .sort(compareBracketParticipants)
    .map((participant, index) => ({ ...participant, seed: index + 1 }))
}

const buildBracketRounds = (
  participants: PortfolioBracketParticipant[],
  decisionBasis: 'aggregate_survivor_score' | 'recency_weighted_intraday_score',
) => {
  if (participants.length < 2) return []
  const size = nextPowerOfTwo(participants.length)
  let slots = seedBracketSlots(participants, size)
  const rounds = []
  const totalRounds = Math.ceil(Math.log2(size))
  for (let round = 1; round <= totalRounds; round += 1) {
    const matches = []
    const winners: Array<PortfolioBracketParticipant | null> = []
    for (let index = 0; index < slots.length; index += 2) {
      const left = slots[index] ?? null
      const right = slots[index + 1] ?? null
      const winner = chooseMatchWinner(left, right)
      winners.push(winner)
      matches.push({
        id: `r${round}-m${matches.length + 1}`,
        round,
        roundName: roundName(round, totalRounds),
        matchNumber: matches.length + 1,
        left,
        right,
        leftScore: left ? left.totalSurvivorScore : null,
        rightScore: right ? right.totalSurvivorScore : null,
        winner,
        isBye: Boolean((left && !right) || (!left && right)),
        decisionBasis,
      })
    }
    rounds.push({ round, name: roundName(round, totalRounds), matches })
    slots = winners
  }
  return rounds
}

const resolveBracketDateRange = (startInput: unknown, endInput: unknown) => {
  const today = getNyseSessionDate(new Date())
  const parsedStart = parseDateKey(startInput)
  const parsedEnd = parseDateKey(endInput)
  const defaultRange = !parsedStart && !parsedEnd
  const endDate = parsedEnd ?? today
  const startDate = parsedStart ?? addDays(endDate, -6)
  return startDate <= endDate ? { startDate, endDate, defaultRange } : { startDate: endDate, endDate: startDate, defaultRange }
}

const seedBracketSlots = (participants: PortfolioBracketParticipant[], size: number) => {
  const slots: Array<PortfolioBracketParticipant | null> = Array.from({ length: size }, () => null)
  const seeds = seedOrder(size)
  participants.forEach((participant, index) => {
    const seed = index + 1
    const slot = seeds.indexOf(seed)
    if (slot >= 0) slots[slot] = participant
  })
  return slots
}

const seedOrder = (size: number): number[] => {
  let order = [1, 2]
  while (order.length < size) {
    const nextSize = order.length * 2 + 1
    order = order.flatMap((seed) => [seed, nextSize - seed])
  }
  return order
}

const chooseMatchWinner = (left: PortfolioBracketParticipant | null, right: PortfolioBracketParticipant | null) => {
  if (!left) return right
  if (!right) return left
  return compareBracketParticipants(left, right) <= 0 ? left : right
}

const compareBracketParticipants = (left: PortfolioBracketParticipant, right: PortfolioBracketParticipant) =>
  right.totalSurvivorScore - left.totalSurvivorScore ||
  (right.averageRealizedExcessReturn ?? -Infinity) - (left.averageRealizedExcessReturn ?? -Infinity) ||
  right.averageDecisionScore - left.averageDecisionScore ||
  left.scenarioName.localeCompare(right.scenarioName)

const roundName = (round: number, totalRounds: number) => {
  if (round === totalRounds) return 'Final'
  if (round === totalRounds - 1) return 'Semifinals'
  if (round === totalRounds - 2) return 'Quarterfinals'
  return `Round ${round}`
}

const averageNullable = (values: Array<number | null>) => {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value))
  return valid.length > 0 ? roundMetric(sum(valid) / valid.length) : null
}

const scoreStability = (values: number[]) => {
  if (values.length < 2) return null
  const mean = sum(values) / values.length
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length
  return roundMetric(Math.sqrt(variance))
}

const calculateIntradayPlayoffScore = (decision: PortfolioDecision) => {
  const realizedScore = clamp01(((decision.metrics.excessReturn ?? -0.03) + 0.03) / 0.09) * 100
  const decisionScore = clamp01(decision.score / 100) * 100
  const drawdownScore = clamp01(1 - Math.abs(Math.min(0, decision.metrics.maxDrawdown ?? -0.1)) / 0.2) * 100
  const concentrationScore = clamp01(1 - Math.max(0, decision.metrics.topFiveConcentration - 0.25) / 0.75) * 100
  const turnoverScore = clamp01(1 - Math.max(0, decision.metrics.turnoverRatio ?? 0) / 1) * 100
  return (
    Math.round((realizedScore * 0.3 + decisionScore * 0.3 + drawdownScore * 0.2 + concentrationScore * 0.1 + turnoverScore * 0.1) * 10) / 10
  )
}

const sum = (values: number[]) => values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0)
const roundMetric = (value: number) => Math.round(value * 10_000) / 10_000
const nextPowerOfTwo = (value: number) => 2 ** Math.ceil(Math.log2(Math.max(2, value)))
const parseDateKey = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null)
const parseBracketMode = (value: unknown): PortfolioBracketMode => (value === 'intraday' ? 'intraday' : 'finalized')
const parseBracketSource = (value: unknown): PortfolioBracketSource => (value === 'optimized' || value === 'manual' ? value : 'all')
const parseBracketRankScope = (value: unknown): PortfolioBracketRankScope => (value === 'all' ? 'all' : 'survivors')
const addDays = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export const buildPortfolioDecisionResponse = ({
  bundles,
  newsThemes,
  profile,
  asOf,
  dailySurvivors = [],
}: DecisionEngineInput & { dailySurvivors?: PortfolioDailySurvivor[] }): PortfolioDecisionResponse => {
  const portfolioRankings = bundles
    .map((bundle) => buildPortfolioDecision(bundle, newsThemes, profile))
    .sort((left, right) => right.score - left.score)
  const recommendedAllocation = buildAllocation(portfolioRankings, profile)
  const positionDecisions = buildPositionDecisions(bundles, newsThemes)
  const riskFlags = portfolioRankings.flatMap((decision) => decision.riskFlags)
  return {
    updatedAt: asOf,
    asOf,
    riskProfile: profile,
    productFraming: 'exploratory_decision_overlay',
    assumptions: [
      'This endpoint is an overlay: it does not mutate optimized or manual portfolio weights.',
      'Optimizer raw weights are treated as model outputs; decision caps translate them into daily risk controls.',
      'Expected return and Sharpe are model signals, while concentration, beta, drawdown, and data-quality flags drive guardrails.',
      'Realized comparison gaps are flagged because new portfolios may not have enough daily adjusted-close history.',
    ],
    portfolioRankings,
    recommendedAllocation,
    positionDecisions,
    riskFlags,
    newsThemes,
    dailyChecklist: buildDailyChecklist(portfolioRankings, positionDecisions, newsThemes),
    dailySurvivors,
  }
}

const buildPortfolioDecision = (
  bundle: PortfolioBundle,
  newsThemes: PortfolioDecisionNewsTheme[],
  profile: PortfolioDecisionProfile,
): PortfolioDecision => {
  const metrics = summarizePortfolioMetrics(bundle)
  const flags = buildPortfolioFlags(bundle, metrics)
  const role = classifyPortfolioRole(bundle.scenario, metrics)
  const negativePenalty = flags.some((flag) => flag.code === 'negative_active_signal') ? 8 : 0
  const concentrationPenalty =
    Math.max(0, metrics.topFiveConcentration - 0.6) * 60 + Math.max(0, largestWeight(bundle.positions) - SINGLE_NAME_CAP) * 120
  const historyPenalty = flags.some((flag) => flag.code === 'insufficient_history') ? 4 : 0
  const defensiveBoost = role === 'defensive_anchor' && oilThemeIsHeadwind(newsThemes) ? 8 : 0
  const score =
    Math.round(
      (baseRoleScore(role) + metricScore(metrics) + defensiveBoost - negativePenalty - concentrationPenalty - historyPenalty) * 10,
    ) / 10
  const action = choosePortfolioAction(role, flags, metrics)
  const suggestedAllocationPct = targetForPortfolio(bundle.scenario.name, profile, role, flags, metrics)
  const maxAllocationPct = Math.max(suggestedAllocationPct, suggestedAllocationPct + (role === 'tactical_satellite' ? 5 : 15))
  return {
    portfolioId: bundle.scenario.id,
    portfolioName: bundle.scenario.name,
    latestSnapshotId: bundle.snapshot?.id ?? null,
    source: bundle.scenario.source,
    refreshMode: bundle.scenario.refreshMode,
    action,
    conviction: score >= 70 && flags.filter((flag) => flag.severity === 'high').length === 0 ? 'high' : score >= 45 ? 'medium' : 'low',
    role,
    score,
    suggestedAllocationPct,
    maxAllocationPct,
    metrics,
    riskFlags: flags,
    rationale: buildPortfolioRationale(role, action, flags, metrics),
  }
}

const summarizePortfolioMetrics = (bundle: PortfolioBundle): PortfolioDecision['metrics'] => {
  const weights = bundle.positions.map((position) => position.weight).sort((left, right) => right - left)
  const topFiveConcentration = bundle.optimizedMetrics?.topFiveConcentration ?? weights.slice(0, 5).reduce((sum, weight) => sum + weight, 0)
  const effectiveHoldings = bundle.optimizedMetrics?.effectiveHoldings ?? effectiveHoldingCount(weights)
  return {
    expectedReturn: bundle.snapshot?.expectedReturn ?? null,
    sharpeRatio: bundle.optimizedMetrics?.sharpeRatio ?? null,
    annualizedVolatility: bundle.optimizedMetrics?.annualizedVolatility ?? null,
    betaVsBenchmark: bundle.optimizedMetrics?.betaVsBenchmark ?? null,
    maxDrawdown: bundle.optimizedMetrics?.maxDrawdown ?? bundle.comparison?.maxDrawdownProxy ?? null,
    topFiveConcentration,
    effectiveHoldings,
    turnoverRatio: bundle.snapshot?.turnoverRatio ?? null,
    excessReturn: bundle.comparison?.excessReturn ?? null,
  }
}

const buildPortfolioFlags = (bundle: PortfolioBundle, metrics: PortfolioDecision['metrics']): PortfolioRiskFlag[] => {
  const flags: PortfolioRiskFlag[] = []
  const maxWeight = largestWeight(bundle.positions)
  const negativeActive = bundle.positions.filter((position) => position.weight > NEGATIVE_ACTIVE_WEIGHT && position.impliedReturn < 0)
  if (maxWeight > SINGLE_NAME_CAP)
    flags.push({
      code: 'single_name_concentration',
      severity: 'medium',
      message: `Largest position is ${(maxWeight * 100).toFixed(1)}%, above the 10% decision cap.`,
    })
  if (maxWeight > 0.25)
    flags.push({
      code: 'extreme_single_name_concentration',
      severity: 'high',
      message: `Largest position is ${(maxWeight * 100).toFixed(1)}%, a corner-solution risk.`,
    })
  if (metrics.topFiveConcentration > 0.6)
    flags.push({
      code: 'top_five_concentration',
      severity: metrics.topFiveConcentration > 0.8 ? 'high' : 'medium',
      message: `Top five concentration is ${(metrics.topFiveConcentration * 100).toFixed(1)}%.`,
    })
  if (metrics.effectiveHoldings < 10)
    flags.push({
      code: 'low_effective_holdings',
      severity: metrics.effectiveHoldings < 5 ? 'high' : 'medium',
      message: `Effective holdings are ${metrics.effectiveHoldings.toFixed(1)}, limiting diversification.`,
    })
  if (bundle.scenario.quantMethod === 'max_sharpe' && metrics.topFiveConcentration > 0.8)
    flags.push({
      code: 'optimizer_corner_solution',
      severity: 'high',
      message: 'Max-Sharpe optimizer produced a highly concentrated corner solution.',
    })
  if ((metrics.turnoverRatio ?? 0) > 0.5)
    flags.push({ code: 'high_turnover', severity: 'medium', message: `Turnover is ${((metrics.turnoverRatio ?? 0) * 100).toFixed(1)}%.` })
  if ((metrics.turnoverRatio ?? 0) > 0.9)
    flags.push({ code: 'full_rotation', severity: 'high', message: 'Portfolio is close to a full rotation versus the prior snapshot.' })
  if (negativeActive.length > 0)
    flags.push({
      code: 'negative_active_signal',
      severity: 'medium',
      message: `${negativeActive.length} active positions have negative implied return.`,
    })
  if (bundle.comparison === null)
    flags.push({ code: 'insufficient_history', severity: 'low', message: 'Latest snapshot lacks a realized comparison row.' })
  return flags
}

const classifyPortfolioRole = (scenario: PortfolioScenario, metrics: PortfolioDecision['metrics']): PortfolioDecision['role'] => {
  if (scenario.name === 'Momentum Hunter' || scenario.name === 'Speculative Burst') return 'tactical_satellite'
  if (scenario.quantMethod === 'max_sharpe' && metrics.topFiveConcentration > 0.8 && scenario.name !== 'Growth Core')
    return 'unstable_optimizer'
  if (scenario.name === 'Capital Shield' || ((metrics.betaVsBenchmark ?? 1) < 0.4 && (metrics.annualizedVolatility ?? 1) < 0.12))
    return 'defensive_anchor'
  if (
    scenario.name === 'Balanced Engine' ||
    (scenario.refreshMode === 'quant' && metrics.effectiveHoldings > 20 && metrics.topFiveConcentration < 0.3)
  )
    return 'diversified_active'
  if (scenario.name === 'Growth Core' || ((metrics.sharpeRatio ?? 0) > 2 && (metrics.betaVsBenchmark ?? 2) < 1)) return 'alpha_source'
  return 'news_signal'
}

const choosePortfolioAction = (
  role: PortfolioDecision['role'],
  flags: PortfolioRiskFlag[],
  metrics: PortfolioDecision['metrics'],
): PortfolioDecision['action'] => {
  if (role === 'unstable_optimizer') return 'avoid'
  if (flags.some((flag) => flag.code === 'extreme_single_name_concentration' || flag.code === 'optimizer_corner_solution'))
    return role === 'tactical_satellite' ? 'trim' : 'watch'
  if (role === 'tactical_satellite' && metrics.effectiveHoldings < 5) return 'trim'
  if (role === 'defensive_anchor' || role === 'diversified_active') return 'hold'
  if (role === 'alpha_source') return metrics.topFiveConcentration > 0.7 ? 'hold' : 'increase'
  return (metrics.excessReturn ?? 0) < 0 ? 'watch' : 'hold'
}

const buildPortfolioRationale = (
  role: PortfolioDecision['role'],
  action: PortfolioDecision['action'],
  flags: PortfolioRiskFlag[],
  metrics: PortfolioDecision['metrics'],
) => {
  const rationale = [`Classified as ${role.replaceAll('_', ' ')} with a ${action} action.`]
  if (metrics.sharpeRatio !== null)
    rationale.push(
      `Sharpe ${metrics.sharpeRatio.toFixed(2)} and expected return ${formatPct(metrics.expectedReturn)} are treated as model signals.`,
    )
  if (metrics.betaVsBenchmark !== null)
    rationale.push(`Beta vs SPY is ${metrics.betaVsBenchmark.toFixed(2)}; lower beta improves defensive utility.`)
  if (metrics.topFiveConcentration > 0.6) rationale.push('Concentration caps override raw optimizer weights for daily decisions.')
  if (flags.some((flag) => flag.code === 'insufficient_history'))
    rationale.push('Realized horizon evidence is limited; do not overfit the latest model output.')
  return rationale
}

const buildAllocation = (decisions: PortfolioDecision[], profile: PortfolioDecisionProfile): PortfolioDecisionAllocation[] => {
  const template = profileTemplates[profile]
  return decisions
    .filter(
      (decision) =>
        decision.suggestedAllocationPct > 0 || ['Capital Shield', 'Balanced Engine', 'Growth Core'].includes(decision.portfolioName),
    )
    .slice(0, 8)
    .map((decision) => {
      const raw =
        template[decision.portfolioName] ??
        (decision.portfolioName.includes('Momentum')
          ? (template['Momentum'] ?? 0)
          : decision.portfolioName.includes('Speculative')
            ? (template['Speculative'] ?? 0)
            : 0)
      const reduced = decision.riskFlags.some((flag) => flag.code === 'low_effective_holdings' && flag.severity === 'high')
        ? Math.min(raw, 5)
        : raw
      return {
        portfolioName: decision.portfolioName,
        targetPct: Math.min(reduced, decision.maxAllocationPct),
        maxPct: decision.maxAllocationPct,
        rationale:
          decision.role === 'tactical_satellite'
            ? 'Tactical sleeve is capped because diversification is fragile.'
            : `Template ${profile} allocation adjusted by decision guardrails.`,
      }
    })
}

const buildPositionDecisions = (bundles: PortfolioBundle[], newsThemes: PortfolioDecisionNewsTheme[]): PositionDecision[] => {
  const bySymbol = new Map<string, { weights: number[]; implied: number[]; portfolios: string[]; tactical: boolean }>()
  for (const bundle of bundles) {
    const role = classifyPortfolioRole(bundle.scenario, summarizePortfolioMetrics(bundle))
    for (const position of bundle.positions) {
      const entry = bySymbol.get(position.symbol) ?? { weights: [], implied: [], portfolios: [], tactical: false }
      entry.weights.push(position.weight)
      entry.implied.push(position.impliedReturn)
      entry.portfolios.push(bundle.scenario.name)
      entry.tactical ||= role === 'tactical_satellite'
      bySymbol.set(position.symbol, entry)
    }
  }
  return Array.from(bySymbol.entries())
    .map(([symbol, entry]) => buildPositionDecision(symbol, entry, newsThemes))
    .sort((left, right) => actionRank(left.action) - actionRank(right.action) || right.currentWeight - left.currentWeight)
}

const buildPositionDecision = (
  symbol: string,
  entry: { weights: number[]; implied: number[]; portfolios: string[]; tactical: boolean },
  newsThemes: PortfolioDecisionNewsTheme[],
): PositionDecision => {
  const currentWeight = Math.max(...entry.weights)
  const impliedReturn = entry.implied.reduce((sum, value) => sum + value, 0) / entry.implied.length
  const suggestedMaxWeight = entry.tactical ? TACTICAL_NAME_CAP : SINGLE_NAME_CAP
  const flags: PositionRiskFlag[] = []
  if (currentWeight > suggestedMaxWeight)
    flags.push({
      code: 'over_weight',
      severity: currentWeight > 0.25 ? 'high' : 'medium',
      message: `Current model weight ${(currentWeight * 100).toFixed(1)}% exceeds the ${(suggestedMaxWeight * 100).toFixed(1)}% decision cap.`,
    })
  if (impliedReturn < 0)
    flags.push({ code: 'negative_implied_return', severity: 'medium', message: `Average implied return is ${formatPct(impliedReturn)}.` })
  if (isEnergySymbol(symbol) && oilThemeIsHeadwind(newsThemes))
    flags.push({
      code: 'energy_price_headwind',
      severity: 'medium',
      message: 'Oil/geopolitics theme is a current headwind for direct energy beta.',
    })
  if (entry.tactical && currentWeight > TACTICAL_NAME_CAP)
    flags.push({ code: 'unconfirmed_tactical', severity: 'medium', message: 'Tactical position exceeds the satellite sleeve cap.' })
  const action = flags.some((flag) => flag.code === 'negative_implied_return' || flag.code === 'energy_price_headwind')
    ? 'trim'
    : flags.some((flag) => flag.code === 'over_weight')
      ? 'cap'
      : preferredAddSymbol(symbol, newsThemes)
        ? 'add'
        : 'hold'
  return {
    symbol,
    action,
    conviction: action === 'add' && impliedReturn > 0.1 ? 'high' : flags.some((flag) => flag.severity === 'high') ? 'high' : 'medium',
    currentWeight,
    suggestedMaxWeight,
    impliedReturn,
    portfolios: Array.from(new Set(entry.portfolios)),
    rationale: buildPositionRationale(symbol, action, impliedReturn, currentWeight, suggestedMaxWeight, newsThemes),
    flags,
  }
}

export const inferPortfolioNewsThemes = (popular: PopularRepository): PortfolioDecisionNewsTheme[] => {
  const snapshot = popular.getLatestSnapshot()
  const items = snapshot ? popular.getItems(snapshot.id).slice(0, 25) : []
  const text = items
    .map((item) => `${item.headline} ${item.summary} ${item.section} ${item.keywords.join(' ')}`)
    .join(' ')
    .toLowerCase()
  const score = (terms: string[]) => terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0)
  const oilScore = score(['oil', 'iran', 'hormuz', 'peace deal', 'prices slide'])
  const aiScore = score(['ai', 'anthropic', 'spacex', 'compute', 'data center', 'semiconductor'])
  const defensiveScore = score(['war', 'geopolitical', 'shortage', 'rates'])
  return [
    {
      key: 'oil_geopolitics',
      label: 'Oil/geopolitics',
      stance: oilScore >= 2 ? 'headwind' : 'neutral',
      score: oilScore,
      rationale:
        oilScore >= 2 ? 'Recent clusters point to oil price downside/geopolitical repricing.' : 'No dominant oil headwind detected.',
    },
    {
      key: 'ai_infrastructure',
      label: 'AI infrastructure',
      stance: aiScore >= 2 ? 'supportive' : 'neutral',
      score: aiScore,
      rationale:
        aiScore >= 2
          ? 'AI compute/data-center clusters support infrastructure beneficiaries.'
          : 'AI infrastructure signal is not dominant.',
    },
    {
      key: 'data_centers',
      label: 'Data centers',
      stance: aiScore >= 2 ? 'supportive' : 'neutral',
      score: aiScore,
      rationale: 'Data-center language is treated as a subset of the AI infrastructure theme.',
    },
    {
      key: 'defensive_quality',
      label: 'Defensive quality',
      stance: defensiveScore >= 2 ? 'supportive' : 'neutral',
      score: defensiveScore,
      rationale: defensiveScore >= 2 ? 'Macro/geopolitical terms favor lower-beta ballast.' : 'No strong defensive overlay detected.',
    },
    {
      key: 'consumer_defensive',
      label: 'Consumer defensive',
      stance: 'neutral',
      score: score(['consumer', 'retail', 'staples']),
      rationale: 'Consumer-defensive names remain ballast unless implied returns are negative.',
    },
    {
      key: 'financial_market_structure',
      label: 'Financial market structure',
      stance: 'neutral',
      score: score(['exchange', 'market', 'volatility']),
      rationale: 'Market-structure exposure is evaluated primarily through concentration and implied return.',
    },
  ]
}

const targetForPortfolio = (
  name: string,
  profile: PortfolioDecisionProfile,
  role: PortfolioDecision['role'],
  flags: PortfolioRiskFlag[],
  metrics: PortfolioDecision['metrics'],
) => {
  const template = profileTemplates[profile]
  const raw = template[name] ?? (role === 'tactical_satellite' ? 5 : role === 'unstable_optimizer' ? 0 : role === 'news_signal' ? 0 : 10)
  if (role === 'unstable_optimizer') return 0
  if (flags.some((flag) => flag.code === 'low_effective_holdings' && flag.severity === 'high')) return Math.min(raw, 5)
  if (metrics.topFiveConcentration > 0.7 && role === 'alpha_source') return Math.min(raw, 35)
  return raw
}

const buildDailyChecklist = (portfolios: PortfolioDecision[], positions: PositionDecision[], themes: PortfolioDecisionNewsTheme[]) => [
  'Check whether any single position exceeds the 10% total-portfolio cap before adding capital.',
  'Check whether top-five concentration exceeds 60%; if so, rebalance by trimming rather than adding.',
  'Review active positions with negative implied return and require a separate thesis before holding.',
  oilThemeIsHeadwind(themes)
    ? 'Oil/geopolitics theme is a headwind: avoid adding direct energy beta unless independently confirmed.'
    : 'Oil/geopolitics theme is not a dominant headwind today.',
  portfolios.some((portfolio) => portfolio.role === 'tactical_satellite' && portfolio.metrics.effectiveHoldings < 5)
    ? 'Tactical sleeves have low effective holdings; cap them before acting on raw optimizer weights.'
    : 'Tactical sleeve diversification is not the primary constraint today.',
  positions.some((position) => position.action === 'add')
    ? 'Adds are allowed only for names with positive implied return and no overweight flag.'
    : 'No clean add list is available; prioritize risk reduction.',
]

export const selectDailySurvivors = (
  run: PortfolioDecisionRun,
  getLatestSnapshot: (scenarioId: number) => PortfolioSnapshot | null,
): Array<Omit<PortfolioDailySurvivor, 'id' | 'decisionRunId' | 'marketSessionDate' | 'selectedAt'>> =>
  run.portfolioRankings
    .map((decision) => {
      const latestSnapshot = getLatestSnapshot(decision.portfolioId)
      const score = calculateSurvivorScore(decision)
      return {
        scenarioId: decision.portfolioId,
        scenarioName: decision.portfolioName,
        snapshotId: latestSnapshot?.id ?? decision.latestSnapshotId,
        rank: 0,
        survivorScore: score,
        realizedExcessReturn: decision.metrics.excessReturn,
        decisionScore: decision.score,
        maxDrawdown: decision.metrics.maxDrawdown,
        topFiveConcentration: decision.metrics.topFiveConcentration,
        turnoverRatio: decision.metrics.turnoverRatio,
        selectionReason: buildSurvivorReason(decision, score),
      }
    })
    .sort((left, right) => right.survivorScore - left.survivorScore || right.decisionScore - left.decisionScore)
    .slice(0, 3)
    .map((survivor, index) => ({ ...survivor, rank: index + 1 }))

export const calculateSurvivorScore = (decision: PortfolioDecision) => {
  const realizedScore = clamp01(((decision.metrics.excessReturn ?? -0.05) + 0.05) / 0.15) * 100
  const decisionScore = clamp01(decision.score / 100) * 100
  const drawdownScore = clamp01(1 - Math.abs(Math.min(0, decision.metrics.maxDrawdown ?? -0.1)) / 0.2) * 100
  const concentrationScore = clamp01(1 - Math.max(0, decision.metrics.topFiveConcentration - 0.25) / 0.75) * 100
  const turnoverScore = clamp01(1 - Math.max(0, decision.metrics.turnoverRatio ?? 0) / 1) * 100
  return (
    Math.round((realizedScore * 0.35 + decisionScore * 0.25 + drawdownScore * 0.2 + concentrationScore * 0.1 + turnoverScore * 0.1) * 10) /
    10
  )
}

export const getNyseSessionDate = (date: Date) => nyseDateKey(date)

export const getFinalizableNyseSessionDate = (date: Date) => {
  const currentDate = nyseDateKey(date)
  const minutes = nyseMinutes(date)
  return minutes >= 16 * 60 + 10 ? currentDate : previousWeekday(currentDate)
}

const buildPositionRationale = (
  symbol: string,
  action: PositionDecision['action'],
  impliedReturn: number,
  currentWeight: number,
  cap: number,
  themes: PortfolioDecisionNewsTheme[],
) => {
  const rationale = [`${symbol} is marked ${action} with average implied return ${formatPct(impliedReturn)}.`]
  if (currentWeight > cap) rationale.push(`Current model weight ${(currentWeight * 100).toFixed(1)}% exceeds the decision cap.`)
  if (preferredAddSymbol(symbol, themes)) rationale.push('Theme and model support are currently aligned, subject to cap discipline.')
  if (isEnergySymbol(symbol) && oilThemeIsHeadwind(themes)) rationale.push('Direct energy exposure faces an oil-price/news headwind today.')
  return rationale
}

const preferredAddSymbol = (symbol: string, themes: PortfolioDecisionNewsTheme[]) => {
  const strategic = new Set(['GOOGL', 'NVDA', 'IRM', 'SPG', 'CME', 'KO', 'ED', 'WM', 'KMI'])
  if (!strategic.has(symbol)) return false
  if (isEnergySymbol(symbol)) return !oilThemeIsHeadwind(themes)
  return true
}

const metricScore = (metrics: PortfolioDecision['metrics']) =>
  (metrics.sharpeRatio ?? 0) * 8 +
  (metrics.expectedReturn ?? 0) * 40 -
  (metrics.annualizedVolatility ?? 0) * 20 -
  Math.max(0, (metrics.betaVsBenchmark ?? 0.7) - 1) * 20 +
  Math.max(0, metrics.effectiveHoldings - 5) * 0.8 +
  (metrics.excessReturn ?? 0) * 100

const baseRoleScore = (role: PortfolioDecision['role']) =>
  ({
    defensive_anchor: 58,
    diversified_active: 60,
    alpha_source: 66,
    tactical_satellite: 38,
    unstable_optimizer: 15,
    news_signal: 42,
  })[role]

const actionRank = (action: PositionDecision['action']) => ({ add: 0, hold: 1, cap: 2, trim: 3, avoid: 4 })[action]
const largestWeight = (positions: PortfolioPosition[]) => positions.reduce((max, position) => Math.max(max, position.weight), 0)
const effectiveHoldingCount = (weights: number[]) => {
  const denominator = weights.reduce((sum, weight) => sum + weight * weight, 0)
  return denominator > 0 ? 1 / denominator : 0
}
const oilThemeIsHeadwind = (themes: PortfolioDecisionNewsTheme[]) =>
  themes.some((theme) => theme.key === 'oil_geopolitics' && theme.stance === 'headwind')
const isEnergySymbol = (symbol: string) => new Set(['XOM', 'CVX', 'DVN', 'OXY', 'COP', 'SLB', 'HAL']).has(symbol)
const formatPct = (value: number | null) => (value === null || !Number.isFinite(value) ? 'n/a' : `${(value * 100).toFixed(1)}%`)
const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))

const buildSurvivorReason = (decision: PortfolioDecision, score: number) =>
  `Selected with blended survivor score ${score.toFixed(1)} from realized excess ${formatPct(decision.metrics.excessReturn)}, decision score ${decision.score.toFixed(1)}, drawdown ${formatPct(decision.metrics.maxDrawdown)}, top-five concentration ${formatPct(decision.metrics.topFiveConcentration)}, and turnover ${formatPct(decision.metrics.turnoverRatio)}.`

const nyseDateKey = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

const nyseMinutes = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

const previousWeekday = (dateKey: string) => {
  const date = new Date(`${dateKey}T12:00:00Z`)
  do {
    date.setUTCDate(date.getUTCDate() - 1)
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6)
  return date.toISOString().slice(0, 10)
}
