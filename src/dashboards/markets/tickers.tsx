import { useState } from 'react'
import type { TickerWatchlistResponse } from '../../types'
import { formatTerminalTime } from '../../formatters'
import { LogMetric, SectionHeader } from '../../presentation'
import { formatMoney, formatNullablePct, getChangeClass } from '../formatters'
import { TickerWeekSparkline, WatchlistScoreButton, WatchlistSummaryCard } from '../marketHelpers'

export function TickerWatchlistDashboard({ data, isLoading }: { data: TickerWatchlistResponse; isLoading: boolean }) {
  const [tickerSearch, setTickerSearch] = useState('')
  const normalizedSearch = tickerSearch.trim().toLowerCase()
  const filteredItems = normalizedSearch
    ? data.items.filter((item) => `${item.symbol} ${item.name} ${item.sentiment}`.toLowerCase().includes(normalizedSearch))
    : data.items
  const bullish = data.items.filter((item) => item.sentiment === 'Bullish').length
  const bearish = data.items.filter((item) => item.sentiment === 'Bearish').length
  const leader = [...data.items].sort((left, right) => (right.change1Day ?? -Infinity) - (left.change1Day ?? -Infinity))[0]

  return (
    <section className="rounded-sm border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/30 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionHeader eyebrow="Tickers" title="Watchlist" />
          <p className="mt-2 max-w-3xl text-sm/6 text-slate-300">
            eToro-style watchlist view for the configured stock universe. Short and Buy are momentum scores derived from 1-day and 1-week price action, not trade recommendations.
          </p>
        </div>
        <div className="grid gap-2 text-xs/5 sm:grid-cols-2 lg:min-w-[24rem]">
          <LogMetric label="Updated" value={formatTerminalTime(data.updatedAt)} />
          <LogMetric label="Source" value={isLoading ? 'Loading' : data.source.toUpperCase()} />
          <LogMetric label="Bullish" value={bullish.toString()} valueClassName="text-emerald-300" />
          <LogMetric label="Top 1D" value={leader ? `${leader.symbol} ${formatNullablePct(leader.change1Day)}` : '—'} />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <WatchlistSummaryCard label="Buy Bias" value={bullish.toString()} tone="text-emerald-300" />
        <WatchlistSummaryCard label="Short Bias" value={bearish.toString()} tone="text-rose-300" />
        <WatchlistSummaryCard label="Neutral" value={(data.items.length - bullish - bearish).toString()} tone="text-slate-200" />
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-sm border border-white/10 bg-slate-950 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Quick Search</p>
          <p className="mt-1 text-xs/5 text-slate-400">Showing {filteredItems.length} of {data.items.length} tickers.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:min-w-80 sm:flex-row">
          <label className="sr-only" htmlFor="ticker-search">Search tickers</label>
          <input
            id="ticker-search"
            className="min-w-0 rounded-sm border border-white/10 bg-slate-900 px-3 py-2 text-sm/5 text-white outline-hidden transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-3 focus:ring-cyan-300/20 sm:flex-1"
            placeholder="Search symbol, name, sentiment..."
            value={tickerSearch}
            onChange={(event) => setTickerSearch(event.target.value)}
          />
          {tickerSearch && (
            <button className="rounded-sm border border-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-100" type="button" onClick={() => setTickerSearch('')}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-sm border border-white/10 bg-slate-950">
        <table className="min-w-[76rem] w-full border-collapse text-left text-sm/6">
          <thead className="bg-white/5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Change 1 Day</th>
              <th className="px-3 py-2">Change 1 Week</th>
              <th className="px-3 py-2">Last Week</th>
              <th className="px-3 py-2">Short</th>
              <th className="px-3 py-2">Buy</th>
              <th className="px-3 py-2">Sentiment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-slate-200">
            {filteredItems.length > 0 ? filteredItems.map((item) => {
              const dayClass = getChangeClass(item.change1Day)
              const weekClass = getChangeClass(item.change1Week)
              const sentimentClass = item.sentiment === 'Bullish' ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200' : item.sentiment === 'Bearish' ? 'border-rose-300/40 bg-rose-300/10 text-rose-200' : 'border-white/10 bg-white/5 text-slate-200'

              return (
                <tr key={item.symbol} className="align-middle hover:bg-white/5">
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="font-black text-white">{item.name}</span>
                      <span className="font-mono text-xs/5 text-cyan-300">{item.symbol}{item.price !== null ? ` / ${formatMoney(item.price)}` : ''}</span>
                    </div>
                  </td>
                  <td className={`px-3 py-2 font-mono font-black ${dayClass}`}>{formatNullablePct(item.change1Day)}</td>
                  <td className={`px-3 py-2 font-mono font-black ${weekClass}`}>{formatNullablePct(item.change1Week)}</td>
                  <td className="px-3 py-2"><TickerWeekSparkline values={item.weekChangeSeries} /></td>
                  <td className="px-3 py-2"><WatchlistScoreButton label="Short" score={item.shortScore} tone="rose" /></td>
                  <td className="px-3 py-2"><WatchlistScoreButton label="Buy" score={item.buyScore} tone="emerald" /></td>
                  <td className="px-3 py-2"><span className={`rounded-sm border px-2.5 py-1 text-xs font-black uppercase tracking-[0.14em] ${sentimentClass}`}>{item.sentiment}</span></td>
                </tr>
              )
            }) : (
              <tr>
                <td className="px-4 py-6 text-slate-300" colSpan={7}>{isLoading ? 'Loading tickers...' : normalizedSearch ? 'No tickers match your search.' : 'No tickers are available yet.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
