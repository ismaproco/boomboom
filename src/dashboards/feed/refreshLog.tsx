import type { RefreshLogResponse } from '../../types'
import { formatTerminalTime } from '../../formatters'
import { getLogStatusClass, LogMetric, SectionHeader } from '../../presentation'

export function RefreshLogDashboard({ log, isLoading, onPageChange }: { log: RefreshLogResponse; isLoading: boolean; onPageChange: (page: number) => void }) {
  const entries = log.entries
  const latestEntry = entries[0]
  const totalPages = Math.max(1, Math.ceil(log.total / log.pageSize))
  const firstRecord = log.total === 0 ? 0 : (log.page - 1) * log.pageSize + 1
  const lastRecord = Math.min(log.total, log.page * log.pageSize)
  const maxArticles = Math.max(1, ...entries.map((entry) => entry.newsCount))

  return (
    <section className="rounded-sm border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/30 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionHeader eyebrow="Backend Gathering" title="Refresh Summary" />
          <p className="mt-2 max-w-2xl text-sm/6 text-slate-300">
            This log tracks the backend job that fetches market quotes and RSS news, including how many articles were downloaded during each refresh cycle.
          </p>
        </div>
        <div className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-sm/6 text-slate-200">
          <p><span className="font-black uppercase tracking-[0.16em] text-cyan-300">Updated</span> {formatTerminalTime(log.updatedAt)}</p>
          <p><span className="font-black uppercase tracking-[0.16em] text-cyan-300">Worker</span> {log.isRefreshing ? 'Refreshing now' : 'Idle'}</p>
          <p><span className="font-black uppercase tracking-[0.16em] text-cyan-300">Rows</span> {firstRecord}-{lastRecord} of {log.total}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <LogMetric label="Refreshes" value={log.total.toString()} />
        <LogMetric label="Articles" value={log.summary.totalArticles.toString()} />
        <LogMetric label="Quotes" value={log.summary.totalMarketQuotes.toString()} />
        <LogMetric label="Success" value={log.summary.successfulRuns.toString()} />
        <LogMetric label="Avg Time" value={`${log.summary.averageDurationMs}ms`} />
      </div>

      {latestEntry && (
        <article className="mt-3 rounded-sm border border-cyan-300/20 bg-slate-950 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Latest Run</p>
              <h3 className="mt-1 text-xl/7 font-black text-white">{latestEntry.message}</h3>
            </div>
            <span className={`rounded-sm px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] ${getLogStatusClass(latestEntry.status)}`}>{latestEntry.status}</span>
          </div>
          <div className="mt-3 grid gap-2 text-sm/6 text-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            <p>Started {formatTerminalTime(latestEntry.startedAt)}</p>
            <p>Finished {formatTerminalTime(latestEntry.finishedAt)}</p>
            <p>{latestEntry.newsCount} articles</p>
            <p>{latestEntry.durationMs}ms</p>
          </div>
        </article>
      )}

      <div className="mt-3 rounded-sm border border-white/10 bg-slate-950 p-3">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg/7 font-black text-white">Downloaded Articles Chart</h3>
          <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Page {log.page} / {totalPages}</span>
        </div>
        <div className="mt-3 grid gap-2">
          {entries.length > 0 ? entries.slice(0, 12).map((entry) => (
            <div key={entry.id} className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_4rem] sm:items-center">
              <span className="font-mono text-xs/5 text-slate-300">{formatTerminalTime(entry.startedAt)}</span>
              <div className="h-4 overflow-hidden rounded-sm bg-white/10">
                <div className="h-full rounded-sm bg-cyan-300" style={{ width: `${Math.max(6, (entry.newsCount / maxArticles) * 100)}%` }} />
              </div>
              <span className="font-mono text-sm/5 font-black text-cyan-200">{entry.newsCount}</span>
            </div>
          )) : <p className="text-sm/6 text-slate-300">No refresh runs have been recorded yet.</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm/6 text-slate-300">Showing refresh log rows {firstRecord}-{lastRecord} of {log.total}{isLoading ? ' / loading' : ''}</p>
        <div className="flex gap-2">
          <button className="rounded-sm border border-white/10 px-3 py-1.5 text-sm/5 font-black uppercase tracking-[0.16em] text-slate-200 disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:border-cyan-300/70 enabled:hover:text-cyan-100" type="button" disabled={log.page <= 1 || isLoading} onClick={() => onPageChange(log.page - 1)}>
            Prev
          </button>
          <button className="rounded-sm border border-white/10 px-3 py-1.5 text-sm/5 font-black uppercase tracking-[0.16em] text-slate-200 disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:border-cyan-300/70 enabled:hover:text-cyan-100" type="button" disabled={log.page >= totalPages || isLoading} onClick={() => onPageChange(log.page + 1)}>
            Next
          </button>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-sm border border-white/10 bg-slate-950">
        <div className="grid grid-cols-[5rem_1fr_5rem_5rem] gap-3 border-b border-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-300 sm:grid-cols-[6rem_7rem_5rem_5rem_1fr]">
          <span>Status</span>
          <span className="hidden sm:block">Started</span>
          <span>News</span>
          <span>Ms</span>
          <span>Message</span>
        </div>
        <div className="divide-y divide-white/10">
          {entries.length > 0 ? entries.map((entry) => (
            <article key={entry.id} className="grid grid-cols-[5rem_1fr_5rem_5rem] gap-3 px-3 py-2 text-sm/6 text-slate-200 sm:grid-cols-[6rem_7rem_5rem_5rem_1fr]">
              <span className={`self-start rounded-sm px-2 py-1 text-xs font-black uppercase ${getLogStatusClass(entry.status)}`}>{entry.status}</span>
              <span className="hidden font-mono text-slate-300 sm:block">{formatTerminalTime(entry.startedAt)}</span>
              <span className="font-mono text-cyan-200">{entry.newsCount}</span>
              <span className="font-mono text-slate-300">{entry.durationMs}</span>
              <span>{entry.message}</span>
            </article>
          )) : <p className="px-4 py-5 text-sm/6 text-slate-300">No backend log entries are available yet.</p>}
        </div>
      </div>

      {log.summary.failedRuns > 0 && <p className="mt-4 rounded-sm border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm/6 text-red-100">{log.summary.failedRuns} failed refresh run{log.summary.failedRuns === 1 ? '' : 's'} recorded in the full backend history.</p>}
    </section>
  )
}
