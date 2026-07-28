import { useEffect, useState } from 'react'
import { newsApi } from '../../api'
import type { CommoditiesResponse, CommodityHistoryResponse } from '../../types'
import { formatTerminalTime } from '../../formatters'
import { LogMetric, SectionHeader } from '../../presentation'
import { formatMoney, formatNullablePct, getChangeClass } from '../formatters'
import { TickerWeekSparkline } from '../marketHelpers'

export function CommoditiesDashboard({ data, isLoading }: { data: CommoditiesResponse; isLoading: boolean }) {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(data.items[0]?.symbol ?? 'GLD')
  const [history, setHistory] = useState<CommodityHistoryResponse>({ updatedAt: new Date().toISOString(), symbol: selectedSymbol, days: 180, points: [] })
  const [historyError, setHistoryError] = useState<string | null>(null)

  useEffect(() => {
    const leader = [...data.items].sort((left, right) => (right.change1Day ?? -Infinity) - (left.change1Day ?? -Infinity))[0]
    if (leader?.symbol) setSelectedSymbol((current) => (current ? current : leader.symbol))
  }, [data.items])

  useEffect(() => {
    const controller = new AbortController()
    newsApi.getCommodityHistory(selectedSymbol, 180, controller.signal)
      .then((response) => {
        setHistory(response)
        setHistoryError(null)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setHistoryError(error instanceof Error ? error.message : 'Unable to load commodity history')
      })
    return () => controller.abort()
  }, [selectedSymbol])

  const positive = data.items.filter((item) => (item.change1Day ?? 0) > 0).length
  const negative = data.items.filter((item) => (item.change1Day ?? 0) < 0).length
  const leader = [...data.items].sort((left, right) => (right.change1Day ?? -Infinity) - (left.change1Day ?? -Infinity))[0]
  const selectedNews = data.relatedNews.find((entry) => entry.symbol === selectedSymbol)?.articles ?? []

  return (
    <section className="rounded-sm border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/30 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionHeader eyebrow="Commodities" title="Proxy Market Board" />
          <p className="mt-2 max-w-3xl text-sm/6 text-slate-300">ETF and equity proxies for commodities; no futures contracts are used.</p>
        </div>
        <div className="grid gap-2 text-xs/5 sm:grid-cols-2 lg:min-w-[24rem]">
          <LogMetric label="Updated" value={formatTerminalTime(data.updatedAt)} />
          <LogMetric label="Source" value={isLoading ? 'Loading' : data.source.toUpperCase()} />
          <LogMetric label="Advancers" value={positive.toString()} valueClassName="text-emerald-300" />
          <LogMetric label="Top 1D" value={leader ? `${leader.symbol} ${formatNullablePct(leader.change1Day)}` : '—'} />
        </div>
      </div>
      <div className="mt-3 overflow-x-auto rounded-sm border border-white/10 bg-slate-950">
        <table className="min-w-[72rem] w-full border-collapse text-left text-sm/6">
          <thead className="bg-white/5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
            <tr>
              <th className="px-3 py-2">Proxy</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Underlying</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">1D</th>
              <th className="px-3 py-2">1W</th>
              <th className="px-3 py-2">1M</th>
              <th className="px-3 py-2">Last Week</th>
              <th className="px-3 py-2">Vol 30D</th>
              <th className="px-3 py-2">Signal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-slate-200">
            {data.items.length > 0 ? data.items.map((item) => (
              <tr key={item.symbol} className="align-middle hover:bg-white/5">
                <td className="px-3 py-2"><span className="font-black text-white">{item.symbol}</span><span className="ml-2 text-xs text-slate-400">{item.proxyType.toUpperCase()}</span></td>
                <td className="px-3 py-2">{item.category}</td>
                <td className="px-3 py-2 text-slate-300">{item.underlying}</td>
                <td className="px-3 py-2 font-mono font-black text-cyan-100">{item.price !== null ? formatMoney(item.price) : '—'}</td>
                <td className={`px-3 py-2 font-mono font-black ${getChangeClass(item.change1Day)}`}>{formatNullablePct(item.change1Day)}</td>
                <td className={`px-3 py-2 font-mono font-black ${getChangeClass(item.change1Week)}`}>{formatNullablePct(item.change1Week)}</td>
                <td className={`px-3 py-2 font-mono font-black ${getChangeClass(item.change1Month)}`}>{formatNullablePct(item.change1Month)}</td>
                <td className="px-3 py-2"><TickerWeekSparkline values={item.weekChangeSeries} /></td>
                <td className="px-3 py-2 font-mono">{formatNullablePct(item.volatility30d)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-sm border px-2 py-1 text-xs font-black uppercase tracking-[0.14em] ${item.signal === 'bullish' ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200' : item.signal === 'bearish' ? 'border-rose-300/40 bg-rose-300/10 text-rose-200' : 'border-white/10 bg-white/5 text-slate-200'}`}>{item.signal}</span>
                    <span className="text-[11px] text-slate-400">{item.riskLabel}</span>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td className="px-4 py-6 text-slate-300" colSpan={10}>{isLoading ? 'Loading commodities...' : 'No commodities snapshot is available yet.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <article className="rounded-sm border border-white/10 bg-slate-950 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">History</p>
            <select className="rounded-sm border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-200" value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>
              {data.items.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol} - {item.underlying}</option>)}
            </select>
          </div>
          {historyError ? <p className="mt-2 text-xs/5 text-rose-300">{historyError}</p> : <CommodityHistoryChart history={history} />}
        </article>
        <article className="rounded-sm border border-white/10 bg-slate-950 p-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">Recent Snapshots</p>
          <div className="mt-2 max-h-56 overflow-auto rounded-sm border border-white/10">
            <table className="w-full text-left text-xs/5">
              <thead className="bg-white/5 text-slate-400"><tr><th className="px-2 py-1">Time</th><th className="px-2 py-1">Status</th><th className="px-2 py-1">B/N/Br</th></tr></thead>
              <tbody className="divide-y divide-white/10 text-slate-200">
                {data.snapshots.slice(0, 12).map((snapshot) => <tr key={snapshot.id}><td className="px-2 py-1 font-mono">{formatTerminalTime(snapshot.createdAt)}</td><td className="px-2 py-1">{snapshot.status}</td><td className="px-2 py-1 font-mono">{snapshot.bullishCount}/{snapshot.neutralCount}/{snapshot.bearishCount}</td></tr>)}
              </tbody>
            </table>
          </div>
        </article>
      </div>
      <article className="mt-3 rounded-sm border border-white/10 bg-slate-950 p-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">Related News ({selectedSymbol})</p>
        <div className="mt-2 grid gap-2">
          {selectedNews.length > 0 ? selectedNews.map((article) => (
            <a key={article.id} href={article.url} target="_blank" rel="noreferrer" className="rounded-sm border border-white/10 bg-white/5 p-2 text-sm/6 text-slate-200 hover:border-cyan-300/50">
              <p className="font-bold text-white">{article.headline}</p>
              <p className="mt-1 text-xs/5 text-slate-400">{article.source} / {article.time}</p>
            </a>
          )) : <p className="text-sm/6 text-slate-400">No linked commodity articles in the current snapshot.</p>}
        </div>
      </article>
      <p className="mt-2 text-xs/5 text-slate-500">{negative} decliners. Proxy instruments can diverge from spot commodity prices.</p>
    </section>
  )
}

function CommodityHistoryChart({ history }: { history: CommodityHistoryResponse }) {
  if (history.points.length < 2) return <p className="mt-3 text-sm/6 text-slate-400">Not enough persisted points for a chart yet.</p>
  const base = history.points[0]!.close
  const values = history.points.map((point) => base > 0 ? (point.close / base) - 1 : 0)
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const range = max - min || 0.01
  const width = 620
  const height = 220
  const pad = { top: 14, right: 14, bottom: 24, left: 46 }
  const w = width - pad.left - pad.right
  const h = height - pad.top - pad.bottom
  const x = (index: number) => pad.left + (index / Math.max(1, values.length - 1)) * w
  const y = (value: number) => pad.top + ((max - value) / range) * h
  const path = values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(value)}`).join(' ')
  return (
    <div className="mt-2">
      <svg className="w-full" viewBox={`0 0 ${width} ${height}`}>
        <rect x={pad.left} y={pad.top} width={w} height={h} fill="rgba(255,255,255,0.03)" />
        <path d={path} fill="none" stroke="rgb(103 232 249)" strokeWidth="2" />
        <text x={pad.left} y={height - 8} className="fill-slate-400 font-mono text-[10px]">{history.points[0]!.date}</text>
        <text x={width - pad.right} y={height - 8} textAnchor="end" className="fill-slate-400 font-mono text-[10px]">{history.points.at(-1)!.date}</text>
      </svg>
      <p className="mt-1 text-xs/5 text-slate-400">Cumulative return over {history.days} days from persisted proxy closes.</p>
    </div>
  )
}
