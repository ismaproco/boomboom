import type { Database } from 'bun:sqlite'
import { defaultWatchlist } from '../config'
import {
  parseNewsThemesJson,
  parseOptimizeMetricsJson,
  parsePortfolioDecisionsJson,
  parsePositionDecisionsJson,
  parseStringArrayJson,
  parseSymbolListJson,
} from '../dbJsonSchemas'
import { normalizeSymbolList } from '../utils'
import type {
  OptimizeJobStatus,
  OptimizeJobStep,
  PageRequest,
  PortfolioComparison,
  PortfolioDailySurvivor,
  PortfolioDecisionProfile,
  PortfolioDecisionRun,
  PortfolioDecisionRunStatus,
  PortfolioHistoryResponse,
  PortfolioOptimizeJob,
  PortfolioOptimizeJobMetrics,
  PortfolioPosition,
  PortfolioBacktestMetric,
  PortfolioBacktestRun,
  PortfolioLiveCandidate,
  PortfolioScenario,
  PortfolioScenarioInput,
  PortfolioSnapshot,
  QuantMethod,
  QuantUniversePolicy,
  PortfolioScenarioSource,
  RefreshMode,
  TickerHistoryBar,
  TickerHistorySyncStatus,
} from '../types'

export const portfolioSnapshotColumns = `id, scenario_id as scenarioId, created_at as createdAt, benchmark_symbol as benchmarkSymbol, benchmark_value as benchmarkValue, expected_return as expectedReturn, source_snapshot_id as sourceSnapshotId, view_count as viewCount, novelty_profile as noveltyProfile, overlap_ratio as overlapRatio, turnover_ratio as turnoverRatio, regime_shift as regimeShift, news_alignment as newsAlignment, lexicon_tilt as lexiconTilt`

type ScenarioDbRow = {
  id: number
  name: string
  symbolsJson: string
  noveltyProfile: 'low' | 'medium' | 'high'
  maxWeightPerAsset: number
  isDefault: number
  createdAt: string
  updatedAt: string
  refreshMode: string
  blendTrending: number
  quantMethod: string | null
  quantTargetN: number | null
  quantReoptimizeMs: number | null
  quantUniversePolicy: string | null
  quantKeepCount: number | null
  quantNextRunAt: string | null
  source: string
}

type DecisionRunRow = {
  id: number
  createdAt: string
  marketSessionDate: string
  profile: PortfolioDecisionProfile
  status: PortfolioDecisionRunStatus
  portfolioRankingsJson: string
  positionDecisionsJson: string
  newsThemesJson: string
  dailyChecklistJson: string
  assumptionsJson: string
}

const decisionRunColumns = `id, created_at as createdAt, market_session_date as marketSessionDate, profile, status, portfolio_rankings_json as portfolioRankingsJson, position_decisions_json as positionDecisionsJson, news_themes_json as newsThemesJson, daily_checklist_json as dailyChecklistJson, assumptions_json as assumptionsJson`

const parseRefreshMode = (value: string): RefreshMode => (value === 'quant' ? 'quant' : 'news')

const parseQuantMethodDb = (value: string | null): QuantMethod | null =>
  value === 'max_sharpe' || value === 'hrp' || value === 'black_litterman' ? value : null

const parseQuantUniversePolicyDb = (value: string | null): QuantUniversePolicy | null =>
  value === 'reroll' || value === 'keep' || value === 'keep_some' ? value : null

const parseScenarioSourceDb = (value: string): PortfolioScenarioSource => (value === 'optimized' ? 'optimized' : 'manual')

const mapScenarioRow = (row: ScenarioDbRow): PortfolioScenario => ({
  id: row.id,
  name: row.name,
  symbols: parseSymbolListJson(row.symbolsJson),
  noveltyProfile: row.noveltyProfile,
  maxWeightPerAsset: row.maxWeightPerAsset,
  isDefault: row.isDefault === 1,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  refreshMode: parseRefreshMode(row.refreshMode),
  blendTrending: row.blendTrending === 1,
  quantMethod: parseQuantMethodDb(row.quantMethod),
  quantTargetN: row.quantTargetN,
  quantReoptimizeMs: row.quantReoptimizeMs,
  quantUniversePolicy: parseQuantUniversePolicyDb(row.quantUniversePolicy),
  quantKeepCount: row.quantKeepCount,
  quantNextRunAt: row.quantNextRunAt,
  source: parseScenarioSourceDb(row.source),
})

const mapDecisionRunRow = (row: DecisionRunRow): PortfolioDecisionRun => ({
  id: row.id,
  createdAt: row.createdAt,
  marketSessionDate: row.marketSessionDate,
  profile: row.profile,
  status: row.status,
  portfolioRankings: parsePortfolioDecisionsJson(row.portfolioRankingsJson),
  positionDecisions: parsePositionDecisionsJson(row.positionDecisionsJson),
  newsThemes: parseNewsThemesJson(row.newsThemesJson),
  dailyChecklist: parseStringArrayJson(row.dailyChecklistJson, []),
  assumptions: parseStringArrayJson(row.assumptionsJson, []),
})

const scenarioQuantDefaults = (input: PortfolioScenarioInput) => ({
  refreshMode: input.refreshMode ?? 'news',
  blendTrending: input.blendTrending !== false ? 1 : 0,
  quantMethod: input.quantMethod ?? null,
  quantTargetN: input.quantTargetN ?? null,
  quantReoptimizeMs: input.quantReoptimizeMs ?? null,
  quantUniversePolicy: input.quantUniversePolicy ?? null,
  quantKeepCount: input.quantKeepCount ?? null,
  quantNextRunAt: input.quantNextRunAt ?? null,
  source: input.source ?? 'manual',
})

const parseOptimizeJobMetrics = (raw: string | null): PortfolioOptimizeJobMetrics | null => parseOptimizeMetricsJson(raw)

