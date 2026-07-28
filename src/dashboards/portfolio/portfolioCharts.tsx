import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatArchiveTime, formatTerminalTime } from '../../formatters'
import type {
  OptimizedPortfoliosResponse,
  PortfolioBracketParticipant,
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
  QuantMethod,
  QuantUniversePolicy,
  Sp500OptimizePayload,
} from '../../types'
import { LogMetric, SectionHeader } from '../../presentation'
export function OptimizedPortfolioDashboard({ data, comparisonData, isLoading }: { data: OptimizedPortfoliosResponse; comparisonData: PortfolioComparisonResponse; isLoading: boolean }) {
  const [selectedTierKey, setSelectedTierKey] = useState('growth-core')
  const selectedTier = data.tiers.find((tier) => tier.key === selectedTierKey) ?? data.tiers[0] ?? null
  const best30 = comparisonData.scenarios
    .map((scenario) => ({ scenario, horizon: scenario.horizons.find((horizon) => horizon.days === 30) ?? scenario.horizons[0] }))
    .filter((entry) => entry.horizon?.portfolioReturn !== null)
    .sort((left, right) => (right.horizon?.portfolioReturn ?? -Infinity) - (left.horizon?.portfolioReturn ?? -Infinity))[0]
  const lowestDrawdown = comparisonData.scenarios
    .map((scenario) => ({ scenario, horizon: scenario.horizons.find((horizon) => horizon.days === 30) ?? scenario.horizons[0] }))
    .filter((entry) => entry.horizon?.maxDrawdown !== null)
    .sort((left, right) => (right.horizon?.maxDrawdown ?? -Infinity) - (left.horizon?.maxDrawdown ?? -Infinity))[0]
  const latestSnapshot = data.tiers.map((tier) => tier.snapshot?.createdAt).filter((value): value is string => Boolean(value)).sort().at(-1)
  const scenarioNameById = new Map(data.tiers.map((tier) => [tier.scenario.id, tier.name]))

  return (
    <section className="rounded-sm border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/30 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionHeader eyebrow="Optimized Portfolio" title="Five-Minute Risk Ladder" />
          <p className="mt-2 max-w-3xl text-sm/6 text-slate-300">
            Five quant portfolios regenerated about every five minutes from a blended score of recent portfolio winners, weighted contribution, repeat frequency, and recency. If the winner pool is thin, the service backfills from S&amp;P 500 symbols before re-optimizing each risk tier.
          </p>
          <p className="mt-2 max-w-3xl text-xs/5 text-slate-500">Exploratory only. These are automated model portfolios, not investment advice.</p>
        </div>
        <div className="grid gap-2 text-xs/5 sm:grid-cols-2 lg:min-w-[24rem]">
          <LogMetric label="Latest snapshot" value={latestSnapshot ? formatTerminalTime(latestSnapshot) : isLoading ? 'Loading' : '—'} />
          <LogMetric label="Next run" value={data.nextRunAt ? formatTerminalTime(data.nextRunAt) : 'Hourly'} />
          <LogMetric label="Best 30D" value={best30 ? `${best30.scenario.name} ${formatNullablePct(best30.horizon?.portfolioReturn ?? null)}` : '—'} valueClassName="text-emerald-300" />
          <LogMetric label="Lowest MDD" value={lowestDrawdown ? `${lowestDrawdown.scenario.name} ${formatNullablePct(lowestDrawdown.horizon?.maxDrawdown ?? null)}` : '—'} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-5">
        {data.tiers.length > 0 ? data.tiers.map((tier) => {
          const comparison = tier.comparison
          const topPositions = tier.positions.slice(0, 5)
          const excessClass = comparison === null ? 'text-slate-500' : comparison.excessReturn >= 0 ? 'text-emerald-300' : 'text-rose-300'
          return (
            <article key={tier.key} className={`rounded-sm border bg-slate-950 p-3 ${selectedTier?.key === tier.key ? 'border-cyan-300/60' : 'border-white/10'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">{tier.riskLabel}</p>
                  <h3 className="mt-1 text-lg/6 font-black text-white">{tier.name}</h3>
                </div>
                <span className="rounded-sm border border-emerald-300/40 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200">Optimized</span>
              </div>
              <p className="mt-2 text-xs/5 text-slate-400">{tier.description}</p>
              <div className="mt-3 grid gap-1 border-t border-white/10 pt-3 font-mono text-xs/5 text-slate-300">
                <span>Positions {tier.positions.length || tier.scenario.symbols.length}</span>
                <span>Sharpe {formatNullableNumber(tier.metrics.sharpeRatio, 2)}</span>
                <span>Vol {formatNullablePct(tier.metrics.annualizedVolatility)}</span>
                <span>Beta {formatNullableNumber(tier.metrics.betaVsBenchmark, 2)}</span>
                <span>Corr {formatNullableNumber(tier.metrics.correlationVsBenchmark, 2)}</span>
                <span>MDD {formatNullablePct(tier.metrics.maxDrawdown)}</span>
                <span>Expected {tier.snapshot ? formatPct(tier.snapshot.expectedReturn) : '—'}</span>
                <span>Turnover {tier.snapshot ? formatPct(tier.snapshot.turnoverRatio) : '—'}</span>
                <span>Top 5 {formatPct(tier.metrics.topFiveConcentration)}</span>
                <span>Effective names {tier.metrics.effectiveHoldings.toFixed(1)}</span>
                <span>New / dropped {tier.metrics.newPositions} / {tier.metrics.droppedPositions}</span>
                <span>Winner / backfill {tier.metrics.winnerDerivedPositions} / {tier.metrics.backfilledPositions}</span>
                <span className={excessClass}>Excess {comparison ? formatPct(comparison.excessReturn) : '—'}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {topPositions.length > 0 ? topPositions.map((position) => (
                  <span key={position.id} className="rounded-sm bg-white/5 px-2 py-1 font-mono text-xs text-slate-200">{position.symbol} {formatPct(position.weight)}</span>
                )) : tier.scenario.symbols.slice(0, 5).map((symbol) => (
                  <span key={symbol} className="rounded-sm bg-white/5 px-2 py-1 font-mono text-xs text-slate-400">{symbol}</span>
                ))}
              </div>
              <button className="mt-3 rounded-sm border border-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-100" type="button" onClick={() => setSelectedTierKey(tier.key)}>
                Show holdings chart
              </button>
            </article>
          )
        }) : (
          <p className="rounded-sm border border-white/10 bg-slate-950 px-4 py-6 text-sm/6 text-slate-300 lg:col-span-5">{isLoading ? 'Loading optimized portfolios...' : 'No optimized portfolios are available yet.'}</p>
        )}
      </div>

      <OptimizedGrowthChart series={data.charts.growth} />

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <OptimizedRiskReturnScatter points={data.charts.riskReturn} />
        <OptimizedDrawdownChart series={data.charts.drawdown} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <OptimizedHoldingsBarChart tier={selectedTier} />
        <OptimizedCorrelationHeatmap data={data.charts.correlationHeatmap} tiers={data.tiers} />
      </div>

      <div className="mt-3 rounded-sm border border-white/10 bg-slate-950 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg/7 font-black text-white">Optimized Performance</h3>
            <p className="mt-1 text-xs/5 text-slate-400">Filtered leaderboard for the five-minute optimized portfolios versus {comparisonData.benchmarkSymbol || data.benchmarkSymbol}.</p>
          </div>
          <span className="rounded-sm border border-white/10 px-2 py-1 font-mono text-xs text-cyan-200">Benchmark {comparisonData.benchmarkSymbol || data.benchmarkSymbol}</span>
        </div>
        <PortfolioComparisonLineChart data={comparisonData} scenarioNameById={scenarioNameById} />
        <div className="mt-3 overflow-x-auto rounded-sm border border-white/10 bg-slate-950">
          <table className="min-w-[72rem] w-full border-collapse text-left text-sm/6">
            <thead className="bg-white/5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
              <tr>
                <th className="px-3 py-2">Portfolio</th>
                <th className="px-3 py-2">Risk</th>
                <th className="px-3 py-2">Risk metrics</th>
                <th className="px-3 py-2">Structure</th>
                {comparisonData.scenarios[0]?.horizons.map((horizon) => <th key={horizon.days} className="px-3 py-2">{horizon.label} portfolio / excess</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-200">
              {data.tiers.length > 0 ? data.tiers.map((tier) => {
                const row = comparisonData.scenarios.find((scenario) => scenario.scenarioId === tier.scenario.id)
                return (
                  <tr key={tier.key} className="align-top hover:bg-white/5">
                    <td className="px-3 py-2">
                      <p className="font-bold text-white">{tier.name}</p>
                      <p className="font-mono text-xs text-slate-500">Latest {tier.snapshot ? formatTerminalTime(tier.snapshot.createdAt) : '—'}</p>
                    </td>
                    <td className="px-3 py-2"><span className="rounded-sm border border-white/10 px-2 py-1 text-xs font-black uppercase tracking-[0.14em] text-slate-300">{tier.riskLabel}</span></td>
                    <td className="px-3 py-2 font-mono text-xs/5 text-slate-300">
                      <p>Sharpe {formatNullableNumber(tier.metrics.sharpeRatio, 2)}</p>
                      <p>Vol {formatNullablePct(tier.metrics.annualizedVolatility)}</p>
                      <p>MDD {formatNullablePct(tier.metrics.maxDrawdown)}</p>
                      <p>β {formatNullableNumber(tier.metrics.betaVsBenchmark, 2)} / ρ {formatNullableNumber(tier.metrics.correlationVsBenchmark, 2)}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs/5 text-slate-300">
                      <p>Top 5 {formatPct(tier.metrics.topFiveConcentration)}</p>
                      <p>Eff {tier.metrics.effectiveHoldings.toFixed(1)}</p>
                      <p>New/drop {tier.metrics.newPositions}/{tier.metrics.droppedPositions}</p>
                      <p>Winner/backfill {tier.metrics.winnerDerivedPositions}/{tier.metrics.backfilledPositions}</p>
                    </td>
                    {(row?.horizons ?? comparisonData.scenarios[0]?.horizons ?? []).map((horizon) => {
                      const excessTone = horizon.excessReturn === null ? 'text-slate-500' : horizon.excessReturn >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      return (
                        <td key={horizon.days} className="px-3 py-2 font-mono">
                          {horizon.status === 'unavailable'
                            ? <span className="text-slate-500">n/a</span>
                            : <span>{formatNullablePct(horizon.portfolioReturn)} / <span className={excessTone}>{formatNullablePct(horizon.excessReturn)}</span></span>}
                        </td>
                      )
                    })}
                  </tr>
                )
              }) : (
                <tr><td className="px-4 py-6 text-slate-300" colSpan={6}>No optimized performance rows yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function OptimizedGrowthChart({ series }: { series: OptimizedPortfoliosResponse['charts']['growth'] }) {
  return <MultiSeriesLineChart title="Growth of $10,000" description="Current optimized weights applied to recent daily adjusted-close returns, compared with SPY." series={series} valueFormatter={formatCurrency} />
}

function OptimizedDrawdownChart({ series }: { series: OptimizedPortfoliosResponse['charts']['drawdown'] }) {
  return <MultiSeriesLineChart title="Drawdown From Peak" description="Peak-to-trough drawdown path for each optimized tier." series={series} valueFormatter={formatPct} />
}

function MultiSeriesLineChart({ title, description, series, valueFormatter }: { title: string; description: string; series: OptimizedPortfoliosResponse['charts']['growth']; valueFormatter: (value: number) => string }) {
  const width = 760
  const height = 300
  const padding = { top: 24, right: 24, bottom: 38, left: 72 }
  const allValues = series.flatMap((entry) => entry.values.map((point) => point.value)).filter(Number.isFinite)
  const dates = [...new Set(series.flatMap((entry) => entry.values.map((point) => point.date)))].sort()
  const hasData = dates.length > 1 && allValues.length > 1
  const min = hasData ? Math.min(...allValues) : 0
  const max = hasData ? Math.max(...allValues) : 1
  const range = max - min || 1
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const xFor = (date: string) => padding.left + (dates.indexOf(date) / Math.max(1, dates.length - 1)) * plotWidth
  const yFor = (value: number) => padding.top + ((max - value) / range) * plotHeight
  const ticks = [max, min + range / 2, min]
  const pointPath = (values: Array<{ date: string; value: number }>) => values.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(point.date)} ${yFor(point.value)}`).join(' ')

  return (
    <div className="mt-3 rounded-sm border border-white/10 bg-slate-950 p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg/7 font-black text-white">{title}</h3>
          <p className="text-xs/5 text-slate-400">{description}</p>
        </div>
      </div>
      {hasData ? (
        <div className="mt-3 overflow-x-auto">
          <svg className="min-w-[44rem] w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
            <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="rgba(255,255,255,0.03)" />
            {ticks.map((tick) => (
              <g key={tick.toFixed(6)}>
                <line x1={padding.left} x2={width - padding.right} y1={yFor(tick)} y2={yFor(tick)} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 5" />
                <text x={padding.left - 10} y={yFor(tick) + 4} textAnchor="end" className="fill-slate-400 font-mono text-[10px]">{valueFormatter(tick)}</text>
              </g>
            ))}
            {dates.filter((_, index) => index === 0 || index === dates.length - 1 || index === Math.floor(dates.length / 2)).map((date) => (
              <text key={date} x={xFor(date)} y={height - 14} textAnchor="middle" className="fill-slate-400 font-mono text-[10px]">{date.slice(5)}</text>
            ))}
            {series.map((entry) => {
              const color = entry.id === 'SPY' ? 'rgba(203,213,225,0.9)' : getPortfolioColor(Number(entry.id) || hashLabel(entry.id))
              return <path key={entry.id} d={pointPath(entry.values)} fill="none" stroke={color} strokeWidth={entry.id === 'SPY' ? 2 : 2.5} strokeDasharray={entry.id === 'SPY' ? '7 5' : undefined} />
            })}
          </svg>
          <ChartLegend series={series.map((entry) => ({ id: entry.id, name: entry.name }))} />
        </div>
      ) : <p className="mt-3 rounded-sm border border-white/10 bg-slate-900 px-3 py-4 text-sm/6 text-slate-300">Not enough history for this chart yet.</p>}
    </div>
  )
}

function OptimizedRiskReturnScatter({ points }: { points: OptimizedPortfoliosResponse['charts']['riskReturn'] }) {
  const width = 560
  const height = 320
  const padding = { top: 24, right: 26, bottom: 48, left: 62 }
  const valid = points.filter((point) => point.annualizedReturn !== null && point.annualizedVolatility !== null)
  const hasData = valid.length > 0
  const maxX = Math.max(0.01, ...valid.map((point) => point.annualizedVolatility ?? 0))
  const minY = Math.min(0, ...valid.map((point) => point.annualizedReturn ?? 0))
  const maxY = Math.max(0.01, ...valid.map((point) => point.annualizedReturn ?? 0))
  const yRange = maxY - minY || 0.01
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const xFor = (value: number) => padding.left + (value / maxX) * plotWidth
  const yFor = (value: number) => padding.top + ((maxY - value) / yRange) * plotHeight

  return (
    <div className="rounded-sm border border-white/10 bg-slate-950 p-3">
      <h3 className="text-lg/7 font-black text-white">Risk / Return Scatter</h3>
      <p className="text-xs/5 text-slate-400">X = annualized volatility, Y = annualized return, bubble = effective holdings.</p>
      {hasData ? (
        <div className="mt-3 overflow-x-auto">
          <svg className="min-w-[34rem] w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Risk return scatter">
            <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="rgba(255,255,255,0.03)" />
            <line x1={padding.left} x2={width - padding.right} y1={yFor(0)} y2={yFor(0)} stroke="rgba(255,255,255,0.2)" />
            <text x={padding.left} y={height - 14} className="fill-slate-400 font-mono text-[10px]">Vol 0%</text>
            <text x={width - padding.right} y={height - 14} textAnchor="end" className="fill-slate-400 font-mono text-[10px]">{formatPct(maxX)}</text>
            <text x={padding.left - 10} y={yFor(maxY) + 4} textAnchor="end" className="fill-slate-400 font-mono text-[10px]">{formatPct(maxY)}</text>
            <text x={padding.left - 10} y={yFor(minY) + 4} textAnchor="end" className="fill-slate-400 font-mono text-[10px]">{formatPct(minY)}</text>
            {valid.map((point) => {
              const color = getPortfolioColor(point.scenarioId)
              const radius = Math.max(5, Math.min(15, point.effectiveHoldings / 2))
              return (
                <g key={point.scenarioId}>
                  <circle cx={xFor(point.annualizedVolatility!)} cy={yFor(point.annualizedReturn!)} r={radius} fill={color} fillOpacity="0.82" />
                  <text x={xFor(point.annualizedVolatility!) + radius + 4} y={yFor(point.annualizedReturn!) + 4} className="fill-slate-200 font-mono text-[10px]">{point.name}</text>
                </g>
              )
            })}
          </svg>
        </div>
      ) : <p className="mt-3 rounded-sm border border-white/10 bg-slate-900 px-3 py-4 text-sm/6 text-slate-300">Not enough data for scatter points yet.</p>}
    </div>
  )
}

function OptimizedHoldingsBarChart({ tier }: { tier: OptimizedPortfoliosResponse['tiers'][number] | null }) {
  const positions = tier?.positions.slice(0, 12) ?? []
  const maxWeight = Math.max(...positions.map((position) => position.weight), 0.01)
  return (
    <div className="rounded-sm border border-white/10 bg-slate-950 p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg/7 font-black text-white">Holdings Weight</h3>
          <p className="text-xs/5 text-slate-400">Top weights for {tier?.name ?? 'selected optimized portfolio'}.</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {positions.length > 0 ? positions.map((position) => (
          <div key={position.id} className="grid grid-cols-[4rem_minmax(0,1fr)_4rem] items-center gap-2 text-sm/5">
            <span className="font-mono font-black text-cyan-100">{position.symbol}</span>
            <div className="h-3 rounded-sm bg-white/10">
              <div className="h-3 rounded-sm bg-cyan-300" style={{ width: `${Math.max(2, (position.weight / maxWeight) * 100)}%` }} />
            </div>
            <span className="text-right font-mono text-slate-300">{formatPct(position.weight)}</span>
          </div>
        )) : <p className="rounded-sm border border-white/10 bg-slate-900 px-3 py-4 text-sm/6 text-slate-300">No holdings available yet.</p>}
      </div>
    </div>
  )
}

function OptimizedCorrelationHeatmap({ data, tiers }: { data: OptimizedPortfoliosResponse['charts']['correlationHeatmap']; tiers: OptimizedPortfoliosResponse['tiers'] }) {
  const betaByName = new Map(tiers.map((tier) => [tier.name, tier.metrics.betaVsBenchmark]))
  const cellFor = (row: string, column: string) => data.cells.find((cell) => cell.row === row && cell.column === column)?.correlation ?? null
  return (
    <div className="rounded-sm border border-white/10 bg-slate-950 p-3">
      <h3 className="text-lg/7 font-black text-white">Correlation / Beta Heatmap</h3>
      <p className="text-xs/5 text-slate-400">Correlation versus SPY, QQQ, and the other optimized tiers. Row badge shows beta vs SPY.</p>
      {data.rows.length > 0 && data.columns.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[40rem] w-full border-collapse text-xs/5">
            <thead>
              <tr className="text-left font-black uppercase tracking-[0.14em] text-slate-400">
                <th className="px-2 py-2">Tier</th>
                {data.columns.map((column) => <th key={column} className="px-2 py-2 text-center">{column}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.rows.map((row) => (
                <tr key={row}>
                  <td className="px-2 py-2 font-bold text-white">
                    {row}
                    <span className="ml-2 rounded-sm border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">β {formatNullableNumber(betaByName.get(row) ?? null, 2)}</span>
                  </td>
                  {data.columns.map((column) => {
                    const value = cellFor(row, column)
                    return <td key={column} className="px-2 py-2 text-center"><span className="inline-flex min-w-14 justify-center rounded-sm px-2 py-1 font-mono text-slate-950" style={{ backgroundColor: heatColor(value) }}>{value === null ? '—' : value.toFixed(2)}</span></td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-3 rounded-sm border border-white/10 bg-slate-900 px-3 py-4 text-sm/6 text-slate-300">Not enough aligned returns for a heatmap yet.</p>}
    </div>
  )
}

function ChartLegend({ series }: { series: Array<{ id: string; name: string }> }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs/5 text-slate-300">
      {series.map((entry) => (
        <span key={entry.id} className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 px-2 py-1">
          <span className="size-2 rounded-full" style={{ backgroundColor: entry.id === 'SPY' ? 'rgb(203,213,225)' : getPortfolioColor(Number(entry.id) || hashLabel(entry.id)) }} />
          {entry.name}
        </span>
      ))}
    </div>
  )
}

const optimizeStepLabel = (step: PortfolioOptimizeJob['step']) => {
  switch (step) {
    case 'queued':
      return 'Queued'
    case 'sampling':
      return 'Sampling universe'
    case 'fetching_history':
      return 'Fetching histories'
    case 'aligning_returns':
      return 'Aligning returns'
    case 'optimizing':
      return 'Optimizing weights'
    case 'persisting':
      return 'Saving to database'
    default:
      return step
  }
}

export function PortfolioDashboard({
  data,
  comparisonData,
  signalCalibration,
  history,
  isLoading,
  isOptimizeRunning,
  optimizeJob,
  onPageChange,
  onRunOptimize,
  onOpenTrendingSnapshot,
  scenarios,
  selectedScenarioId,
  onSelectScenario,
  onRenameScenario,
  onSaveScenario,
  onDeleteScenario,
}: {
  data: PortfolioResponse
  comparisonData: PortfolioComparisonResponse
  signalCalibration: PortfolioSignalCalibrationResponse
  history: PortfolioHistoryResponse
  isLoading: boolean
  isOptimizeRunning: boolean
  optimizeJob: PortfolioOptimizeJob | null
  onPageChange: (page: number) => void
  onRunOptimize: (payload: Sp500OptimizePayload) => Promise<void>
  onOpenTrendingSnapshot: (snapshotId: number) => void
  scenarios: PortfolioScenario[]
  selectedScenarioId: number | null
  onSelectScenario: (scenarioId: number) => void
  onRenameScenario: (scenarioId: number, name: string) => Promise<void>
  onSaveScenario: (input: PortfolioScenarioInput, editId: number | null) => Promise<void>
  onDeleteScenario: (scenarioId: number) => Promise<void>
}) {
  const snapshot = data.snapshot
  const comparison = data.comparison
  const selectedScenario = selectedScenarioId !== null ? scenarios.find((s) => s.id === selectedScenarioId) ?? null : null
  const tiltLabel = selectedScenario?.refreshMode === 'quant' ? 'Ann. optimizer return' : 'Model tilt (heuristic)'
  const totalPages = Math.max(1, Math.ceil(history.total / history.pageSize))
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false)
  const [editingScenarioId, setEditingScenarioId] = useState<number | null>(null)
  const [formName, setFormName] = useState('')
  const [formSymbols, setFormSymbols] = useState('')
  const [formNovelty, setFormNovelty] = useState<'low' | 'medium' | 'high'>('medium')
  const [formMaxWeight, setFormMaxWeight] = useState('0.15')
  const [formBusy, setFormBusy] = useState(false)
  const [optN, setOptN] = useState('20')
  const [optMethod, setOptMethod] = useState<QuantMethod>('max_sharpe')
  const [optPolicy, setOptPolicy] = useState<QuantUniversePolicy>('reroll')
  const [optKeepK, setOptKeepK] = useState('3')
  const [optRerunQuant, setOptRerunQuant] = useState(false)
  const [formQuantPolicy, setFormQuantPolicy] = useState<QuantUniversePolicy>('reroll')
  const [formQuantK, setFormQuantK] = useState('3')
  const [formQuantN, setFormQuantN] = useState('20')
  const [formQuantMethod, setFormQuantMethod] = useState<QuantMethod>('max_sharpe')
  const [formQuantReoptMin, setFormQuantReoptMin] = useState('1440')
  const [renameBusy, setRenameBusy] = useState(false)
  const [allocationModalOpen, setAllocationModalOpen] = useState(false)
  const [allocationAmount, setAllocationAmount] = useState('10000')

  const editingScenario = editingScenarioId !== null ? scenarios.find((s) => s.id === editingScenarioId) ?? null : null
  const isQuantScenarioModal = editingScenario?.refreshMode === 'quant'

  const openCreateModal = () => {
    setEditingScenarioId(null)
    setFormName('')
    setFormSymbols('')
    setFormNovelty('medium')
    setFormMaxWeight('0.15')
    setFormQuantPolicy('reroll')
    setFormQuantK('3')
    setFormQuantN('20')
    setFormQuantMethod('max_sharpe')
    setFormQuantReoptMin('1440')
    setScenarioModalOpen(true)
  }

  const openEditModal = (scenario: PortfolioScenario) => {
    setEditingScenarioId(scenario.id)
    setFormName(scenario.name)
    setFormSymbols(scenario.symbols.join(', '))
    setFormNovelty(scenario.noveltyProfile)
    setFormMaxWeight(String(scenario.maxWeightPerAsset))
    setFormQuantPolicy(scenario.quantUniversePolicy ?? 'reroll')
    setFormQuantK(String(scenario.quantKeepCount ?? 0))
    setFormQuantN(String(scenario.quantTargetN ?? 20))
    setFormQuantMethod(scenario.quantMethod ?? 'max_sharpe')
    setFormQuantReoptMin(String(scenario.quantReoptimizeMs ? Math.round(scenario.quantReoptimizeMs / 60_000) : 1440))
    setScenarioModalOpen(true)
  }

  const submitScenarioForm = async () => {
    const symbols = formSymbols
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
    const maxWeightPerAsset = Math.min(0.5, Math.max(0.05, Number.parseFloat(formMaxWeight) || 0.15))
    const input: PortfolioScenarioInput = {
      name: formName.trim(),
      symbols,
      noveltyProfile: formNovelty,
      maxWeightPerAsset,
    }
    const editTarget = editingScenarioId !== null ? scenarios.find((s) => s.id === editingScenarioId) : null
    if (editTarget?.refreshMode === 'quant') {
      const nt = Math.min(50, Math.max(5, Number.parseInt(formQuantN, 10) || 20))
      const kk = Math.min(nt, Math.max(0, Number.parseInt(formQuantK, 10) || 0))
      const rm = Math.max(1, Number.parseFloat(formQuantReoptMin) || 1440)
      input.quantUniversePolicy = formQuantPolicy
      input.quantKeepCount = kk
      input.quantTargetN = nt
      input.quantMethod = formQuantMethod
      input.quantReoptimizeMs = Math.round(rm * 60_000)
    }
    if (!input.name || input.symbols.length === 0) return
    setFormBusy(true)
    try {
      await onSaveScenario(input, editingScenarioId)
      setScenarioModalOpen(false)
    } finally {
      setFormBusy(false)
    }
  }

  const intervalPortfolioClass =
    comparison === null ? 'text-slate-400' : (comparison.portfolioReturn ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'
  const intervalBenchmarkClass =
    comparison === null ? 'text-slate-400' : (comparison.benchmarkReturn ?? 0) >= 0 ? 'text-sky-300' : 'text-rose-300'
  const intervalExcessClass =
    comparison === null ? 'text-slate-400' : (comparison.excessReturn ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'
  const scenarioNameById = new Map(scenarios.map((scenario) => [scenario.id, scenario.name]))
  const allocationAmountValue = Math.max(0, Number.parseFloat(allocationAmount.replace(/,/g, '')) || 0)
  const positiveWeightPositions = data.positions.filter((position) => position.weight > 0)
  const allocationWeightTotal = positiveWeightPositions.reduce((sum, position) => sum + position.weight, 0)
  const allocationRows = positiveWeightPositions.map((position) => {
    const normalizedWeight = allocationWeightTotal > 0 ? position.weight / allocationWeightTotal : 0
    const targetDollars = allocationAmountValue * normalizedWeight
    const fractionalShares = position.entryPrice > 0 ? targetDollars / position.entryPrice : 0
    const wholeShares = Math.floor(fractionalShares)
    const wholeShareDollars = wholeShares * position.entryPrice
    return {
      ...position,
      normalizedWeight,
      targetDollars,
      fractionalShares,
      wholeShares,
      wholeShareDollars,
      residualCash: targetDollars - wholeShareDollars,
    }
  })
  const wholeShareTotal = allocationRows.reduce((sum, row) => sum + row.wholeShareDollars, 0)

  return (
    <section className="rounded-sm border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/30 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionHeader eyebrow="Portfolio Lab" title="Auto Portfolios" />
          <p className="mt-2 max-w-3xl text-sm/6 text-slate-300">
            Each scenario has its own symbol universe and risk profile (novelty). News scenarios blend Trending tickers; quant scenarios use the historical optimizer only. Interval returns and excess are versus SPY since the last snapshot, not annualized.
          </p>
          <p className="mt-2 max-w-3xl text-xs/5 text-slate-500">
            News-mode “tilt” and alignment scores are exploratory attention signals derived from Trending clusters — not forecasts of short-term P&L. Use calibration below only to sanity-check how prior tilts lined up with realized interval excess.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="sr-only" htmlFor="portfolio-scenario">Scenario</label>
          <select
            id="portfolio-scenario"
            className="min-w-[12rem] rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-sm/5 text-white outline-hidden focus:border-cyan-300 focus:ring-3 focus:ring-cyan-300/20"
            value={selectedScenarioId ?? ''}
            disabled={isLoading || scenarios.length === 0}
            onChange={(event) => onSelectScenario(Number(event.target.value))}
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isDefault ? ' (default)' : ''}
                {s.refreshMode === 'quant' ? ' · quant' : ''}
                {s.source === 'optimized' ? ' · optimized' : ''}
              </option>
            ))}
          </select>
          <button
            className="rounded-sm border border-white/10 px-3 py-2 text-sm/5 font-black uppercase tracking-[0.14em] text-slate-200 transition enabled:hover:border-cyan-300/70 enabled:hover:text-cyan-100 disabled:opacity-40"
            type="button"
            onClick={openCreateModal}
          >
            New scenario
          </button>
          {selectedScenarioId !== null && (
            <>
              <button
                className="rounded-sm border border-white/10 px-3 py-2 text-sm/5 font-black uppercase tracking-[0.14em] text-slate-200 transition enabled:hover:border-cyan-300/70 enabled:hover:text-cyan-100 disabled:opacity-40"
                type="button"
                disabled={!scenarios.find((s) => s.id === selectedScenarioId)}
                onClick={() => {
                  const sc = scenarios.find((s) => s.id === selectedScenarioId)
                  if (!sc) return
                  const nextName = window.prompt('Rename portfolio scenario', sc.name)?.trim()
                  if (!nextName || nextName === sc.name) return
                  setRenameBusy(true)
                  void onRenameScenario(sc.id, nextName).finally(() => setRenameBusy(false))
                }}
              >
                {renameBusy ? 'Renaming…' : 'Rename'}
              </button>
              <button
                className="rounded-sm border border-white/10 px-3 py-2 text-sm/5 font-black uppercase tracking-[0.14em] text-slate-200 transition enabled:hover:border-cyan-300/70 enabled:hover:text-cyan-100 disabled:opacity-40"
                type="button"
                disabled={!scenarios.find((s) => s.id === selectedScenarioId)}
                onClick={() => {
                  const sc = scenarios.find((s) => s.id === selectedScenarioId)
                  if (sc) openEditModal(sc)
                }}
              >
                Edit
              </button>
              <button
                className="rounded-sm border border-red-300/40 px-3 py-2 text-sm/5 font-black uppercase tracking-[0.14em] text-red-200 transition enabled:hover:border-red-300 enabled:hover:text-red-100 disabled:opacity-40"
                type="button"
                disabled={!scenarios.find((s) => s.id === selectedScenarioId && !s.isDefault)}
                onClick={() => {
                  const sc = scenarios.find((s) => s.id === selectedScenarioId)
                  if (sc && !sc.isDefault && window.confirm(`Delete scenario “${sc.name}” and its history?`)) void onDeleteScenario(sc.id)
                }}
              >
                Delete
              </button>
            </>
          )}
          <button
            className="rounded-sm bg-emerald-300 px-3 py-2 text-sm/5 font-black uppercase tracking-[0.14em] text-slate-950 transition enabled:hover:bg-emerald-200 disabled:opacity-40"
            type="button"
            disabled={positiveWeightPositions.length === 0}
            onClick={() => setAllocationModalOpen(true)}
          >
            Calculate allocation
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-sm border border-cyan-300/25 bg-slate-950/90 p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">S&amp;P 500 historical optimizer</p>
            <p className="mt-1 max-w-3xl text-xs/5 text-slate-400">
              Long-running job: random valid names from the S&amp;P 500, 5y daily data, then max-Sharpe / HRP / Black–Litterman. Creates a <span className="text-slate-300">quant</span> scenario; re-runs on a server schedule. Not investment advice.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">N (5–50)</span>
            <input
              className="w-24 rounded-sm border border-white/10 bg-slate-950 px-3 py-2 font-mono text-sm text-white outline-hidden focus:border-cyan-300"
              inputMode="numeric"
              value={optN}
              onChange={(e) => setOptN(e.target.value)}
              disabled={isOptimizeRunning}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Method</span>
            <select
              className="min-w-[10rem] rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-hidden focus:border-cyan-300"
              value={optMethod}
              onChange={(e) => setOptMethod(e.target.value as QuantMethod)}
              disabled={isOptimizeRunning}
            >
              <option value="max_sharpe">Max Sharpe</option>
              <option value="hrp">HRP</option>
              <option value="black_litterman">Black–Litterman (simplified)</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Universe each run</span>
            <select
              className="min-w-[12rem] rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-hidden focus:border-cyan-300"
              value={optPolicy}
              onChange={(e) => setOptPolicy(e.target.value as QuantUniversePolicy)}
              disabled={isOptimizeRunning}
            >
              <option value="reroll">Random new N</option>
              <option value="keep">Keep current symbols</option>
              <option value="keep_some">Keep K, replace rest</option>
            </select>
          </label>
          {optPolicy === 'keep_some' && (
            <label className="grid gap-1">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">K to pin</span>
              <input
                className="w-24 rounded-sm border border-white/10 bg-slate-950 px-3 py-2 font-mono text-sm text-white outline-hidden focus:border-cyan-300"
                inputMode="numeric"
                value={optKeepK}
                onChange={(e) => setOptKeepK(e.target.value)}
                disabled={isOptimizeRunning}
              />
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className="size-4 rounded border border-white/20 bg-slate-950"
              checked={optRerunQuant}
              onChange={(e) => setOptRerunQuant(e.target.checked)}
              disabled={isOptimizeRunning}
            />
            <span>Re-run selected quant scenario</span>
          </label>
          <button
            className="rounded-sm bg-cyan-300 px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-slate-950 disabled:opacity-40"
            type="button"
            disabled={isOptimizeRunning}
            onClick={() => {
              const n = Math.min(50, Math.max(5, Math.floor(Number.parseInt(optN, 10) || 20)))
              const k = Math.min(n - 1, Math.max(0, Math.floor(Number.parseInt(optKeepK, 10) || 0)))
              const selected = scenarios.find((s) => s.id === selectedScenarioId)
              const payload: Sp500OptimizePayload = {
                n,
                method: optMethod,
                universePolicy: optPolicy,
                ...(optPolicy === 'keep_some' ? { keepCount: k } : {}),
                ...(optRerunQuant && selected?.refreshMode === 'quant' && selectedScenarioId !== null ? { scenarioId: selectedScenarioId } : {}),
              }
              void onRunOptimize(payload)
            }}
          >
            {isOptimizeRunning ? 'Optimizing…' : 'Generate portfolio'}
          </button>
        </div>
        {optimizeJob && (
          <div className="mt-3 space-y-2">
            <progress
              className="h-2 w-full rounded-sm accent-cyan-400 [&::-webkit-progress-bar]:rounded-sm [&::-webkit-progress-bar]:bg-slate-800 [&::-webkit-progress-value]:rounded-sm [&::-webkit-progress-value]:bg-cyan-400"
              value={optimizeJob.progress}
              max={100}
            />
            <div className="rounded-sm border border-white/10 bg-slate-900 px-3 py-2 text-sm/6 text-slate-200">
              <p className="font-mono text-cyan-200">
                {optimizeStepLabel(optimizeJob.step)} · {optimizeJob.progress}%
              </p>
              {optimizeJob.detail && <p className="mt-1 text-xs text-slate-400">{optimizeJob.detail}</p>}
              {optimizeJob.status === 'completed' && optimizeJob.metrics && (
                <div className="mt-2 grid gap-1 border-t border-white/10 pt-2 text-xs font-mono text-slate-300 sm:grid-cols-3">
                  <span>Ann. return {formatPct(optimizeJob.metrics.annualizedReturn)}</span>
                  <span>Ann. vol {formatPct(optimizeJob.metrics.annualizedVol)}</span>
                  <span>Sharpe {optimizeJob.metrics.sharpeRatio.toFixed(2)}</span>
                </div>
              )}
              {optimizeJob.status === 'failed' && optimizeJob.error && (
                <p className="mt-2 text-xs text-rose-300">{optimizeJob.error}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-sm/6 text-slate-200">
          <p><span className="font-black uppercase tracking-[0.16em] text-cyan-300">Snapshot</span> {snapshot ? formatTerminalTime(snapshot.createdAt) : '--:--:--'}</p>
          <p><span className="font-black uppercase tracking-[0.16em] text-cyan-300">Views</span> {snapshot?.viewCount ?? 0}</p>
          <p><span className="font-black uppercase tracking-[0.16em] text-cyan-300">Profile</span> {(snapshot?.noveltyProfile ?? 'medium').toUpperCase()}</p>
          <p>
            <span className="font-black uppercase tracking-[0.16em] text-cyan-300">{tiltLabel}</span>{' '}
            {formatPct(snapshot?.expectedReturn ?? 0)}
          </p>
          {snapshot && (
            <>
              <p>
                <span className="font-black uppercase tracking-[0.16em] text-cyan-300">Regime shift</span> {(snapshot.regimeShift ?? 1).toFixed(3)}
              </p>
              <p>
                <span className="font-black uppercase tracking-[0.16em] text-cyan-300">Narrative alignment</span> {formatPct(snapshot.newsAlignment ?? 0)}
              </p>
              <p>
                <span className="font-black uppercase tracking-[0.16em] text-cyan-300">Lexicon tilt</span> {(snapshot.lexiconTilt ?? 0).toFixed(2)}{' '}
                <span className="text-xs font-normal text-slate-500">(−1 bearish … +1 bullish in clusters touching holdings)</span>
              </p>
            </>
          )}
          {comparison && <p><span className="font-black uppercase tracking-[0.16em] text-cyan-300">Interval end</span> {formatTerminalTime(comparison.measuredAt)}</p>}
          {snapshot?.sourceSnapshotId !== null && snapshot?.sourceSnapshotId !== undefined && (
            <div className="mt-2">
              <button
                type="button"
                className="rounded-sm border border-cyan-300/40 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-cyan-200 transition hover:border-cyan-300 hover:text-cyan-50"
                onClick={() => onOpenTrendingSnapshot(snapshot.sourceSnapshotId!)}
              >
                Open Trending snapshot #{snapshot.sourceSnapshotId}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <LogMetric label="Positions" value={positiveWeightPositions.length.toString()} hint="Active holdings in this snapshot." />
        <LogMetric label="Benchmark" value={snapshot?.benchmarkSymbol ?? 'SPY'} hint="Return baseline for excess (typically SPY)." />
        <LogMetric
          label="Overlap (prior)"
          value={formatPct(snapshot?.overlapRatio ?? 0)}
          hint="Sum of min(old weight, new weight) versus this scenario’s previous snapshot."
        />
        <LogMetric
          label="Turnover (Δ weights)"
          value={formatPct(snapshot?.turnoverRatio ?? 0)}
          hint="Half of gross weight change versus the prior snapshot (cap 100%)."
        />
        <LogMetric
          label="Portfolio Δ"
          value={comparison === null ? '—' : formatPct(comparison.portfolioReturn)}
          hint="Weighted return since prior snapshot using entry prices (this interval, not annualized)."
          valueClassName={intervalPortfolioClass}
        />
        <LogMetric
          label="SPY Δ"
          value={comparison === null ? '—' : formatPct(comparison.benchmarkReturn)}
          hint="Benchmark return over the same interval."
          valueClassName={intervalBenchmarkClass}
        />
        <LogMetric
          label="Excess"
          value={comparison === null ? '—' : formatPct(comparison.excessReturn)}
          hint="Portfolio interval return minus SPY over the same interval. Shows — when there is no prior snapshot yet."
          valueClassName={intervalExcessClass}
        />
      </div>

      <div className="mt-3 rounded-sm border border-white/10 bg-slate-950 p-3">
        <h3 className="text-lg/7 font-black text-white">Signal calibration</h3>
        <p className="mt-1 max-w-4xl text-xs/5 text-slate-400">
          {signalCalibration.realizedHorizonNote || 'Pairs each prior snapshot’s model tilt with realized excess until the next portfolio refresh. Exploratory only.'}
        </p>
        {signalCalibration.assumptions.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-xs/5 text-slate-500">
            {signalCalibration.assumptions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <div className="mt-3 grid gap-2 font-mono text-xs text-slate-300 sm:grid-cols-3">
          <span>Sample intervals: {signalCalibration.summary.sampleSize}</span>
          <span>
            Corr (tilt vs excess):{' '}
            {signalCalibration.summary.correlationModelTiltVsExcess === null
              ? '—'
              : signalCalibration.summary.correlationModelTiltVsExcess.toFixed(3)}
          </span>
          <span>
            MAE (|excess − tilt|):{' '}
            {signalCalibration.summary.meanAbsoluteError === null ? '—' : formatPct(signalCalibration.summary.meanAbsoluteError)}
          </span>
        </div>
        <div className="mt-3 overflow-x-auto rounded-sm border border-white/10 bg-slate-900">
          <table className="min-w-[56rem] w-full border-collapse text-left text-xs/5 text-slate-200">
            <thead className="bg-white/5 font-black uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="px-2 py-2">Interval end</th>
                <th className="px-2 py-2">Prior tilt</th>
                <th className="px-2 py-2">Align</th>
                <th className="px-2 py-2">Lex</th>
                <th className="px-2 py-2">Realized excess</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {signalCalibration.pairs.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={5}>
                    {isLoading ? 'Loading calibration…' : 'Need at least two snapshots with an interval comparison to populate rows.'}
                  </td>
                </tr>
              ) : (
                signalCalibration.pairs
                  .slice()
                  .reverse()
                  .slice(0, 18)
                  .map((row) => {
                    const excess = row.realizedExcessReturn
                    const excessClass =
                      excess === null ? 'text-slate-500' : excess >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    return (
                      <tr key={`${row.intervalEndSnapshotId}-${row.priorSnapshotId}`} className="hover:bg-white/5">
                        <td className="px-2 py-1.5 font-mono text-cyan-100/90">{formatTerminalTime(row.intervalEndAt)}</td>
                        <td className="px-2 py-1.5 font-mono">{formatPct(row.modelTilt)}</td>
                        <td className="px-2 py-1.5 font-mono">{formatPct(row.newsAlignment)}</td>
                        <td className="px-2 py-1.5 font-mono">{row.lexiconTilt.toFixed(2)}</td>
                        <td className={`px-2 py-1.5 font-mono ${excessClass}`}>{excess === null ? '—' : formatPct(excess)}</td>
                      </tr>
                    )
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 rounded-sm border border-white/10 bg-slate-950 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg/7 font-black text-white">Scenario Performance Leaderboard</h3>
            <p className="mt-1 text-xs/5 text-slate-400">
              Realized daily adjusted-close performance as of {formatArchiveTime(comparisonData.asOf)}. Snapshot weights are held until each scenario’s next snapshot. Not financial advice.
            </p>
          </div>
          <span className="rounded-sm border border-white/10 px-2 py-1 font-mono text-xs text-cyan-200">Benchmark {comparisonData.benchmarkSymbol}</span>
        </div>
        <PortfolioComparisonLineChart data={comparisonData} scenarioNameById={scenarioNameById} />
        <div className="mt-3 overflow-x-auto rounded-sm border border-white/10 bg-slate-950">
          <table className="min-w-[78rem] w-full border-collapse text-left text-sm/6">
            <thead className="bg-white/5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
              <tr>
                <th className="px-3 py-2">Scenario</th>
                <th className="px-3 py-2">Type</th>
                {comparisonData.scenarios[0]?.horizons.map((horizon) => (
                  <th key={horizon.days} className="px-3 py-2">{horizon.label} portfolio / {comparisonData.benchmarkSymbol} / excess</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-200">
              {comparisonData.scenarios.length > 0 ? comparisonData.scenarios.map((row) => (
                <tr key={row.scenarioId} className="align-top hover:bg-white/5">
                  <td className="px-3 py-2">
                    <p className="font-bold text-white">{scenarioNameById.get(row.scenarioId) ?? row.name}</p>
                    <p className="font-mono text-xs text-slate-500">Latest {row.latestSnapshotAt ? formatTerminalTime(row.latestSnapshotAt) : '—'}{scenarios.find((scenario) => scenario.id === row.scenarioId)?.source === 'optimized' ? ' · optimized' : ''}</p>
                  </td>
                  <td className="px-3 py-2"><span className="rounded-sm border border-white/10 px-2 py-1 text-xs font-black uppercase tracking-[0.14em] text-slate-300">{row.refreshMode}</span></td>
                  {row.horizons.map((horizon) => {
                    const excessTone = horizon.excessReturn === null ? 'text-slate-500' : horizon.excessReturn >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    return (
                      <td key={horizon.days} className="px-3 py-2 font-mono">
                        {horizon.status === 'unavailable' ? (
                          <span className="text-slate-500">n/a</span>
                        ) : (
                          <div className="grid gap-1">
                            <span>{formatNullablePct(horizon.portfolioReturn)} / {formatNullablePct(horizon.benchmarkReturn)} / <span className={excessTone}>{formatNullablePct(horizon.excessReturn)}</span></span>
                            <span className="text-xs text-slate-500">MDD {formatNullablePct(horizon.maxDrawdown)}{horizon.status === 'partial' ? ' · partial' : ''}</span>
                          </div>
                        )}
                        {horizon.note && <p className="mt-1 max-w-xs text-xs/5 text-slate-500">{horizon.note}</p>}
                      </td>
                    )
                  })}
                </tr>
              )) : (
                <tr>
                  <td className="px-4 py-6 text-slate-300" colSpan={5}>{isLoading ? 'Loading comparison...' : 'No scenario comparison is available yet.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {scenarioModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-8" role="dialog" aria-modal="true" aria-labelledby="scenario-modal-title">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-sm border border-white/10 bg-slate-900 p-4 shadow-2xl">
            <h3 id="scenario-modal-title" className="text-lg font-black text-white">{editingScenarioId === null ? 'New scenario' : 'Edit scenario'}</h3>
            <div className="mt-4 grid gap-3 text-sm/6 text-slate-200">
              <label className="grid gap-1">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Name</span>
                <input className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-white outline-hidden focus:border-cyan-300" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Symbols (comma or space separated)</span>
                <textarea className="min-h-[5rem] rounded-sm border border-white/10 bg-slate-950 px-3 py-2 font-mono text-sm text-white outline-hidden focus:border-cyan-300" value={formSymbols} onChange={(e) => setFormSymbols(e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Risk / novelty</span>
                <select className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-white outline-hidden focus:border-cyan-300" value={formNovelty} onChange={(e) => setFormNovelty(e.target.value as 'low' | 'medium' | 'high')}>
                  <option value="low">Low (stick closer to prior weights)</option>
                  <option value="medium">Medium</option>
                  <option value="high">High (more reshuffling)</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Max weight / asset (0.05–0.50)</span>
                <input className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2 font-mono text-white outline-hidden focus:border-cyan-300" value={formMaxWeight} onChange={(e) => setFormMaxWeight(e.target.value)} inputMode="decimal" />
              </label>
              {isQuantScenarioModal && (
                <>
                  <p className="border-t border-white/10 pt-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Quant scenario (scheduled re-runs)</p>
                  <label className="grid gap-1">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Target N</span>
                    <input
                      className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2 font-mono text-sm text-white outline-hidden focus:border-cyan-300"
                      inputMode="numeric"
                      value={formQuantN}
                      onChange={(e) => setFormQuantN(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Default method</span>
                    <select
                      className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-hidden focus:border-cyan-300"
                      value={formQuantMethod}
                      onChange={(e) => setFormQuantMethod(e.target.value as QuantMethod)}
                    >
                      <option value="max_sharpe">Max Sharpe</option>
                      <option value="hrp">HRP</option>
                      <option value="black_litterman">Black–Litterman</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Universe on each scheduled run</span>
                    <select
                      className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-hidden focus:border-cyan-300"
                      value={formQuantPolicy}
                      onChange={(e) => setFormQuantPolicy(e.target.value as QuantUniversePolicy)}
                    >
                      <option value="reroll">Random new N</option>
                      <option value="keep">Keep current symbols</option>
                      <option value="keep_some">Keep K, replace rest</option>
                    </select>
                  </label>
                  {formQuantPolicy === 'keep_some' && (
                    <label className="grid gap-1">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">K symbols to pin</span>
                      <input
                        className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2 font-mono text-sm text-white outline-hidden focus:border-cyan-300"
                        inputMode="numeric"
                        value={formQuantK}
                        onChange={(e) => setFormQuantK(e.target.value)}
                      />
                    </label>
                  )}
                  <label className="grid gap-1">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Reoptimize every (minutes)</span>
                    <input
                      className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2 font-mono text-sm text-white outline-hidden focus:border-cyan-300"
                      inputMode="decimal"
                      value={formQuantReoptMin}
                      onChange={(e) => setFormQuantReoptMin(e.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="rounded-sm bg-cyan-300 px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-slate-950 disabled:opacity-40" type="button" disabled={formBusy} onClick={() => void submitScenarioForm()}>
                {formBusy ? 'Saving…' : 'Save'}
              </button>
              <button className="rounded-sm border border-white/10 px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-slate-200" type="button" disabled={formBusy} onClick={() => setScenarioModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {allocationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-8" role="dialog" aria-modal="true" aria-labelledby="allocation-modal-title">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-sm border border-white/10 bg-slate-900 p-4 shadow-2xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 id="allocation-modal-title" className="text-lg font-black text-white">Calculate Stock Allocation</h3>
                <p className="mt-1 max-w-3xl text-sm/6 text-slate-300">
                  Uses the latest displayed portfolio weights for {selectedScenario?.name ?? 'the selected scenario'} and normalizes them across active positions. Entry price is used as the share estimate.
                </p>
              </div>
              <button className="rounded-sm border border-white/10 px-3 py-2 text-sm font-black uppercase tracking-[0.14em] text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-100" type="button" onClick={() => setAllocationModalOpen(false)}>
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[16rem_1fr] sm:items-end">
              <label className="grid gap-1">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Amount to allocate</span>
                <input
                  className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2 font-mono text-white outline-hidden focus:border-cyan-300"
                  inputMode="decimal"
                  value={allocationAmount}
                  onChange={(event) => setAllocationAmount(event.target.value)}
                  placeholder="10000"
                />
              </label>
              <div className="grid gap-2 text-xs/5 sm:grid-cols-4">
                <LogMetric label="Input amount" value={formatMoney(allocationAmountValue)} />
                <LogMetric label="Active positions" value={allocationRows.length.toString()} />
                <LogMetric label="Weight sum" value={formatPct(allocationWeightTotal)} hint="Weights are normalized if they do not sum exactly to 100%." />
                <LogMetric label="Whole-share spend" value={formatMoney(wholeShareTotal)} valueClassName="text-emerald-300" />
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-sm border border-white/10 bg-slate-950">
              <table className="min-w-[72rem] w-full border-collapse text-left text-sm/6">
                <thead className="bg-white/5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                  <tr>
                    <th className="px-3 py-2">Symbol</th>
                    <th className="px-3 py-2">Latest weight</th>
                    <th className="px-3 py-2">Normalized</th>
                    <th className="px-3 py-2">Target $</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">Fractional shares</th>
                    <th className="px-3 py-2">Whole shares</th>
                    <th className="px-3 py-2">Whole-share $</th>
                    <th className="px-3 py-2">Residual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-slate-200">
                  {allocationRows.length > 0 ? allocationRows.map((row) => (
                    <tr key={`allocation-${row.id}`} className="align-top hover:bg-white/5">
                      <td className="px-3 py-2 font-mono text-cyan-100">{row.symbol}</td>
                      <td className="px-3 py-2 font-mono">{formatPct(row.weight)}</td>
                      <td className="px-3 py-2 font-mono">{formatPct(row.normalizedWeight)}</td>
                      <td className="px-3 py-2 font-mono text-emerald-200">{formatMoney(row.targetDollars)}</td>
                      <td className="px-3 py-2 font-mono">{formatMoney(row.entryPrice)}</td>
                      <td className="px-3 py-2 font-mono">{row.fractionalShares.toFixed(4)}</td>
                      <td className="px-3 py-2 font-mono">{row.wholeShares}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{formatMoney(row.wholeShareDollars)}</td>
                      <td className="px-3 py-2 font-mono text-slate-400">{formatMoney(row.residualCash)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td className="px-4 py-6 text-slate-300" colSpan={9}>No active positions are available for allocation.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs/5 text-slate-500">
              Fractional shares preserve the model weights. Whole shares are rounded down and leave residual cash; this modal does not place trades or adjust for fees, taxes, minimum lots, liquidity, or bid/ask spread.
            </p>
          </div>
        </div>
      )}

      <div className="mt-3 overflow-x-auto rounded-sm border border-white/10 bg-slate-950">
        <table className="min-w-[62rem] w-full border-collapse text-left text-sm/6">
          <thead className="bg-white/5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
            <tr>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Weight</th>
              <th className="px-3 py-2">Narrative heat</th>
              <th className="px-3 py-2">Implied Return</th>
              <th className="px-3 py-2">Entry Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-slate-200">
            {positiveWeightPositions.length > 0 ? positiveWeightPositions.map((position) => (
              <tr key={position.id} className="align-top hover:bg-white/5">
                <td className="px-3 py-2 font-mono text-cyan-100">{position.symbol}</td>
                <td className="px-3 py-2 font-mono">{formatPct(position.weight)}</td>
                <td className="px-3 py-2 font-mono">{position.viewScore.toFixed(3)}</td>
                <td className="px-3 py-2 font-mono">{formatPct(position.impliedReturn)}</td>
                <td className="px-3 py-2 font-mono">{position.entryPrice.toFixed(2)}</td>
              </tr>
            )) : (
              <tr>
                <td className="px-4 py-6 text-slate-300" colSpan={5}>{isLoading ? 'Loading portfolios...' : 'No active portfolio positions are available yet.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 rounded-sm border border-white/10 bg-slate-950 p-3">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg/7 font-black text-white">Interval Comparison History</h3>
          <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Page {history.page} / {totalPages}</span>
        </div>
        <div className="mt-3 grid gap-2">
          {history.snapshots.length > 0 ? history.snapshots.slice(0, 15).map((entry) => {
            const cmp = entry.comparison
            const portRet = cmp === null ? '—' : formatPct(cmp.portfolioReturn)
            const benchRet = cmp === null ? '—' : formatPct(cmp.benchmarkReturn)
            const excRet = cmp === null ? '—' : formatPct(cmp.excessReturn)
            return (
              <div key={entry.snapshot.id} className="grid gap-2 rounded-sm border border-white/10 bg-slate-900/60 px-3 py-2 sm:grid-cols-[8rem_1fr_1fr_1fr_1fr]">
                <span className="font-mono text-xs/5 text-slate-300">{formatTerminalTime(entry.snapshot.createdAt)}</span>
                <span className={`font-mono ${cmp === null ? 'text-slate-500' : 'text-cyan-200'}`}>Portfolio {portRet}</span>
                <span className={`font-mono ${cmp === null ? 'text-slate-500' : 'text-slate-200'}`}>{entry.snapshot.benchmarkSymbol} {benchRet}</span>
                <span className={`font-mono ${cmp === null ? 'text-slate-500' : 'text-emerald-200'}`}>Excess {excRet}</span>
                <span className="font-mono text-violet-200">Turnover {formatPct(entry.snapshot.turnoverRatio)}</span>
              </div>
            )
          }) : <p className="text-sm/6 text-slate-300">No portfolio history yet.</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm/6 text-slate-300">Showing portfolio snapshots page {history.page} of {totalPages}{isLoading ? ' / loading' : ''}</p>
        <div className="flex gap-2">
          <button className="rounded-sm border border-white/10 px-3 py-1.5 text-sm/5 font-black uppercase tracking-[0.16em] text-slate-200 disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:border-cyan-300/70 enabled:hover:text-cyan-100" type="button" disabled={history.page <= 1 || isLoading} onClick={() => onPageChange(history.page - 1)}>
            Prev
          </button>
          <button className="rounded-sm border border-white/10 px-3 py-1.5 text-sm/5 font-black uppercase tracking-[0.16em] text-slate-200 disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:border-cyan-300/70 enabled:hover:text-cyan-100" type="button" disabled={history.page >= totalPages || isLoading} onClick={() => onPageChange(history.page + 1)}>
            Next
          </button>
        </div>
      </div>
    </section>
  )
}

export function PortfolioDecisionDashboard({ data, profile, isLoading, onProfileChange }: { data: PortfolioDecisionResponse; profile: PortfolioDecisionProfile; isLoading: boolean; onProfileChange: (profile: PortfolioDecisionProfile) => void }) {
  const topDecision = data.portfolioRankings[0]
  const addCount = data.positionDecisions.filter((decision) => decision.action === 'add').length
  const trimCount = data.positionDecisions.filter((decision) => decision.action === 'trim' || decision.action === 'cap').length
  const highFlags = data.riskFlags.filter((flag) => flag.severity === 'high').length
  const profileOptions: PortfolioDecisionProfile[] = ['conservative', 'balanced', 'aggressive']
  const survivorIds = new Set(data.dailySurvivors.map((survivor) => survivor.scenarioId))
  const hasSurvivors = data.dailySurvivors.length > 0

  return (
    <section className="rounded-sm border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/30 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionHeader eyebrow="Decision Overlay" title="Daily Portfolio Decisions" />
          <p className="mt-2 max-w-4xl text-sm/6 text-slate-300">
            Converts raw model portfolios into daily actions using concentration caps, implied-return pruning, beta/drawdown guardrails, realized-history warnings, and current news-theme overlays. Raw optimizer weights are not changed.
          </p>
          <p className="mt-2 max-w-4xl text-xs/5 text-slate-500">Exploratory decision support only. Not investment advice.</p>
        </div>
        <div className="grid gap-2 text-xs/5 sm:grid-cols-2 lg:min-w-[24rem]">
          <label className="sr-only" htmlFor="decision-profile">Risk profile</label>
          <select
            id="decision-profile"
            className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-sm/5 text-white outline-hidden focus:border-cyan-300 focus:ring-3 focus:ring-cyan-300/20"
            value={profile}
            disabled={isLoading}
            onChange={(event) => onProfileChange(event.target.value as PortfolioDecisionProfile)}
          >
            {profileOptions.map((option) => <option key={option} value={option}>{option.toUpperCase()}</option>)}
          </select>
          <LogMetric label="As of" value={formatTerminalTime(data.asOf)} />
          <LogMetric label="Top stance" value={topDecision ? `${topDecision.portfolioName} / ${topDecision.action}` : isLoading ? 'Loading' : '—'} valueClassName="text-cyan-200" />
          <LogMetric label="Actions" value={`${addCount} add / ${trimCount} trim-cap`} />
          <LogMetric label="High flags" value={highFlags.toString()} valueClassName={highFlags > 0 ? 'text-rose-300' : 'text-emerald-300'} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-sm border border-white/10 bg-slate-950 p-3">
          <h3 className="text-base/6 font-black text-white">Recommended Allocation</h3>
          <p className="mt-1 text-xs/5 text-slate-400">Profile template adjusted by concentration, tactical, and data-quality guardrails.</p>
          <div className="mt-3 grid gap-2">
            {data.recommendedAllocation.length > 0 ? data.recommendedAllocation.map((allocation) => (
              <div key={allocation.portfolioName} className="grid gap-2 rounded-sm border border-white/10 bg-slate-900/60 p-2 sm:grid-cols-[10rem_1fr_5rem] sm:items-center">
                <span className="text-sm/5 font-bold text-white">{allocation.portfolioName}</span>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.min(100, allocation.targetPct)}%` }} />
                </div>
                <span className="font-mono text-sm/5 text-cyan-200">{allocation.targetPct.toFixed(0)}%</span>
              </div>
            )) : <p className="text-sm/6 text-slate-300">{isLoading ? 'Loading allocation...' : 'No allocation overlay is available.'}</p>}
          </div>
        </div>
        <DecisionActionDonut data={data} />
      </div>

      <div className="mt-3 rounded-sm border border-emerald-300/25 bg-slate-950 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base/6 font-black text-white">Daily Survivors</h3>
            <p className="mt-1 text-xs/5 text-slate-400">After the NYSE close buffer, the top three blended portfolios are retained for the next day. Non-survivors remain visible below for audit and comparison.</p>
          </div>
          <span className="rounded-sm border border-white/10 px-2 py-1 font-mono text-xs text-emerald-200">{hasSurvivors ? `${data.dailySurvivors[0]?.marketSessionDate} finalized` : 'Pending EOD'}</span>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {hasSurvivors ? data.dailySurvivors.map((survivor) => (
            <article key={survivor.id} className="rounded-sm border border-emerald-300/30 bg-emerald-950/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Survivor #{survivor.rank}</p>
                  <h4 className="mt-1 text-lg/6 font-black text-white">{survivor.scenarioName}</h4>
                </div>
                <span className="rounded-sm bg-emerald-300 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-950">Kept</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs/5">
                <DecisionMetric label="Survivor score" value={survivor.survivorScore.toFixed(1)} />
                <DecisionMetric label="Decision score" value={survivor.decisionScore.toFixed(1)} />
                <DecisionMetric label="Excess" value={formatNullablePct(survivor.realizedExcessReturn)} />
                <DecisionMetric label="MDD" value={formatNullablePct(survivor.maxDrawdown)} />
                <DecisionMetric label="Top 5" value={formatPct(survivor.topFiveConcentration)} />
                <DecisionMetric label="Turnover" value={formatNullablePct(survivor.turnoverRatio)} />
              </div>
              <p className="mt-3 text-xs/5 text-slate-400">{survivor.selectionReason}</p>
            </article>
          )) : <p className="rounded-sm border border-white/10 bg-slate-900/60 px-4 py-6 text-sm/6 text-slate-300 lg:col-span-3">No survivor set has been finalized yet. The scheduler finalizes after the NYSE close buffer, or use the API finalize endpoint for manual recovery.</p>}
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        {data.portfolioRankings.slice(0, 6).map((decision) => (
          <article key={decision.portfolioId} className={`rounded-sm border border-white/10 bg-slate-950 p-3 transition ${hasSurvivors && !survivorIds.has(decision.portfolioId) ? 'opacity-55' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">{decision.role.replaceAll('_', ' ')}</p>
                <h3 className="mt-1 text-lg/6 font-black text-white">{decision.portfolioName}</h3>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={getDecisionActionClass(decision.action)}>{decision.action}</span>
                {hasSurvivors && <span className={survivorIds.has(decision.portfolioId) ? 'rounded-sm bg-emerald-300 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-950' : 'rounded-sm border border-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500'}>{survivorIds.has(decision.portfolioId) ? 'Survivor' : 'De-emphasized'}</span>}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs/5">
              <DecisionMetric label="Score" value={decision.score.toFixed(1)} />
              <DecisionMetric label="Conviction" value={decision.conviction} />
              <DecisionMetric label="Sharpe" value={formatNullableNumber(decision.metrics.sharpeRatio, 2)} />
              <DecisionMetric label="Beta" value={formatNullableNumber(decision.metrics.betaVsBenchmark, 2)} />
              <DecisionMetric label="Top 5" value={formatPct(decision.metrics.topFiveConcentration)} />
              <DecisionMetric label="Eff names" value={decision.metrics.effectiveHoldings.toFixed(1)} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {decision.riskFlags.slice(0, 4).map((flag) => <span key={`${decision.portfolioId}-${flag.code}`} className={getFlagClass(flag.severity)}>{flag.code.replaceAll('_', ' ')}</span>)}
            </div>
            <p className="mt-3 text-xs/5 text-slate-400">{decision.rationale[0]}</p>
          </article>
        ))}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-sm border border-white/10 bg-slate-950 p-3">
          <h3 className="text-base/6 font-black text-white">News Theme Overlay</h3>
          <div className="mt-3 grid gap-2">
            {data.newsThemes.map((theme) => (
              <article key={theme.key} className="rounded-sm border border-white/10 bg-slate-900/60 p-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-white">{theme.label}</p>
                  <span className={getThemeClass(theme.stance)}>{theme.stance}</span>
                </div>
                <p className="mt-1 text-xs/5 text-slate-400">{theme.rationale}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="rounded-sm border border-white/10 bg-slate-950 p-3">
          <h3 className="text-base/6 font-black text-white">Daily Checklist</h3>
          <div className="mt-3 grid gap-2">
            {data.dailyChecklist.map((item) => <p key={item} className="rounded-sm border border-white/10 bg-slate-900/60 px-3 py-2 text-sm/6 text-slate-200">{item}</p>)}
          </div>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-sm border border-white/10 bg-slate-950">
        <table className="min-w-[86rem] w-full border-collapse text-left text-sm/6">
          <thead className="bg-white/5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
            <tr>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Weight</th>
              <th className="px-3 py-2">Cap</th>
              <th className="px-3 py-2">Implied</th>
              <th className="px-3 py-2">Portfolios</th>
              <th className="px-3 py-2">Flags</th>
              <th className="px-3 py-2">Rationale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-slate-200">
            {data.positionDecisions.length > 0 ? data.positionDecisions.slice(0, 80).map((decision) => (
              <tr key={decision.symbol} className="align-top hover:bg-white/5">
                <td className="px-3 py-2 font-mono text-base/6 font-black text-white">{decision.symbol}</td>
                <td className="px-3 py-2"><span className={getPositionActionClass(decision.action)}>{decision.action}</span></td>
                <td className="px-3 py-2 font-mono text-cyan-200">{formatPct(decision.currentWeight)}</td>
                <td className="px-3 py-2 font-mono text-slate-300">{formatPct(decision.suggestedMaxWeight)}</td>
                <td className="px-3 py-2 font-mono text-slate-300">{formatNullablePct(decision.impliedReturn)}</td>
                <td className="px-3 py-2 max-w-xs text-slate-300">{decision.portfolios.join(', ')}</td>
                <td className="px-3 py-2 max-w-sm">
                  <div className="flex flex-wrap gap-1.5">
                    {decision.flags.length > 0 ? decision.flags.map((flag) => <span key={`${decision.symbol}-${flag.code}`} className={getFlagClass(flag.severity)}>{flag.code.replaceAll('_', ' ')}</span>) : <span className="text-slate-500">—</span>}
                  </div>
                </td>
                <td className="px-3 py-2 max-w-md text-slate-300">{decision.rationale.join(' ')}</td>
              </tr>
            )) : (
              <tr><td className="px-4 py-6 text-slate-300" colSpan={8}>{isLoading ? 'Loading position decisions...' : 'No position decisions are available.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 rounded-sm border border-white/10 bg-slate-950 p-3">
        <h3 className="text-base/6 font-black text-white">Model Assumptions</h3>
        <div className="mt-2 grid gap-1 text-xs/5 text-slate-400 sm:grid-cols-2">
          {data.assumptions.map((assumption) => <p key={assumption}>{assumption}</p>)}
        </div>
      </div>
    </section>
  )
}

export function PortfolioPlayoffsDashboard({ finalizedData, intradayData, isLoading, onRangeChange }: { finalizedData: PortfolioBracketResponse; intradayData: PortfolioBracketResponse; isLoading: boolean; onRangeChange: (startDate?: string, endDate?: string, options?: { source?: PortfolioBracketSource; rankScope?: PortfolioBracketRankScope }) => void }) {
  const [startDate, setStartDate] = useState(finalizedData.startDate || intradayData.startDate)
  const [endDate, setEndDate] = useState(finalizedData.endDate || intradayData.endDate)
  const [source, setSource] = useState<PortfolioBracketSource>(intradayData.source)
  const [rankScope, setRankScope] = useState<PortfolioBracketRankScope>(intradayData.rankScope)

  useEffect(() => {
    setStartDate(finalizedData.startDate || intradayData.startDate)
    setEndDate(finalizedData.endDate || intradayData.endDate)
    setSource(intradayData.source)
    setRankScope(intradayData.rankScope)
  }, [finalizedData.startDate, finalizedData.endDate, intradayData.startDate, intradayData.endDate, intradayData.source, intradayData.rankScope])

  const applyRange = () => onRangeChange(startDate || undefined, endDate || undefined, { source, rankScope })
  const resetRange = () => onRangeChange(undefined, undefined, { source, rankScope })
  const windowLabel = finalizedData.startDate && finalizedData.endDate ? `${finalizedData.startDate} / ${finalizedData.endDate}` : intradayData.startDate && intradayData.endDate ? `${intradayData.startDate} / ${intradayData.endDate}` : 'Last week'
  const overlapCount = finalizedData.participants.filter((participant) => intradayData.participants.some((item) => item.scenarioId === participant.scenarioId)).length

  return (
    <section className="rounded-sm border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/30 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionHeader eyebrow="Portfolio Playoffs" title="Dual-Mode Survivor Bracket" />
          <p className="mt-2 max-w-4xl text-sm/6 text-slate-300">Finalized survivors and recency-weighted intraday rankings are shown together for the same window, source filter, and intraday rank scope.</p>
          <p className="mt-2 max-w-4xl text-xs/5 text-slate-500">Exploratory decision support only. Intraday mode lets the latest optimized portfolios be checked before daily finalization.</p>
        </div>
        <div className="grid gap-2 text-xs/5 sm:grid-cols-2 lg:min-w-[30rem]">
          <LogMetric label="Window" value={windowLabel} />
          <LogMetric label="Finalized Champion" value={finalizedData.champion ? `#${finalizedData.champion.seed} ${finalizedData.champion.scenarioName}` : isLoading ? 'Loading' : '—'} valueClassName="text-cyan-200" />
          <LogMetric label="Intraday Champion" value={intradayData.champion ? `#${intradayData.champion.seed} ${intradayData.champion.scenarioName}` : isLoading ? 'Loading' : '—'} valueClassName="text-violet-200" />
          <LogMetric label="Shared Entrants" value={`${overlapCount} portfolios`} />
          <LogMetric label="Source" value={source} />
          <LogMetric label="Intraday Scope" value={rankScope === 'all' ? 'all ranked' : 'top 3'} />
        </div>
      </div>

      <div className="mt-4 rounded-sm border border-white/10 bg-slate-950 p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_0.8fr_0.8fr_auto_auto] md:items-end">
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-slate-400" htmlFor="playoff-start-date">
            Start Date
            <input id="playoff-start-date" className="rounded-sm border border-white/10 bg-slate-900 px-3 py-2 text-sm/5 font-semibold normal-case tracking-normal text-white outline-hidden focus:border-cyan-300 focus:ring-3 focus:ring-cyan-300/20" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-slate-400" htmlFor="playoff-end-date">
            End Date
            <input id="playoff-end-date" className="rounded-sm border border-white/10 bg-slate-900 px-3 py-2 text-sm/5 font-semibold normal-case tracking-normal text-white outline-hidden focus:border-cyan-300 focus:ring-3 focus:ring-cyan-300/20" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-slate-400" htmlFor="playoff-source">
            Source
            <select id="playoff-source" className="rounded-sm border border-white/10 bg-slate-900 px-3 py-2 text-sm/5 font-semibold normal-case tracking-normal text-white outline-hidden focus:border-cyan-300" value={source} onChange={(event) => setSource(event.target.value as PortfolioBracketSource)}>
              <option value="all">All</option>
              <option value="optimized">Optimized</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-slate-400" htmlFor="playoff-rank-scope">
            Intraday Scope
            <select id="playoff-rank-scope" className="rounded-sm border border-white/10 bg-slate-900 px-3 py-2 text-sm/5 font-semibold normal-case tracking-normal text-white outline-hidden focus:border-cyan-300" value={rankScope} onChange={(event) => setRankScope(event.target.value as PortfolioBracketRankScope)}>
              <option value="all">All Ranked</option>
              <option value="survivors">Top 3</option>
            </select>
          </label>
          <button className="rounded-sm bg-cyan-300 px-4 py-2 text-sm/5 font-black uppercase tracking-[0.16em] text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={isLoading} onClick={applyRange}>Apply</button>
          <button className="rounded-sm border border-white/10 px-4 py-2 text-sm/5 font-black uppercase tracking-[0.16em] text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={isLoading} onClick={resetRange}>Last Week</button>
        </div>
      </div>

      <PortfolioPlayoffComparison finalizedData={finalizedData} intradayData={intradayData} />

      <div className="mt-4 grid gap-3 2xl:grid-cols-2">
        <PortfolioBracketPanel title="Finalized" accent="cyan" data={finalizedData} isLoading={isLoading} />
        <PortfolioBracketPanel title="Intraday" accent="violet" data={intradayData} isLoading={isLoading} />
      </div>
    </section>
  )
}

function PortfolioPlayoffComparison({ finalizedData, intradayData }: { finalizedData: PortfolioBracketResponse; intradayData: PortfolioBracketResponse }) {
  const chartData = buildPortfolioPlayoffComparison(finalizedData, intradayData)
  const biggestMove = chartData.reduce<typeof chartData[number] | null>((best, item) => {
    if (item.seedDelta === null) return best
    if (!best || Math.abs(item.seedDelta) > Math.abs(best.seedDelta ?? 0)) return item
    return best
  }, null)

  return (
    <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_18rem]">
      <div className="rounded-sm border border-white/10 bg-slate-950 p-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-base/6 font-black text-white">Mode Comparison</h3>
            <p className="text-xs/5 text-slate-500">Scores compare portfolio seeds present in either mode; lower seed is stronger.</p>
          </div>
          <p className="font-mono text-xs/5 text-slate-400">{chartData.length} compared portfolios</p>
        </div>
        <div className="mt-3 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.slice(0, 12)} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.16)" vertical={false} />
              <XAxis dataKey="name" stroke="rgb(148 163 184)" tick={{ fontSize: 10 }} angle={-18} textAnchor="end" interval={0} height={58} />
              <YAxis stroke="rgb(148 163 184)" tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: 'rgb(15 23 42)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }} labelStyle={{ color: 'rgb(165 243 252)' }} />
              <Bar dataKey="finalizedSeed" name="Finalized Seed" fill="rgb(103 232 249)" radius={[2, 2, 0, 0]} />
              <Bar dataKey="intradaySeed" name="Intraday Seed" fill="rgb(196 181 253)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid gap-2">
        <LogMetric label="Same Champion" value={finalizedData.champion && intradayData.champion && finalizedData.champion.scenarioId === intradayData.champion.scenarioId ? 'yes' : 'no'} />
        <LogMetric label="Finalized Records" value={`${finalizedData.sourceSurvivorCount}`} />
        <LogMetric label="Intraday Records" value={`${intradayData.sourceSurvivorCount}`} />
        <LogMetric label="Biggest Seed Move" value={biggestMove ? `${biggestMove.name} ${biggestMove.seedDelta! > 0 ? '+' : ''}${biggestMove.seedDelta}` : '—'} />
      </div>
    </div>
  )
}

function PortfolioBracketPanel({ title, accent, data, isLoading }: { title: string; accent: 'cyan' | 'violet'; data: PortfolioBracketResponse; isLoading: boolean }) {
  const headerClass = accent === 'cyan' ? 'border-cyan-300/30 bg-cyan-300 text-slate-950' : 'border-violet-300/30 bg-violet-300 text-slate-950'

  return (
    <section className="rounded-sm border border-white/10 bg-slate-950 p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg/6 font-black text-white">{title} Bracket</h3>
          <p className="mt-1 text-xs/5 text-slate-500">{data.mode} / {data.source} / {data.rankScope}{data.asOf ? ` / ${formatTerminalTime(data.asOf)}` : ''}</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-xs/5 sm:min-w-80">
          <LogMetric label="Champion" value={data.champion ? `#${data.champion.seed} ${data.champion.scenarioName}` : isLoading ? 'Loading' : '—'} />
          <LogMetric label="Entrants" value={`${data.participantCount}`} />
          <LogMetric label={data.mode === 'intraday' ? 'Ranked Rows' : 'Survivors'} value={`${data.sourceSurvivorCount}`} />
          <LogMetric label="Updated" value={formatTerminalTime(data.updatedAt)} />
        </div>
      </div>

      {data.participants.length < 2 ? (
        <div className="mt-4 rounded-sm border border-white/10 bg-slate-900/70 px-4 py-8 text-center text-sm/6 text-slate-300">{isLoading ? 'Loading portfolio playoff bracket...' : 'Need at least two portfolios in the selected date range to build a bracket.'}</div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-sm border border-white/10 bg-slate-900/70 p-3">
          <div className="grid min-w-[54rem] gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, data.rounds.length)}, minmax(14rem, 1fr))` }}>
            {data.rounds.map((round) => (
              <div key={round.round} className="grid content-start gap-3">
                <div className={`rounded-sm border px-3 py-2 ${headerClass}`}>
                  <p className="text-xs font-black uppercase tracking-[0.18em]">{round.name}</p>
                  <p className="text-xs font-bold">{round.matches.length} matchup{round.matches.length === 1 ? '' : 's'}</p>
                </div>
                {round.matches.map((match) => (
                  <div key={match.id} className="rounded-sm border border-white/10 bg-slate-950 p-2">
                    <p className="mb-2 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Match {match.matchNumber}{match.isBye ? ' / bye' : ''}</p>
                    <BracketSide participant={match.left} score={match.leftScore} winnerId={match.winner?.scenarioId ?? null} />
                    <div className="px-2 py-1 text-center text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">vs</div>
                    <BracketSide participant={match.right} score={match.rightScore} winnerId={match.winner?.scenarioId ?? null} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_0.75fr]">
        <div className="rounded-sm border border-white/10 bg-slate-900/70 p-3">
          <h4 className="text-base/6 font-black text-white">Seed Table</h4>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[54rem] w-full border-collapse text-left text-sm/6">
              <thead className="bg-white/5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                <tr><th className="px-3 py-2">Seed</th><th className="px-3 py-2">Portfolio</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Appearances</th><th className="px-3 py-2">Avg Rank</th><th className="px-3 py-2">Total Score</th><th className="px-3 py-2">Avg Excess</th><th className="px-3 py-2">Avg MDD</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-slate-200">
                {data.participants.map((participant) => (
                  <tr key={participant.scenarioId} className="hover:bg-white/5">
                    <td className="px-3 py-2 font-mono text-cyan-200">#{participant.seed}</td>
                    <td className="px-3 py-2 font-black text-white">{participant.scenarioName}</td>
                    <td className="px-3 py-2"><SourceBadge source={participant.source} /></td>
                    <td className="px-3 py-2 font-mono">{participant.appearanceCount}</td>
                    <td className="px-3 py-2 font-mono">{participant.averageRank?.toFixed(1) ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-cyan-100">{participant.totalSurvivorScore.toFixed(1)}</td>
                    <td className={`px-3 py-2 font-mono ${getChangeClass(participant.averageRealizedExcessReturn)}`}>{formatNullablePct(participant.averageRealizedExcessReturn)}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">{formatNullablePct(participant.averageMaxDrawdown)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-sm border border-white/10 bg-slate-900/70 p-3">
          <h4 className="text-base/6 font-black text-white">Bracket Notes</h4>
          <div className="mt-3 grid gap-2 text-sm/6 text-slate-300">
            {data.assumptions.map((assumption) => <p key={assumption} className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2">{assumption}</p>)}
          </div>
        </div>
      </div>
    </section>
  )
}

function buildPortfolioPlayoffComparison(finalizedData: PortfolioBracketResponse, intradayData: PortfolioBracketResponse) {
  const participants = new Map<number, { name: string; finalizedSeed: number | null; intradaySeed: number | null }>()
  finalizedData.participants.forEach((participant) => participants.set(participant.scenarioId, { name: participant.scenarioName, finalizedSeed: participant.seed, intradaySeed: null }))
  intradayData.participants.forEach((participant) => {
    const existing = participants.get(participant.scenarioId)
    if (existing) existing.intradaySeed = participant.seed
    else participants.set(participant.scenarioId, { name: participant.scenarioName, finalizedSeed: null, intradaySeed: participant.seed })
  })

  return Array.from(participants.values())
    .map((item) => ({
      name: item.name,
      finalizedSeed: item.finalizedSeed ?? 0,
      intradaySeed: item.intradaySeed ?? 0,
      seedDelta: item.finalizedSeed !== null && item.intradaySeed !== null ? item.intradaySeed - item.finalizedSeed : null,
    }))
    .sort((a, b) => (a.finalizedSeed || a.intradaySeed) - (b.finalizedSeed || b.intradaySeed))
}

function BracketSide({ participant, score, winnerId }: { participant: PortfolioBracketParticipant | null; score: number | null; winnerId: number | null }) {
  const isWinner = Boolean(participant && participant.scenarioId === winnerId)
  return (
    <div className={`rounded-sm border px-3 py-2 ${participant === null ? 'border-white/5 bg-slate-950 text-slate-600' : isWinner ? 'border-emerald-300/50 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-slate-950 text-slate-200'}`}>
      {participant ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm/5 font-black text-white">#{participant.seed} {participant.scenarioName}</p>
              <div className="mt-1"><SourceBadge source={participant.source} /></div>
            </div>
            {isWinner && <span className="rounded-sm bg-emerald-300 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-950">Advance</span>}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs/5">
            <p className="rounded-sm bg-white/5 px-2 py-1 font-mono">Score {score?.toFixed(1) ?? '—'}</p>
            <p className="rounded-sm bg-white/5 px-2 py-1 font-mono">Avg {participant.averageSurvivorScore.toFixed(1)}</p>
            <p className="rounded-sm bg-white/5 px-2 py-1 font-mono">Runs {participant.intradaySampleCount ?? participant.activeDates.length}</p>
            <p className={`rounded-sm bg-white/5 px-2 py-1 font-mono ${getChangeClass(participant.averageRealizedExcessReturn)}`}>Excess {formatNullablePct(participant.averageRealizedExcessReturn)}</p>
          </div>
        </>
      ) : <p className="py-5 text-center text-xs font-black uppercase tracking-[0.18em]">Bye</p>}
    </div>
  )
}

function SourceBadge({ source }: { source?: 'manual' | 'optimized' }) {
  const label = source ?? 'unknown'
  const classes = source === 'optimized'
    ? 'border-violet-300/40 bg-violet-300/10 text-violet-200'
    : source === 'manual'
      ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200'
      : 'border-white/10 bg-white/5 text-slate-400'
  return <span className={`inline-flex rounded-sm border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${classes}`}>{label}</span>
}

function DecisionMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-sm bg-white/5 px-2 py-1"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="font-mono text-sm/5 text-slate-100">{value}</p></div>
}

function DecisionActionDonut({ data }: { data: PortfolioDecisionResponse }) {
  const counts = ['add', 'hold', 'cap', 'trim', 'avoid'].map((action) => ({ action, count: data.positionDecisions.filter((decision) => decision.action === action).length }))
  const total = counts.reduce((sum, item) => sum + item.count, 0) || 1
  let offset = 0
  return (
    <div className="rounded-sm border border-white/10 bg-slate-950 p-3">
      <h3 className="text-base/6 font-black text-white">Position Action Mix</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_1fr] sm:items-center">
        <svg viewBox="0 0 120 120" role="img" aria-label="Position action mix" className="h-44 w-44">
          {counts.map((item) => {
            const dash = (item.count / total) * 100
            const circle = <circle key={item.action} cx="60" cy="60" r="42" fill="none" stroke={getActionStroke(item.action)} strokeWidth="18" strokeDasharray={`${dash} ${100 - dash}`} strokeDashoffset={-offset} pathLength="100" transform="rotate(-90 60 60)" />
            offset += dash
            return circle
          })}
          <circle cx="60" cy="60" r="28" fill="rgb(15 23 42)" />
          <text x="60" y="57" textAnchor="middle" className="fill-white text-lg font-black">{data.positionDecisions.length}</text>
          <text x="60" y="73" textAnchor="middle" className="fill-slate-400 text-[10px] font-bold uppercase">positions</text>
        </svg>
        <div className="grid gap-1.5">
          {counts.map((item) => <p key={item.action} className="flex items-center justify-between rounded-sm bg-white/5 px-2 py-1 text-sm/5"><span className="font-bold text-slate-200">{item.action}</span><span className="font-mono text-cyan-200">{item.count}</span></p>)}
        </div>
      </div>
    </div>
  )
}

const formatPct = (value: number) => `${(value * 100).toFixed(2)}%`

const formatCurrency = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`

const formatMoney = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

const formatNullablePct = (value: number | null) => value === null ? '—' : formatPct(value)

const formatNullableNumber = (value: number | null, digits = 2) => value === null ? '—' : value.toFixed(digits)

const getChangeClass = (value: number | null) => value === null ? 'text-slate-400' : value >= 0 ? 'text-emerald-300' : 'text-rose-300'

const getDecisionActionClass = (action: string) => `rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
  action === 'increase' ? 'bg-emerald-300 text-slate-950'
    : action === 'hold' ? 'border border-cyan-300/40 text-cyan-200'
      : action === 'trim' ? 'bg-amber-300 text-slate-950'
        : action === 'avoid' ? 'bg-rose-300 text-slate-950'
          : 'border border-white/10 text-slate-300'
}`

const getPositionActionClass = (action: string) => `rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
  action === 'add' ? 'bg-emerald-300 text-slate-950'
    : action === 'hold' ? 'border border-cyan-300/40 text-cyan-200'
      : action === 'cap' ? 'bg-amber-300 text-slate-950'
        : action === 'trim' ? 'bg-orange-300 text-slate-950'
          : 'bg-rose-300 text-slate-950'
}`

const getFlagClass = (severity: string) => `rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
  severity === 'high' ? 'bg-rose-300 text-slate-950'
    : severity === 'medium' ? 'bg-amber-300 text-slate-950'
      : 'border border-white/10 text-slate-300'
}`

const getThemeClass = (stance: string) => `rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
  stance === 'supportive' ? 'bg-emerald-300 text-slate-950'
    : stance === 'headwind' ? 'bg-rose-300 text-slate-950'
      : 'border border-white/10 text-slate-300'
}`

const getActionStroke = (action: string) => ({ add: '#6ee7b7', hold: '#67e8f9', cap: '#fcd34d', trim: '#fdba74', avoid: '#fda4af' })[action as 'add' | 'hold' | 'cap' | 'trim' | 'avoid'] ?? '#94a3b8'

const hashLabel = (value: string) => value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)

const heatColor = (value: number | null) => {
  if (value === null) return 'rgb(100 116 139)'
  const clamped = Math.max(-1, Math.min(1, value))
  if (clamped >= 0) {
    const lightness = 80 - clamped * 35
    return `hsl(158 76% ${lightness}%)`
  }
  const lightness = 78 + clamped * 28
  return `hsl(2 80% ${lightness}%)`
}

const getPortfolioColor = (scenarioId: number) => `hsl(${Math.round((scenarioId * 137.508) % 360)} 88% 66%)`

function PortfolioComparisonLineChart({ data, scenarioNameById }: { data: PortfolioComparisonResponse; scenarioNameById: Map<number, string> }) {
  const scenarioSeries = data.scenarios.map((scenario) => ({
    id: scenario.scenarioId,
    name: scenarioNameById.get(scenario.scenarioId) ?? scenario.name,
    points: scenario.chartSeries,
  }))
  const dateSet = new Set<string>()
  scenarioSeries.forEach((series) => series.points.forEach((point) => dateSet.add(point.date)))
  const dates = [...dateSet].sort((left, right) => left.localeCompare(right))
  const benchmarkByDate = new Map<string, number>()
  scenarioSeries.forEach((series) => {
    series.points.forEach((point) => {
      if (!benchmarkByDate.has(point.date)) benchmarkByDate.set(point.date, point.benchmarkReturn)
    })
  })
  const benchmarkValues = dates.map((date) => benchmarkByDate.get(date) ?? null)
  const alignedSeries = scenarioSeries.map((series) => {
    const byDate = new Map(series.points.map((point) => [point.date, point.portfolioReturn]))
    return {
      ...series,
      values: dates.map((date) => byDate.get(date) ?? null),
    }
  })
  const numericValues = [
    ...alignedSeries.flatMap((series) => series.values),
    ...benchmarkValues,
    0,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const hasChartData = dates.length > 1 && numericValues.length > 1 && alignedSeries.some((series) => series.values.some((value) => value !== null))
  const minValue = Math.min(...numericValues)
  const maxValue = Math.max(...numericValues)
  const range = maxValue - minValue || 0.01
  const width = 720
  const height = 280
  const padding = { top: 24, right: 24, bottom: 38, left: 58 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const xFor = (index: number) => padding.left + (dates.length === 1 ? plotWidth / 2 : (index / (dates.length - 1)) * plotWidth)
  const yFor = (value: number) => padding.top + ((maxValue - value) / range) * plotHeight
  const zeroY = yFor(0)
  const ticks = [maxValue, minValue + range / 2, minValue]
  const pointPath = (values: Array<number | null>) => {
    let started = false
    let path = ''
    values.forEach((value, index) => {
      if (value === null) {
        started = false
        return
      }
      path += `${started ? ' L' : 'M'} ${xFor(index)} ${yFor(value)}`
      started = true
    })
    return path.trim()
  }
  const xTickIndexes = dates.length <= 6
    ? dates.map((_, index) => index)
    : Array.from({ length: 6 }, (_, tick) => Math.round((tick / 5) * (dates.length - 1)))

  return (
    <div className="mt-3 rounded-sm border border-white/10 bg-slate-900 p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h4 className="text-base/6 font-black text-white">Portfolio Return Comparison</h4>
          <p className="text-xs/5 text-slate-400">Each line shows realized cumulative return by date; benchmark is dashed.</p>
        </div>
        <span className="font-mono text-xs text-slate-400">As of {formatArchiveTime(data.asOf)}</span>
      </div>
      {hasChartData ? (
        <div className="mt-3 overflow-x-auto">
          <svg className="min-w-[42rem] w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Portfolio scenario return line chart">
            <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="rgba(255,255,255,0.03)" />
            {ticks.map((tick) => (
              <g key={tick.toFixed(6)}>
                <line x1={padding.left} x2={width - padding.right} y1={yFor(tick)} y2={yFor(tick)} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 5" />
                <text x={padding.left - 10} y={yFor(tick) + 4} textAnchor="end" className="fill-slate-400 font-mono text-[10px]">{formatPct(tick)}</text>
              </g>
            ))}
            {minValue < 0 && maxValue > 0 && <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.32)" />}
            {xTickIndexes.map((index) => (
              <g key={index}>
                <line x1={xFor(index)} x2={xFor(index)} y1={padding.top} y2={height - padding.bottom} stroke="rgba(255,255,255,0.08)" />
                <text x={xFor(index)} y={height - 14} textAnchor="middle" className="fill-slate-300 font-mono text-[11px]">{dates[index]}</text>
              </g>
            ))}
            {benchmarkValues.some((value) => value !== null) && (
              <path d={pointPath(benchmarkValues)} fill="none" stroke="rgba(203,213,225,0.85)" strokeWidth="2" strokeDasharray="7 5" />
            )}
            {alignedSeries.map((series) => {
              const color = getPortfolioColor(series.id)
              return (
                <g key={series.id}>
                  <path d={pointPath(series.values)} fill="none" stroke={color} strokeWidth="2.5" />
                  {series.values.map((value, valueIndex) => value === null ? null : <circle key={valueIndex} cx={xFor(valueIndex)} cy={yFor(value)} r="3.5" fill={color} />)}
                </g>
              )
            })}
          </svg>
          <div className="mt-2 flex flex-wrap gap-2 text-xs/5 text-slate-300">
            {scenarioSeries.map((series) => (
              <span key={series.id} className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 px-2 py-1">
                <span className="size-2 rounded-full" style={{ backgroundColor: getPortfolioColor(series.id) }} />
                {series.name}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 px-2 py-1">
              <span className="h-px w-4 border-t border-dashed border-slate-300" />
              {data.benchmarkSymbol}
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-sm border border-white/10 bg-slate-950 px-3 py-4 text-sm/6 text-slate-300">No comparison chart is available yet. Portfolio scenarios need at least one comparable return window.</p>
      )}
    </div>
  )
}
