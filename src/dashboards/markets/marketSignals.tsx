import { useState } from 'react'
import type { MarketSignalItem, MarketSignalsResponse } from '../../types'
import { SectionHeader } from '../../presentation'
import { formatSignalCategory, getSignalCategoryClass } from '../marketHelpers'

export function MarketSignalsSummary({ data, isLoading, error }: { data: MarketSignalsResponse; isLoading: boolean; error: string | null }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const leaders = data.items.slice(0, 5)

  return (
    <section className="rounded-sm border border-cyan-300/30 bg-slate-900/90 p-3 shadow-2xl shadow-cyan-950/20 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <SectionHeader eyebrow="Analyst Layer" title={data.summary.title} />
          <p className="mt-2 max-w-4xl text-sm/6 text-slate-300">{data.summary.narrative}</p>
          <p className="mt-1 text-xs/5 font-bold uppercase tracking-[0.16em] text-slate-500">Exploratory signals only, not financial advice.{isLoading ? ' Refreshing...' : ''}</p>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center text-xs font-black uppercase tracking-[0.12em] sm:min-w-96">
          <SignalCount label="Conviction" value={data.summary.highConvictionCount} />
          <SignalCount label="Breakouts" value={data.summary.newsBreakoutCount} />
          <SignalCount label="Risk" value={data.summary.riskWatchCount} />
        </div>
      </div>

      {error && <p className="mt-3 rounded-sm border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm/6 text-red-100">{error}</p>}

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-stretch">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {leaders.length > 0 ? leaders.map((item) => <MarketSignalCard key={item.symbol} item={item} />) : (
            <div className="rounded-sm border border-white/10 bg-slate-950 px-4 py-5 text-sm/6 text-slate-300 sm:col-span-2 xl:col-span-5">No cross-source market signals are available yet.</div>
          )}
        </div>
        <button className="rounded-sm bg-cyan-300 px-4 py-3 text-sm/5 font-black uppercase tracking-[0.16em] text-slate-950 transition hover:bg-cyan-200 lg:w-44" type="button" onClick={() => setIsModalOpen(true)}>
          View Signal Details
        </button>
      </div>

      {isModalOpen && <MarketSignalsModal data={data} onClose={() => setIsModalOpen(false)} />}
    </section>
  )
}

function MarketSignalsModal({ data, onClose }: { data: MarketSignalsResponse; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-8" role="dialog" aria-modal="true" aria-labelledby="market-signals-modal-title">
      <div className="max-h-[90dvh] w-full max-w-6xl overflow-y-auto rounded-sm border border-cyan-300/30 bg-slate-950 p-4 shadow-2xl shadow-cyan-950/40 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Signal Details</p>
            <h3 id="market-signals-modal-title" className="mt-1 text-2xl/8 font-black tracking-tight text-white">System-Ranked Stocks To Watch</h3>
            <p className="mt-2 max-w-3xl text-sm/6 text-slate-300">Scores combine optimized portfolio exposure, decision overlay support, Popular news clusters, ticker momentum, sentiment, freshness, and risk penalties.</p>
          </div>
          <button className="rounded-sm border border-white/10 px-3 py-2 text-sm font-black uppercase tracking-[0.14em] text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-100" type="button" onClick={onClose}>Close</button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-sm border border-white/10 bg-slate-900/80">
          <table className="min-w-[72rem] w-full border-collapse text-left text-sm/6">
            <thead className="bg-white/5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
              <tr>
                <th className="px-3 py-2">Stock</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Rationale</th>
                <th className="px-3 py-2">Breakdown</th>
                <th className="px-3 py-2">Evidence / Risks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-200">
              {data.items.length > 0 ? data.items.map((item) => (
                <tr key={item.symbol} className="align-top hover:bg-white/5">
                  <td className="px-3 py-3">
                    <p className="font-mono text-lg/6 font-black text-white">{item.symbol}</p>
                    <p className="text-xs/5 text-slate-400">{item.name}</p>
                  </td>
                  <td className="px-3 py-3 font-mono text-lg/6 font-black text-cyan-200">{item.score}</td>
                  <td className="px-3 py-3"><span className={getSignalCategoryClass(item.category)}>{formatSignalCategory(item.category)}</span></td>
                  <td className="px-3 py-3 max-w-md text-slate-300">
                    <p>{item.rationale}</p>
                    {item.relatedPopularHeadlines.length > 0 && <p className="mt-2 text-xs/5 text-slate-500">News: {item.relatedPopularHeadlines.slice(0, 2).join(' / ')}</p>}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs/5 text-slate-300">
                    <p>Portfolio {item.metrics.portfolioScore}</p>
                    <p>News {item.metrics.newsScore}</p>
                    <p>Momentum {item.metrics.momentumScore}</p>
                    <p>Sentiment {item.metrics.sentimentScore}</p>
                    <p>Fresh {item.metrics.freshnessScore}</p>
                    <p className={item.metrics.riskPenalty < 0 ? 'text-rose-300' : 'text-slate-500'}>Risk {item.metrics.riskPenalty}</p>
                  </td>
                  <td className="px-3 py-3 min-w-72">
                    <div className="flex flex-wrap gap-1.5">
                      {item.evidence.map((entry) => <span key={entry} className="rounded-sm bg-emerald-300/10 px-2 py-1 text-xs font-bold text-emerald-200">{entry}</span>)}
                      {item.risks.map((entry) => <span key={entry} className="rounded-sm bg-rose-300/10 px-2 py-1 text-xs font-bold text-rose-200">{entry}</span>)}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td className="px-4 py-6 text-slate-300" colSpan={6}>No market signals are available yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SignalCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2">
      <p className="font-mono text-lg/6 text-cyan-100">{value}</p>
      <p className="text-slate-400">{label}</p>
    </div>
  )
}

function MarketSignalCard({ item }: { item: MarketSignalItem }) {
  return (
    <article className="rounded-sm border border-white/10 bg-slate-950 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-lg/6 font-black text-white">{item.symbol}</p>
          <p className="line-clamp-1 text-xs/5 text-slate-400">{item.name}</p>
        </div>
        <span className="font-mono text-lg/6 font-black text-cyan-200">{item.score}</span>
      </div>
      <span className={`${getSignalCategoryClass(item.category)} mt-2 inline-block`}>{formatSignalCategory(item.category)}</span>
      <p className="mt-2 line-clamp-3 text-sm/5 text-slate-300">{item.rationale}</p>
    </article>
  )
}