const clampMaxWeight = (value: number) => Math.min(0.5, Math.max(0.05, Number.isFinite(value) ? value : 0.15))

export class PortfolioDb {
  constructor(readonly db: Database) {}

  listPortfolioScenarios(): PortfolioScenario[] {
    type ScenarioRow = ScenarioDbRow
    return this.db
      .query<ScenarioRow, []>(
        `SELECT id, name, symbols_json as symbolsJson, novelty_profile as noveltyProfile, max_weight_per_asset as maxWeightPerAsset,
        is_default as isDefault, created_at as createdAt, updated_at as updatedAt,
        refresh_mode as refreshMode, blend_trending as blendTrending, quant_method as quantMethod, quant_target_n as quantTargetN,
        quant_reoptimize_ms as quantReoptimizeMs, quant_universe_policy as quantUniversePolicy, quant_keep_count as quantKeepCount,
        quant_next_run_at as quantNextRunAt, source
        FROM portfolio_scenarios ORDER BY is_default DESC, name COLLATE NOCASE ASC`,
      )
      .all()
      .map((row) => mapScenarioRow(row))
  }

  listPortfolioScenariosBySource(source: PortfolioScenarioSource): PortfolioScenario[] {
    return this.listPortfolioScenarios().filter((scenario) => scenario.source === source)
  }

  getPortfolioScenario(scenarioId: number): PortfolioScenario | null {
    type ScenarioRow = ScenarioDbRow
    const row = this.db
      .query<ScenarioRow, [number]>(
        `SELECT id, name, symbols_json as symbolsJson, novelty_profile as noveltyProfile, max_weight_per_asset as maxWeightPerAsset,
        is_default as isDefault, created_at as createdAt, updated_at as updatedAt,
        refresh_mode as refreshMode, blend_trending as blendTrending, quant_method as quantMethod, quant_target_n as quantTargetN,
        quant_reoptimize_ms as quantReoptimizeMs, quant_universe_policy as quantUniversePolicy, quant_keep_count as quantKeepCount,
        quant_next_run_at as quantNextRunAt, source
        FROM portfolio_scenarios WHERE id = ? LIMIT 1`,
      )
      .get(scenarioId)
    if (!row) return null
    return mapScenarioRow(row)
  }

  insertPortfolioScenario(input: PortfolioScenarioInput & { isDefault?: boolean }) {
    const now = new Date().toISOString()
    const isDefault = input.isDefault ? 1 : 0
    if (isDefault) this.db.exec('UPDATE portfolio_scenarios SET is_default = 0')
    const symbolsJson = JSON.stringify(normalizeSymbolList(input.symbols))
    const defaults = scenarioQuantDefaults(input)
    const result = this.db
      .prepare(
        `INSERT INTO portfolio_scenarios (name, symbols_json, novelty_profile, max_weight_per_asset, is_default, created_at, updated_at,
        refresh_mode, blend_trending, quant_method, quant_target_n, quant_reoptimize_ms, quant_universe_policy, quant_keep_count, quant_next_run_at, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name.trim(),
        symbolsJson,
        input.noveltyProfile,
        clampMaxWeight(input.maxWeightPerAsset),
        isDefault,
        now,
        now,
        defaults.refreshMode,
        defaults.blendTrending,
        defaults.quantMethod,
        defaults.quantTargetN,
        defaults.quantReoptimizeMs,
        defaults.quantUniversePolicy,
        defaults.quantKeepCount,
        defaults.quantNextRunAt,
        defaults.source,
      )
    return Number(result.lastInsertRowid)
  }

  updatePortfolioScenario(scenarioId: number, input: Partial<PortfolioScenarioInput>) {
    const existing = this.getPortfolioScenario(scenarioId)
    if (!existing) return
    const name = input.name !== undefined ? input.name.trim() : existing.name
    const noveltyProfile = input.noveltyProfile ?? existing.noveltyProfile
    const maxWeightPerAsset = input.maxWeightPerAsset !== undefined ? clampMaxWeight(input.maxWeightPerAsset) : existing.maxWeightPerAsset
    const symbolsJson = input.symbols !== undefined ? JSON.stringify(normalizeSymbolList(input.symbols)) : JSON.stringify(existing.symbols)
    const refreshMode = input.refreshMode !== undefined ? input.refreshMode : existing.refreshMode
    const blendTrending = input.blendTrending !== undefined ? (input.blendTrending ? 1 : 0) : existing.blendTrending ? 1 : 0
    const quantMethod = input.quantMethod !== undefined ? input.quantMethod : existing.quantMethod
    const quantTargetN = input.quantTargetN !== undefined ? input.quantTargetN : existing.quantTargetN
    const quantReoptimizeMs = input.quantReoptimizeMs !== undefined ? input.quantReoptimizeMs : existing.quantReoptimizeMs
    const quantUniversePolicy = input.quantUniversePolicy !== undefined ? input.quantUniversePolicy : existing.quantUniversePolicy
    const quantKeepCount = input.quantKeepCount !== undefined ? input.quantKeepCount : existing.quantKeepCount
    const quantNextRunAt = input.quantNextRunAt !== undefined ? input.quantNextRunAt : existing.quantNextRunAt
    const source = input.source !== undefined ? input.source : existing.source
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE portfolio_scenarios SET name = ?, symbols_json = ?, novelty_profile = ?, max_weight_per_asset = ?, updated_at = ?,
        refresh_mode = ?, blend_trending = ?, quant_method = ?, quant_target_n = ?, quant_reoptimize_ms = ?, quant_universe_policy = ?, quant_keep_count = ?, quant_next_run_at = ?, source = ?
        WHERE id = ?`,
      )
      .run(
        name,
        symbolsJson,
        noveltyProfile,
        maxWeightPerAsset,
        now,
        refreshMode,
        blendTrending,
        quantMethod,
        quantTargetN,
        quantReoptimizeMs,
        quantUniversePolicy,
        quantKeepCount,
        quantNextRunAt,
        source,
        scenarioId,
      )
  }

