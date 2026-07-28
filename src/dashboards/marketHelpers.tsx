import type { MarketSignalItem, PopularItem, PopularSnapshotSummary } from '../types'
import { getRankMoveClass } from '../storyRules'
import { formatPct } from './formatters'

export { formatPct, formatMoney, formatNullablePct, getChangeClass } from './formatters'

export function WatchlistSummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <article className="rounded-sm border border-white/10 bg-slate-950 p-3">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={`mt-1 font-mono text-3xl/8 font-black ${tone}`}>{value}</p>
    </article>
  )
}

export function WatchlistScoreButton({ label, score, tone }: { label: string; score: number; tone: 'emerald' | 'rose' }) {
  const classes = tone === 'emerald'
    ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200'
    : 'border-rose-300/40 bg-rose-300/10 text-rose-200'

  return <span className={`inline-flex min-w-24 items-center justify-between gap-2 rounded-sm border px-2.5 py-1.5 font-mono text-xs/5 font-black ${classes}`}><span>{label}</span><span>{score}</span></span>
}

export function TickerWeekSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="font-mono text-xs/5 text-slate-500">warming</span>
  const width = 104
  const height = 32
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = Math.max(0.0001, max - min)
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width
    const y = height - ((value - min) / spread) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const last = values.at(-1) ?? 0
  const stroke = last >= 0 ? 'rgb(110 231 183)' : 'rgb(253 164 175)'

  return (
    <svg className="h-8 w-28 overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Last week change ${formatPct(last)}`}>
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(148,163,184,0.25)" strokeWidth="1" />
      <polyline fill="none" points={points} stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
      <circle cx={width} cy={Number(points.split(' ').at(-1)?.split(',')[1] ?? height / 2)} r="2.5" fill={stroke} />
    </svg>
  )
}

export function PopularMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">{label}</p>
      <p className="mt-1 font-mono text-lg/6 font-black text-cyan-100">{value}</p>
    </div>
  )
}

export function PopularSnapshotSignal({ label, item, fallback }: { label: string; item: PopularSnapshotSummary['topCluster']; fallback: string }) {
  return (
    <article className="rounded-sm border border-white/10 bg-white/5 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
        {item && <span className={getRankMoveClass(item)}>{formatRankMove(item)}</span>}
      </div>
      {item ? (
        <>
          <p className="mt-1 line-clamp-2 text-sm/5 font-bold text-white">#{item.rank} {item.headline}</p>
          <p className="mt-1 font-mono text-xs/5 text-slate-400">{item.section} / {item.sourceCount} sources / {item.articleCount} articles</p>
        </>
      ) : (
        <p className="mt-1 text-sm/5 text-slate-400">{fallback}</p>
      )}
    </article>
  )
}

export const formatRankMove = (item: Pick<PopularItem, 'previousRank' | 'rankDelta'>) => {
  if (item.previousRank === null) return 'New'
  if (!item.rankDelta) return 'Same'
  return item.rankDelta > 0 ? `+${item.rankDelta}` : String(item.rankDelta)
}

export const formatSignedCount = (value: number | null) => {
  if (value === null) return 'n/a'
  if (value > 0) return `+${value}`
  return String(value)
}

export const getDeltaTextClass = (value: number | null) => value === null ? 'text-slate-500' : value > 0 ? 'text-emerald-300' : value < 0 ? 'text-rose-300' : 'text-slate-400'

export const getDeltaChipClass = (value: number | null) => `rounded-sm px-2 py-0.5 ${value === null ? 'bg-white/5 text-slate-400' : value > 0 ? 'bg-emerald-300/10 text-emerald-200' : value < 0 ? 'bg-rose-300/10 text-rose-200' : 'bg-white/5 text-slate-300'}`

export const formatSignalCategory = (category: MarketSignalItem['category']) => category.split('-').map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`).join(' ')

export const getSignalCategoryClass = (category: MarketSignalItem['category']) => {
  const base = 'rounded-sm px-2 py-1 text-xs font-black uppercase tracking-[0.14em]'
  if (category === 'high-conviction') return `${base} bg-emerald-300/15 text-emerald-200`
  if (category === 'news-breakout') return `${base} bg-cyan-300/15 text-cyan-200`
  if (category === 'risk-watch') return `${base} bg-rose-300/15 text-rose-200`
  return `${base} bg-violet-300/15 text-violet-200`
}