  deletePortfolioScenario(scenarioId: number) {
    const row = this.db.query<{ is_default: number }, [number]>('SELECT is_default FROM portfolio_scenarios WHERE id = ?').get(scenarioId)
    if (!row || row.is_default) return
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM portfolio_snapshots WHERE scenario_id = ?').run(scenarioId)
      this.db.prepare('DELETE FROM portfolio_scenarios WHERE id = ?').run(scenarioId)
    })()
  }

  getLatestPortfolioSnapshot(scenarioId: number) {
    return (
      this.db
        .query<
          PortfolioSnapshot,
          [number]
        >(`SELECT ${portfolioSnapshotColumns} FROM portfolio_snapshots WHERE scenario_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`)
        .get(scenarioId) ?? null
    )
  }

  getPortfolioSnapshot(snapshotId: number) {
    return (
      this.db
        .query<PortfolioSnapshot, [number]>(`SELECT ${portfolioSnapshotColumns} FROM portfolio_snapshots WHERE id = ? LIMIT 1`)
        .get(snapshotId) ?? null
    )
  }

  getPortfolioPositions(snapshotId: number) {
    return this.db
      .query<
        PortfolioPosition,
        [number]
      >('SELECT id, snapshot_id as snapshotId, symbol, weight, view_score as viewScore, implied_return as impliedReturn, entry_price as entryPrice FROM portfolio_positions WHERE snapshot_id = ? ORDER BY weight DESC, symbol ASC')
      .all(snapshotId)
  }

  getLatestPortfolioComparison(snapshotId: number) {
    return (
      this.db
        .query<
          PortfolioComparison,
          [number]
        >('SELECT id, snapshot_id as snapshotId, compared_snapshot_id as comparedSnapshotId, benchmark_symbol as benchmarkSymbol, portfolio_return as portfolioReturn, benchmark_return as benchmarkReturn, excess_return as excessReturn, max_drawdown_proxy as maxDrawdownProxy, measured_at as measuredAt FROM portfolio_comparisons WHERE snapshot_id = ? ORDER BY measured_at DESC, id DESC LIMIT 1')
        .get(snapshotId) ?? null
    )
  }

  getPortfolioHistory(request: PageRequest & { scenarioId: number }): PortfolioHistoryResponse {
    const { page, pageSize, scenarioId } = request
    const offset = (page - 1) * pageSize
    const total =
      this.db.query<{ count: number }, [number]>('SELECT COUNT(*) as count FROM portfolio_snapshots WHERE scenario_id = ?').get(scenarioId)
        ?.count ?? 0
    const snapshots = this.db
      .query<
        PortfolioSnapshot,
        [number, number, number]
      >(`SELECT ${portfolioSnapshotColumns} FROM portfolio_snapshots WHERE scenario_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(scenarioId, pageSize, offset)

    return {
      updatedAt: new Date().toISOString(),
      page,
      pageSize,
      total,
      snapshots: snapshots.map((snapshot) => ({ snapshot, comparison: this.getLatestPortfolioComparison(snapshot.id) })),
    }
  }

  getPortfolioSnapshotsForComparison(earliestIso: string) {
    const snapshots = this.db
      .query<PortfolioSnapshot, [string, string]>(
        `SELECT ${portfolioSnapshotColumns}
      FROM portfolio_snapshots
      WHERE created_at >= ?
      UNION
      SELECT ps.id, ps.scenario_id as scenarioId, ps.created_at as createdAt, ps.benchmark_symbol as benchmarkSymbol, ps.benchmark_value as benchmarkValue,
      ps.expected_return as expectedReturn, ps.source_snapshot_id as sourceSnapshotId, ps.view_count as viewCount, ps.novelty_profile as noveltyProfile,
      ps.overlap_ratio as overlapRatio, ps.turnover_ratio as turnoverRatio, ps.regime_shift as regimeShift, ps.news_alignment as newsAlignment, ps.lexicon_tilt as lexiconTilt
      FROM portfolio_snapshots ps
      INNER JOIN (
        SELECT scenario_id, MAX(created_at) as created_at
        FROM portfolio_snapshots
        WHERE created_at < ?
        GROUP BY scenario_id
      ) prior ON prior.scenario_id = ps.scenario_id AND prior.created_at = ps.created_at
      ORDER BY scenarioId ASC, createdAt ASC, id ASC`,
      )
      .all(earliestIso, earliestIso)

    return snapshots.map((snapshot) => ({ ...snapshot, positions: this.getPortfolioPositions(snapshot.id) }))
  }

  getPortfolioSnapshotsAscending(scenarioId: number, limit: number) {
    const newestFirst = this.db
      .query<
        PortfolioSnapshot,
        [number, number]
      >(`SELECT ${portfolioSnapshotColumns} FROM portfolio_snapshots WHERE scenario_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`)
      .all(scenarioId, limit)
    const chronological = newestFirst.slice().reverse()
    return chronological.map((snapshot) => ({
      snapshot,
      comparison: this.getLatestPortfolioComparison(snapshot.id),
    }))
  }

  savePortfolioDecisionRun(input: Omit<PortfolioDecisionRun, 'id'>) {
    const result = this.db
      .prepare(
        `INSERT INTO portfolio_decision_runs (created_at, market_session_date, profile, status, portfolio_rankings_json, position_decisions_json, news_themes_json, daily_checklist_json, assumptions_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.createdAt,
        input.marketSessionDate,
        input.profile,
        input.status,
        JSON.stringify(input.portfolioRankings),
        JSON.stringify(input.positionDecisions),
        JSON.stringify(input.newsThemes),
        JSON.stringify(input.dailyChecklist),
        JSON.stringify(input.assumptions),
      )
    return Number(result.lastInsertRowid)
  }

  updatePortfolioDecisionRunStatus(runId: number, status: PortfolioDecisionRunStatus) {
    this.db.prepare('UPDATE portfolio_decision_runs SET status = ? WHERE id = ?').run(status, runId)
  }

  getLatestPortfolioDecisionRun(profile?: PortfolioDecisionProfile, marketSessionDate?: string) {
    const where: string[] = []
    const params: string[] = []
    if (profile) {
      where.push('profile = ?')
      params.push(profile)
    }
    if (marketSessionDate) {
      where.push('market_session_date = ?')
      params.push(marketSessionDate)
    }
    const sql = `SELECT ${decisionRunColumns} FROM portfolio_decision_runs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT 1`
    const row = this.db.query<DecisionRunRow, string[]>(sql).get(...params)
    return row ? mapDecisionRunRow(row) : null
  }

  getPortfolioDecisionRuns(limit: number) {
    return this.db
      .query<
        DecisionRunRow,
        [number]
      >(`SELECT ${decisionRunColumns} FROM portfolio_decision_runs ORDER BY created_at DESC, id DESC LIMIT ?`)
      .all(limit)
      .map(mapDecisionRunRow)
  }

  getPortfolioDecisionRunsRange(startDate: string, endDate: string) {
    return this.db
      .query<DecisionRunRow, [string, string]>(
        `SELECT ${decisionRunColumns}
      FROM portfolio_decision_runs
      WHERE market_session_date BETWEEN ? AND ?
      ORDER BY created_at DESC, id DESC`,
      )
      .all(startDate, endDate)
      .map(mapDecisionRunRow)
  }

  replaceDailySurvivors(input: {
    marketSessionDate: string
    decisionRunId: number
    survivors: Array<Omit<PortfolioDailySurvivor, 'id' | 'decisionRunId' | 'marketSessionDate' | 'selectedAt'>>
    selectedAt: string
  }) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM portfolio_daily_survivors WHERE market_session_date = ?').run(input.marketSessionDate)
      const insert = this.db.prepare(
        `INSERT INTO portfolio_daily_survivors (decision_run_id, market_session_date, scenario_id, scenario_name, snapshot_id, rank, survivor_score, realized_excess_return, decision_score, max_drawdown, top_five_concentration, turnover_ratio, selected_at, selection_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      input.survivors.forEach((survivor) =>
        insert.run(
          input.decisionRunId,
          input.marketSessionDate,
          survivor.scenarioId,
          survivor.scenarioName,
          survivor.snapshotId,
          survivor.rank,
          survivor.survivorScore,
          survivor.realizedExcessReturn,
          survivor.decisionScore,
          survivor.maxDrawdown,
          survivor.topFiveConcentration,
          survivor.turnoverRatio,
          input.selectedAt,
          survivor.selectionReason,
        ),
      )
    })()
  }

  getDailySurvivors(marketSessionDate?: string) {
    const date =
      marketSessionDate ??
      this.db
        .query<
          { marketSessionDate: string },
          []
        >('SELECT market_session_date as marketSessionDate FROM portfolio_daily_survivors ORDER BY market_session_date DESC LIMIT 1')
        .get()?.marketSessionDate
    if (!date) return []
    return this.db
      .query<PortfolioDailySurvivor, [string]>(
        `SELECT id, decision_run_id as decisionRunId, market_session_date as marketSessionDate, scenario_id as scenarioId, scenario_name as scenarioName, snapshot_id as snapshotId,
      rank, survivor_score as survivorScore, realized_excess_return as realizedExcessReturn, decision_score as decisionScore, max_drawdown as maxDrawdown,
      top_five_concentration as topFiveConcentration, turnover_ratio as turnoverRatio, selected_at as selectedAt, selection_reason as selectionReason
      FROM portfolio_daily_survivors WHERE market_session_date = ? ORDER BY rank ASC`,
      )
      .all(date)
  }

  getDailySurvivorsRange(startDate: string, endDate: string) {
    return this.db
      .query<PortfolioDailySurvivor, [string, string]>(
        `SELECT id, decision_run_id as decisionRunId, market_session_date as marketSessionDate, scenario_id as scenarioId, scenario_name as scenarioName, snapshot_id as snapshotId,
      rank, survivor_score as survivorScore, realized_excess_return as realizedExcessReturn, decision_score as decisionScore, max_drawdown as maxDrawdown,
      top_five_concentration as topFiveConcentration, turnover_ratio as turnoverRatio, selected_at as selectedAt, selection_reason as selectionReason
      FROM portfolio_daily_survivors WHERE market_session_date BETWEEN ? AND ? ORDER BY market_session_date DESC, rank ASC`,
      )
      .all(startDate, endDate)
  }

  savePortfolioSnapshot(input: {
    scenarioId: number
    createdAt: string
    benchmarkSymbol: string
    benchmarkValue: number
    expectedReturn: number
    sourceSnapshotId: number | null
    viewCount: number
    noveltyProfile: 'low' | 'medium' | 'high'
    overlapRatio: number
    turnoverRatio: number
    regimeShift: number
    newsAlignment: number
    lexiconTilt: number
    positions: Array<{
      symbol: string
      weight: number
      viewScore: number
      impliedReturn: number
      entryPrice: number
    }>
    comparison?: {
      comparedSnapshotId: number
      benchmarkSymbol: string
      portfolioReturn: number
      benchmarkReturn: number
      excessReturn: number
      maxDrawdownProxy: number
      measuredAt: string
    } | null
  }) {
    const snapshotResult = this.db.transaction(() => {
      const inserted = this.db
        .prepare(
          'INSERT INTO portfolio_snapshots (scenario_id, created_at, benchmark_symbol, benchmark_value, expected_return, source_snapshot_id, view_count, novelty_profile, overlap_ratio, turnover_ratio, regime_shift, news_alignment, lexicon_tilt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          input.scenarioId,
          input.createdAt,
          input.benchmarkSymbol,
          input.benchmarkValue,
          input.expectedReturn,
          input.sourceSnapshotId,
          input.viewCount,
          input.noveltyProfile,
          input.overlapRatio,
          input.turnoverRatio,
          input.regimeShift,
          input.newsAlignment,
          input.lexiconTilt,
        )
      const snapshotId = Number(inserted.lastInsertRowid)
      const insertPosition = this.db.prepare(
        'INSERT INTO portfolio_positions (snapshot_id, symbol, weight, view_score, implied_return, entry_price) VALUES (?, ?, ?, ?, ?, ?)',
      )
      input.positions.forEach((position) => {
        insertPosition.run(snapshotId, position.symbol, position.weight, position.viewScore, position.impliedReturn, position.entryPrice)
      })

      if (input.comparison) {
        this.db
          .prepare(
            'INSERT INTO portfolio_comparisons (snapshot_id, compared_snapshot_id, benchmark_symbol, portfolio_return, benchmark_return, excess_return, max_drawdown_proxy, measured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            snapshotId,
            input.comparison.comparedSnapshotId,
            input.comparison.benchmarkSymbol,
            input.comparison.portfolioReturn,
            input.comparison.benchmarkReturn,
            input.comparison.excessReturn,
            input.comparison.maxDrawdownProxy,
            input.comparison.measuredAt,
          )
      }

      return snapshotId
    })()

    return snapshotResult
  }

  createPortfolioOptimizeJob(input: { scenarioId: number | null; requestJson?: string | null }): number {
    const now = new Date().toISOString()
    const result = this.db
      .prepare(
        `INSERT INTO portfolio_optimize_jobs (status, step, detail, progress, error, scenario_id, request_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('queued', 'queued', null, 0, null, input.scenarioId, input.requestJson ?? null, now, now)
    return Number(result.lastInsertRowid)
  }

  getPortfolioOptimizeJob(jobId: number): PortfolioOptimizeJob | null {
    type Row = {
      id: number
      status: OptimizeJobStatus
      step: OptimizeJobStep
      detail: string | null
      progress: number
      error: string | null
      scenarioId: number | null
      resultJson: string | null
      requestJson: string | null
      createdAt: string
      updatedAt: string
    }
    const row = this.db
      .query<Row, [number]>(
        `SELECT id, status, step, detail, progress, error, scenario_id as scenarioId, result_json as resultJson, request_json as requestJson, created_at as createdAt, updated_at as updatedAt
        FROM portfolio_optimize_jobs WHERE id = ? LIMIT 1`,
      )
      .get(jobId)
    if (!row) return null
    return {
      id: row.id,
      status: row.status,
      step: row.step,
      detail: row.detail,
      progress: row.progress,
      error: row.error,
      scenarioId: row.scenarioId,
      metrics: parseOptimizeJobMetrics(row.resultJson),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  updatePortfolioOptimizeJob(
    jobId: number,
    input: Partial<{
      status: OptimizeJobStatus
      step: OptimizeJobStep
      detail: string | null
      progress: number
      error: string | null
      scenarioId: number | null
      resultJson: string | null
    }>,
  ) {
    type Row = {
      status: OptimizeJobStatus
      step: OptimizeJobStep
      detail: string | null
      progress: number
      error: string | null
      scenarioId: number | null
      resultJson: string | null
    }
    const row = this.db
      .query<
        Row,
        [number]
      >(`SELECT status, step, detail, progress, error, scenario_id as scenarioId, result_json as resultJson FROM portfolio_optimize_jobs WHERE id = ? LIMIT 1`)
      .get(jobId)
    if (!row) return
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE portfolio_optimize_jobs SET status = ?, step = ?, detail = ?, progress = ?, error = ?, scenario_id = ?, result_json = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        input.status ?? row.status,
        input.step ?? row.step,
        input.detail !== undefined ? input.detail : row.detail,
        input.progress ?? row.progress,
        input.error !== undefined ? input.error : row.error,
        input.scenarioId !== undefined ? input.scenarioId : row.scenarioId,
        input.resultJson !== undefined ? input.resultJson : row.resultJson,
        now,
        jobId,
      )
  }

  expireStaleActiveOptimizeJobs(staleBeforeIso: string): number {
    const now = new Date().toISOString()
    const result = this.db
      .prepare(
        `UPDATE portfolio_optimize_jobs
        SET status = 'failed', error = 'Optimizer job expired after server restart or stalled execution.', detail = null, updated_at = ?
        WHERE status IN ('queued', 'running') AND updated_at < ?`,
      )
      .run(now, staleBeforeIso)
    return result.changes
  }

  scenarioHasActiveOptimizeJob(scenarioId: number): boolean {
    const row = this.db
      .query<
        { c: number },
        [number]
      >(`SELECT COUNT(*) as c FROM portfolio_optimize_jobs WHERE scenario_id = ? AND status IN ('queued', 'running')`)
      .get(scenarioId)
    return (row?.c ?? 0) > 0
  }

  countActiveOptimizeJobs(): { queued: number; running: number } {
    const rows = this.db
      .query<
        { status: OptimizeJobStatus; c: number },
        []
      >(`SELECT status, COUNT(*) as c FROM portfolio_optimize_jobs WHERE status IN ('queued', 'running') GROUP BY status`)
      .all()
    let queued = 0
    let running = 0
    for (const row of rows) {
      if (row.status === 'queued') queued = row.c
      if (row.status === 'running') running = row.c
    }
    return { queued, running }
  }

  listQueuedOptimizeJobIds(): number[] {
    return this.db
      .query<{ id: number }, []>(`SELECT id FROM portfolio_optimize_jobs WHERE status = 'queued' ORDER BY id ASC`)
      .all()
      .map((row) => row.id)
  }

  getPortfolioOptimizeJobRequestJson(jobId: number): string | null {
    const row = this.db
      .query<{ requestJson: string | null }, [number]>(`SELECT request_json as requestJson FROM portfolio_optimize_jobs WHERE id = ?`)
      .get(jobId)
    return row?.requestJson ?? null
  }

  upsertTickerPriceHistory(symbol: string, bars: Array<{ date: string; adjClose: number }>) {
    const normalized = symbol.trim().toUpperCase()
    if (!normalized || bars.length === 0) return
    const updatedAt = new Date().toISOString()
    const upsert = this.db.prepare(
      `INSERT INTO ticker_price_history (symbol, date, adj_close, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(symbol, date) DO UPDATE SET adj_close = excluded.adj_close, updated_at = excluded.updated_at`,
    )
    this.db.transaction(() => {
      bars.forEach((bar) => {
        if (!bar.date || !Number.isFinite(bar.adjClose) || bar.adjClose <= 0) return
        upsert.run(normalized, bar.date, bar.adjClose, updatedAt)
      })
    })()
  }

  getTickerPriceHistory(symbol: string, fromDate: string, toDate: string): TickerHistoryBar[] {
    return this.db
      .query<TickerHistoryBar, [string, string, string]>(
        `SELECT symbol, date, adj_close as adjClose, updated_at as updatedAt
      FROM ticker_price_history
      WHERE symbol = ? AND date >= ? AND date <= ?
      ORDER BY date ASC`,
      )
      .all(symbol.trim().toUpperCase(), fromDate, toDate)
  }

  listTickerHistorySymbols() {
    return this.db
      .query<{ symbol: string }, []>('SELECT DISTINCT symbol FROM ticker_price_history ORDER BY symbol ASC')
      .all()
      .map((row) => row.symbol)
  }

  upsertTickerHistorySyncStatus(input: TickerHistorySyncStatus) {
    this.db
      .prepare(
        `INSERT INTO ticker_history_sync (symbol, last_synced_at, last_bar_date, status, error)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET last_synced_at = excluded.last_synced_at, last_bar_date = excluded.last_bar_date, status = excluded.status, error = excluded.error`,
      )
      .run(input.symbol.trim().toUpperCase(), input.lastSyncedAt, input.lastBarDate, input.status, input.error)
  }

  getTickerHistorySyncStatuses(symbols?: string[]) {
    if (!symbols || symbols.length === 0) {
      return this.db
        .query<
          TickerHistorySyncStatus,
          []
        >('SELECT symbol, last_synced_at as lastSyncedAt, last_bar_date as lastBarDate, status, error FROM ticker_history_sync ORDER BY symbol ASC')
        .all()
    }
    const normalized = normalizeSymbolList(symbols)
    if (normalized.length === 0) return []
    const placeholders = normalized.map(() => '?').join(', ')
    return this.db
      .query<TickerHistorySyncStatus, string[]>(
        `SELECT symbol, last_synced_at as lastSyncedAt, last_bar_date as lastBarDate, status, error
      FROM ticker_history_sync
      WHERE symbol IN (${placeholders})
      ORDER BY symbol ASC`,
      )
      .all(...normalized)
  }

  createPortfolioBacktestRun(input: {
    benchmarkSymbol: string
    rebalanceCadence: 'weekly'
    lookbackDays: number
    feeBps: number
    slippageBps: number
  }) {
    const result = this.db
      .prepare(
        `INSERT INTO portfolio_backtest_runs (created_at, benchmark_symbol, rebalance_cadence, lookback_days, fee_bps, slippage_bps, status, error)
      VALUES (?, ?, ?, ?, ?, ?, 'running', NULL)`,
      )
      .run(new Date().toISOString(), input.benchmarkSymbol, input.rebalanceCadence, input.lookbackDays, input.feeBps, input.slippageBps)
    return Number(result.lastInsertRowid)
  }

  updatePortfolioBacktestRun(runId: number, input: Partial<Pick<PortfolioBacktestRun, 'status' | 'error'>>) {
    const row = this.db
      .query<
        { status: PortfolioBacktestRun['status']; error: string | null },
        [number]
      >('SELECT status, error FROM portfolio_backtest_runs WHERE id = ? LIMIT 1')
      .get(runId)
    if (!row) return
    this.db
      .prepare('UPDATE portfolio_backtest_runs SET status = ?, error = ? WHERE id = ?')
      .run(input.status ?? row.status, input.error !== undefined ? input.error : row.error, runId)
  }

  getPortfolioBacktestRun(runId: number) {
    return (
      this.db
        .query<PortfolioBacktestRun, [number]>(
          `SELECT id, created_at as createdAt, benchmark_symbol as benchmarkSymbol, rebalance_cadence as rebalanceCadence,
      lookback_days as lookbackDays, fee_bps as feeBps, slippage_bps as slippageBps, status, error
      FROM portfolio_backtest_runs WHERE id = ? LIMIT 1`,
        )
        .get(runId) ?? null
    )
  }

  replacePortfolioBacktestMetrics(runId: number, metrics: Omit<PortfolioBacktestMetric, 'runId'>[]) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM portfolio_backtest_metrics WHERE run_id = ?').run(runId)
      const insert = this.db.prepare(
        `INSERT INTO portfolio_backtest_metrics (run_id, scenario_id, horizon_days, coverage_ratio, annualized_return, annualized_volatility,
        sharpe_ratio, max_drawdown, benchmark_return, excess_return, win_rate, average_turnover)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      metrics.forEach((metric) => {
        insert.run(
          runId,
          metric.scenarioId,
          metric.horizonDays,
          metric.coverageRatio,
          metric.annualizedReturn,
          metric.annualizedVolatility,
          metric.sharpeRatio,
          metric.maxDrawdown,
          metric.benchmarkReturn,
          metric.excessReturn,
          metric.winRate,
          metric.averageTurnover,
        )
      })
    })()
  }

  getPortfolioBacktestMetrics(runId: number) {
    return this.db
      .query<PortfolioBacktestMetric, [number]>(
        `SELECT run_id as runId, scenario_id as scenarioId, horizon_days as horizonDays, coverage_ratio as coverageRatio,
      annualized_return as annualizedReturn, annualized_volatility as annualizedVolatility, sharpe_ratio as sharpeRatio,
      max_drawdown as maxDrawdown, benchmark_return as benchmarkReturn, excess_return as excessReturn,
      win_rate as winRate, average_turnover as averageTurnover
      FROM portfolio_backtest_metrics WHERE run_id = ? ORDER BY horizon_days ASC, scenario_id ASC`,
      )
      .all(runId)
  }

  replacePortfolioLiveCandidates(candidates: PortfolioLiveCandidate[]) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM portfolio_live_candidates').run()
      const insert = this.db.prepare(
        `INSERT INTO portfolio_live_candidates (scenario_id, scenario_name, run_id, composite_score, selected_at, reason)
        VALUES (?, ?, ?, ?, ?, ?)`,
      )
      candidates.forEach((candidate) => {
        insert.run(
          candidate.scenarioId,
          candidate.scenarioName,
          candidate.runId,
          candidate.compositeScore,
          candidate.selectedAt,
          candidate.reason,
        )
      })
    })()
  }

  getPortfolioLiveCandidates() {
    return this.db
      .query<PortfolioLiveCandidate, []>(
        `SELECT scenario_id as scenarioId, scenario_name as scenarioName, run_id as runId, composite_score as compositeScore, selected_at as selectedAt, reason
      FROM portfolio_live_candidates ORDER BY composite_score DESC, scenario_name ASC`,
      )
      .all()
  }
}

export const migratePortfolioDomain = (db: Database) => {
  db.exec(`CREATE TABLE IF NOT EXISTS portfolio_scenarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          symbols_json TEXT NOT NULL,
          novelty_profile TEXT NOT NULL CHECK (novelty_profile IN ('low', 'medium', 'high')),
          max_weight_per_asset REAL NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`)
  db.exec('CREATE INDEX IF NOT EXISTS portfolio_scenarios_default_idx ON portfolio_scenarios(is_default)')

  const scenarioCount = db.query<{ c: number }, []>('SELECT COUNT(*) as c FROM portfolio_scenarios').get()?.c ?? 0
  if (scenarioCount === 0) {
    const now = new Date().toISOString()
    const symbolsJson = JSON.stringify(defaultWatchlist.map((s) => s.toUpperCase()))
    db.prepare(
      'INSERT INTO portfolio_scenarios (name, symbols_json, novelty_profile, max_weight_per_asset, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    ).run('Default', symbolsJson, 'medium', 0.15, now, now)
  }

  const snapCols = db.query<{ name: string }, []>('PRAGMA table_info(portfolio_snapshots)').all()
  if (!snapCols.some((column) => column.name === 'scenario_id')) {
    db.exec('ALTER TABLE portfolio_snapshots ADD COLUMN scenario_id INTEGER')
    const defaultScenarioId = db
      .query<{ id: number }, []>('SELECT id FROM portfolio_scenarios WHERE is_default = 1 ORDER BY id ASC LIMIT 1')
      .get()?.id
    if (defaultScenarioId !== undefined) {
      db.prepare('UPDATE portfolio_snapshots SET scenario_id = ? WHERE scenario_id IS NULL').run(defaultScenarioId)
    }
  }

  db.exec('CREATE INDEX IF NOT EXISTS portfolio_snapshots_scenario_created_idx ON portfolio_snapshots(scenario_id, created_at DESC)')

  const scenarioCols = db.query<{ name: string }, []>('PRAGMA table_info(portfolio_scenarios)').all()
  const names = new Set(scenarioCols.map((c) => c.name))
  if (!names.has('refresh_mode')) db.exec("ALTER TABLE portfolio_scenarios ADD COLUMN refresh_mode TEXT NOT NULL DEFAULT 'news'")
  if (!names.has('blend_trending')) db.exec('ALTER TABLE portfolio_scenarios ADD COLUMN blend_trending INTEGER NOT NULL DEFAULT 1')
  if (!names.has('quant_method')) db.exec('ALTER TABLE portfolio_scenarios ADD COLUMN quant_method TEXT')
  if (!names.has('quant_target_n')) db.exec('ALTER TABLE portfolio_scenarios ADD COLUMN quant_target_n INTEGER')
  if (!names.has('quant_reoptimize_ms')) db.exec('ALTER TABLE portfolio_scenarios ADD COLUMN quant_reoptimize_ms INTEGER')
  if (!names.has('quant_universe_policy')) db.exec('ALTER TABLE portfolio_scenarios ADD COLUMN quant_universe_policy TEXT')
  if (!names.has('quant_keep_count')) db.exec('ALTER TABLE portfolio_scenarios ADD COLUMN quant_keep_count INTEGER')
  if (!names.has('quant_next_run_at')) db.exec('ALTER TABLE portfolio_scenarios ADD COLUMN quant_next_run_at TEXT')
  if (!names.has('source')) db.exec("ALTER TABLE portfolio_scenarios ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'")

  db.exec(`CREATE TABLE IF NOT EXISTS portfolio_optimize_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        step TEXT NOT NULL,
        detail TEXT,
        progress INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        scenario_id INTEGER,
        result_json TEXT,
        request_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (scenario_id) REFERENCES portfolio_scenarios(id) ON DELETE SET NULL
      )`)
  db.exec('CREATE INDEX IF NOT EXISTS portfolio_optimize_jobs_scenario_status_idx ON portfolio_optimize_jobs(scenario_id, status)')

  const jobCols = db.query<{ name: string }, []>('PRAGMA table_info(portfolio_optimize_jobs)').all()
  if (!jobCols.some((c) => c.name === 'result_json')) {
    db.exec('ALTER TABLE portfolio_optimize_jobs ADD COLUMN result_json TEXT')
  }
  if (!jobCols.some((c) => c.name === 'request_json')) {
    db.exec('ALTER TABLE portfolio_optimize_jobs ADD COLUMN request_json TEXT')
  }

  const signalSnapCols = db.query<{ name: string }, []>('PRAGMA table_info(portfolio_snapshots)').all()
  const signalNames = new Set(signalSnapCols.map((c) => c.name))
  if (!signalNames.has('regime_shift')) db.exec('ALTER TABLE portfolio_snapshots ADD COLUMN regime_shift REAL NOT NULL DEFAULT 1')
  if (!signalNames.has('news_alignment')) db.exec('ALTER TABLE portfolio_snapshots ADD COLUMN news_alignment REAL NOT NULL DEFAULT 0')
  if (!signalNames.has('lexicon_tilt')) db.exec('ALTER TABLE portfolio_snapshots ADD COLUMN lexicon_tilt REAL NOT NULL DEFAULT 0')

  db.exec(`CREATE TABLE IF NOT EXISTS portfolio_decision_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        market_session_date TEXT NOT NULL,
        profile TEXT NOT NULL CHECK (profile IN ('conservative', 'balanced', 'aggressive')),
        status TEXT NOT NULL CHECK (status IN ('intraday', 'finalized')),
        portfolio_rankings_json TEXT NOT NULL,
        position_decisions_json TEXT NOT NULL,
        news_themes_json TEXT NOT NULL,
        daily_checklist_json TEXT NOT NULL,
        assumptions_json TEXT NOT NULL
      )`)
  db.exec(
    'CREATE INDEX IF NOT EXISTS portfolio_decision_runs_date_profile_idx ON portfolio_decision_runs(market_session_date, profile, created_at DESC)',
  )
  db.exec(`CREATE TABLE IF NOT EXISTS portfolio_daily_survivors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        decision_run_id INTEGER NOT NULL,
        market_session_date TEXT NOT NULL,
        scenario_id INTEGER NOT NULL,
        scenario_name TEXT NOT NULL,
        snapshot_id INTEGER,
        rank INTEGER NOT NULL,
        survivor_score REAL NOT NULL,
        realized_excess_return REAL,
        decision_score REAL NOT NULL,
        max_drawdown REAL,
        top_five_concentration REAL NOT NULL,
        turnover_ratio REAL,
        selected_at TEXT NOT NULL,
        selection_reason TEXT NOT NULL,
        FOREIGN KEY (decision_run_id) REFERENCES portfolio_decision_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (scenario_id) REFERENCES portfolio_scenarios(id) ON DELETE CASCADE,
        FOREIGN KEY (snapshot_id) REFERENCES portfolio_snapshots(id) ON DELETE SET NULL
      )`)
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS portfolio_daily_survivors_date_rank_idx ON portfolio_daily_survivors(market_session_date, rank)',
  )
  db.exec('CREATE INDEX IF NOT EXISTS portfolio_daily_survivors_date_idx ON portfolio_daily_survivors(market_session_date DESC)')

  db.exec(`CREATE TABLE IF NOT EXISTS ticker_price_history (
        symbol TEXT NOT NULL,
        date TEXT NOT NULL,
        adj_close REAL NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (symbol, date)
      )`)
  db.exec('CREATE INDEX IF NOT EXISTS ticker_price_history_symbol_date_idx ON ticker_price_history(symbol, date ASC)')
  db.exec(`CREATE TABLE IF NOT EXISTS ticker_history_sync (
        symbol TEXT PRIMARY KEY,
        last_synced_at TEXT,
        last_bar_date TEXT,
        status TEXT NOT NULL CHECK (status IN ('ok', 'stale', 'error', 'never')),
        error TEXT
      )`)
  db.exec(`CREATE TABLE IF NOT EXISTS portfolio_backtest_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        benchmark_symbol TEXT NOT NULL,
        rebalance_cadence TEXT NOT NULL CHECK (rebalance_cadence IN ('weekly')),
        lookback_days INTEGER NOT NULL,
        fee_bps REAL NOT NULL,
        slippage_bps REAL NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
        error TEXT
      )`)
  db.exec(`CREATE TABLE IF NOT EXISTS portfolio_backtest_metrics (
        run_id INTEGER NOT NULL,
        scenario_id INTEGER NOT NULL,
        horizon_days INTEGER NOT NULL,
        coverage_ratio REAL NOT NULL,
        annualized_return REAL NOT NULL,
        annualized_volatility REAL NOT NULL,
        sharpe_ratio REAL NOT NULL,
        max_drawdown REAL NOT NULL,
        benchmark_return REAL NOT NULL,
        excess_return REAL NOT NULL,
        win_rate REAL NOT NULL,
        average_turnover REAL NOT NULL,
        PRIMARY KEY (run_id, scenario_id, horizon_days),
        FOREIGN KEY (run_id) REFERENCES portfolio_backtest_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (scenario_id) REFERENCES portfolio_scenarios(id) ON DELETE CASCADE
      )`)
  db.exec(`CREATE TABLE IF NOT EXISTS portfolio_live_candidates (
        scenario_id INTEGER PRIMARY KEY,
        scenario_name TEXT NOT NULL,
        run_id INTEGER NOT NULL,
        composite_score REAL NOT NULL,
        selected_at TEXT NOT NULL,
        reason TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES portfolio_backtest_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (scenario_id) REFERENCES portfolio_scenarios(id) ON DELETE CASCADE
      )`)
}
