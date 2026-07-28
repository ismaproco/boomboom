import { memo, useState } from 'react'
import type { PopularItem, PopularResponse, PopularSnapshotSummary } from '../../types'
import { formatArchiveTime, formatTerminalTime } from '../../formatters'
import { getRankMoveClass } from '../../storyRules'
import { getSectionTone, LogMetric, SectionHeader, StoryLabel } from '../../presentation'
import { formatRankMove, formatSignedCount, getDeltaChipClass, getDeltaTextClass, PopularMetric, PopularSnapshotSignal } from '../marketHelpers'

export function PopularDashboard({ data, snapshots, selectedSnapshotId, isLoading, onSnapshotChange, onLatest }: { data: PopularResponse; snapshots: PopularSnapshotSummary[]; selectedSnapshotId: number | null; isLoading: boolean; onSnapshotChange: (snapshotId: number) => void; onLatest: () => void }) {
  const [isSnapshotMenuOpen, setIsSnapshotMenuOpen] = useState(false)
  const [snapshotSearch, setSnapshotSearch] = useState('')
  const snapshot = data.snapshot
  const topItem = data.items[0]
  const risingCount = data.items.filter((item) => (item.rankDelta ?? 0) > 0).length
  const newCount = data.items.filter((item) => item.previousRank === null).length
  const selectedSummary = snapshots.find((entry) => entry.id === selectedSnapshotId) ?? snapshots[0] ?? null
  const snapshotQuery = snapshotSearch.trim().toLowerCase()
  const filteredSnapshots = snapshotQuery
    ? snapshots.filter((entry) => [
      String(entry.id),
      formatArchiveTime(entry.createdAt),
      entry.topCluster?.headline ?? '',
      entry.topNewCluster?.headline ?? '',
      ...entry.leadingSections.map((section) => section.label),
      ...entry.leadingKeywords.map((keyword) => keyword.label),
    ].join(' ').toLowerCase().includes(snapshotQuery))
    : snapshots

  return (
    <section className="rounded-sm border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/30 sm:p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <SectionHeader eyebrow="Popular" title="Trending 100" />
          <p className="mt-2 max-w-3xl text-sm/6 text-slate-300">
            Ranked article clusters based on source frequency, keyword similarity, source diversity, and freshness. Snapshots are generated every 15 minutes and retained for 30 days.
          </p>
        </div>
        <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            className="min-w-72 rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-left text-sm/5 text-white outline-hidden transition disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:border-cyan-300/70 enabled:focus:border-cyan-300 enabled:focus:ring-3 enabled:focus:ring-cyan-300/20"
            type="button"
            disabled={isLoading || snapshots.length === 0}
            aria-expanded={isSnapshotMenuOpen}
            onClick={() => setIsSnapshotMenuOpen((value) => !value)}
          >
            <span className="block text-xs font-black uppercase tracking-[0.16em] text-cyan-300">Snapshot</span>
            <span className="mt-1 block font-mono">{selectedSummary ? formatArchiveTime(selectedSummary.createdAt) : 'No snapshots'}</span>
            {selectedSummary && <span className="mt-1 block text-xs text-slate-400">{selectedSummary.clusterCount} clusters / {selectedSummary.articleCount} articles / {selectedSummary.newCount} new</span>}
          </button>
          {isSnapshotMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-full min-w-[22rem] rounded-sm border border-white/10 bg-slate-950 p-2 shadow-2xl shadow-black/50 sm:w-[34rem]">
              <label className="sr-only" htmlFor="popular-snapshot-search">Search snapshots</label>
              <input
                id="popular-snapshot-search"
                className="w-full rounded-sm border border-white/10 bg-slate-900 px-3 py-2 text-sm/5 text-white outline-hidden transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-3 focus:ring-cyan-300/20"
                placeholder="Search time, headline, section, keyword..."
                value={snapshotSearch}
                onChange={(event) => setSnapshotSearch(event.target.value)}
              />
              <div className="mt-2 max-h-[28rem] overflow-y-auto pr-1">
                {filteredSnapshots.length > 0 ? filteredSnapshots.slice(0, 80).map((entry, index) => (
                  <button
                    key={entry.id}
                    className={`mt-1 w-full rounded-sm border p-2 text-left transition hover:border-cyan-300/60 hover:bg-cyan-300/10 ${entry.id === selectedSnapshotId ? 'border-cyan-300/60 bg-cyan-300/10' : 'border-white/10 bg-white/5'}`}
                    type="button"
                    onClick={() => {
                      onSnapshotChange(entry.id)
                      setIsSnapshotMenuOpen(false)
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs/5 text-slate-200">#{entry.id} / {formatArchiveTime(entry.createdAt)}</span>
                      <span className="flex flex-wrap gap-1 text-[10px] font-black uppercase tracking-[0.14em]">
                        {index === 0 && !snapshotQuery && <span className="rounded-sm bg-cyan-300 px-2 py-0.5 text-slate-950">Latest</span>}
                        <span className={getDeltaChipClass(entry.articleDelta)}>{formatSignedCount(entry.articleDelta)} articles</span>
                        <span className={getDeltaChipClass(entry.clusterDelta)}>{formatSignedCount(entry.clusterDelta)} clusters</span>
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm/5 font-bold text-white">{entry.topCluster?.headline ?? 'No headline preview'}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">
                      <span className="rounded-sm bg-emerald-300/10 px-2 py-0.5 text-emerald-200">{entry.newCount} new</span>
                      <span className="rounded-sm bg-cyan-300/10 px-2 py-0.5 text-cyan-200">{entry.risingCount} rising</span>
                      <span className="rounded-sm bg-rose-300/10 px-2 py-0.5 text-rose-200">{entry.fallingCount} falling</span>
                      <span className="rounded-sm bg-white/5 px-2 py-0.5 text-slate-300">{entry.droppedCount} dropped</span>
                    </div>
                  </button>
                )) : (
                  <p className="px-3 py-6 text-sm/6 text-slate-300">No snapshots match that search.</p>
                )}
              </div>
            </div>
          )}
          <button className="rounded-sm border border-white/10 px-3 py-2 text-sm/5 font-black uppercase tracking-[0.16em] text-slate-200 disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:border-cyan-300/70 enabled:hover:text-cyan-100" type="button" disabled={isLoading} onClick={onLatest}>
            Latest
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <LogMetric label="Snapshot" value={snapshot ? formatTerminalTime(snapshot.createdAt) : '--:--:--'} />
        <LogMetric label="Clusters" value={(snapshot?.clusterCount ?? 0).toString()} />
        <LogMetric label="Articles" value={(snapshot?.articleCount ?? 0).toString()} />
        <LogMetric label="Rising" value={risingCount.toString()} />
        <LogMetric label="New" value={newCount.toString()} />
      </div>

      {selectedSummary && (
        <div className="mt-3 grid gap-3 rounded-sm border border-white/10 bg-slate-950 p-3 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.16em]">
              <span className="text-cyan-300">Snapshot Changes</span>
              <span className={getDeltaTextClass(selectedSummary.articleDelta)}>{formatSignedCount(selectedSummary.articleDelta)} articles</span>
              <span className={getDeltaTextClass(selectedSummary.clusterDelta)}>{formatSignedCount(selectedSummary.clusterDelta)} clusters</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-5">
              <PopularMetric label="New" value={selectedSummary.newCount.toString()} />
              <PopularMetric label="Rising" value={selectedSummary.risingCount.toString()} />
              <PopularMetric label="Falling" value={selectedSummary.fallingCount.toString()} />
              <PopularMetric label="Stable" value={selectedSummary.stableCount.toString()} />
              <PopularMetric label="Dropped" value={selectedSummary.droppedCount.toString()} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <PopularSnapshotSignal label="Top new" item={selectedSummary.topNewCluster} fallback="No new cluster preview." />
              <PopularSnapshotSignal label="Biggest riser" item={selectedSummary.biggestRiser} fallback="No rising cluster preview." />
              <PopularSnapshotSignal label="Biggest faller" item={selectedSummary.biggestFaller} fallback="No falling cluster preview." />
              <PopularSnapshotSignal label="Top dropped" item={selectedSummary.topDropped} fallback="No dropped cluster preview." />
            </div>
          </div>
          <div className="rounded-sm border border-white/10 bg-white/5 p-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Theme Mix</p>
            <div className="mt-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Sections</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedSummary.leadingSections.length > 0 ? selectedSummary.leadingSections.map((entry) => <span key={entry.label} className="rounded-sm bg-white/5 px-2 py-1 text-xs/5 text-slate-200">{entry.label} {entry.count}</span>) : <span className="text-sm/6 text-slate-400">No section mix yet.</span>}
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Keywords</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedSummary.leadingKeywords.length > 0 ? selectedSummary.leadingKeywords.map((entry) => <span key={entry.label} className="rounded-sm bg-cyan-300/10 px-2 py-1 text-xs/5 text-cyan-100">{entry.label} {entry.count}</span>) : <span className="text-sm/6 text-slate-400">No keyword mix yet.</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {topItem && (
        <article className="mt-3 rounded-sm border border-cyan-300/30 bg-slate-950 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Top Cluster</p>
              <h3 className="mt-1 text-xl/7 font-black text-white">{topItem.headline}</h3>
              <p className="mt-1 max-w-4xl text-sm/6 text-slate-300">{topItem.summary}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm/5">
              <PopularMetric label="Score" value={topItem.score.toFixed(1)} />
              <PopularMetric label="Sources" value={topItem.sourceCount.toString()} />
              <PopularMetric label="Move" value={formatRankMove(topItem)} />
            </div>
          </div>
        </article>
      )}

      <div className="mt-3 overflow-x-auto rounded-sm border border-white/10 bg-slate-950">
        <table className="min-w-[84rem] w-full border-collapse text-left text-sm/6">
          <thead className="bg-white/5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
            <tr>
              <th className="px-3 py-2">Rank</th>
              <th className="px-3 py-2">Move</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Headline</th>
              <th className="px-3 py-2">Sources</th>
              <th className="px-3 py-2">Articles</th>
              <th className="px-3 py-2">Section</th>
              <th className="px-3 py-2">Keywords</th>
              <th className="px-3 py-2">Latest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-slate-200">
            {data.items.length > 0 ? data.items.map((item) => <PopularRankRow key={item.id} item={item} />) : (
              <tr>
                <td className="px-4 py-6 text-slate-300" colSpan={9}>{isLoading ? 'Loading Trending 100...' : 'No Trending 100 snapshot is available yet.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const PopularRankRow = memo(function PopularRankRow({ item }: { item: PopularItem }) {
  return (
    <tr className="align-top hover:bg-white/5">
      <td className="px-3 py-2 font-mono text-lg/6 font-black text-white">{item.rank}</td>
      <td className="px-3 py-2"><span className={getRankMoveClass(item)}>{formatRankMove(item)}</span></td>
      <td className="px-3 py-2 font-mono text-cyan-200">{item.score.toFixed(1)}</td>
      <td className="px-3 py-2 max-w-xl">
        <p className="font-bold text-white">{item.headline}</p>
        <p className="mt-1 text-slate-300">{item.summary}</p>
      </td>
      <td className="px-3 py-2 max-w-xs text-slate-300">{item.sources.join(', ')}</td>
      <td className="px-3 py-2 font-mono text-slate-200">{item.articleCount}</td>
      <td className="px-3 py-2"><StoryLabel label={item.section} tone={getSectionTone({ ...item, id: item.id, source: item.primarySource, time: '', impact: 'Medium' })} /></td>
      <td className="px-3 py-2 max-w-sm text-slate-300">{item.keywords.join(', ')}</td>
      <td className="px-3 py-2 font-mono text-xs/5 text-slate-300">{item.latestPublishedAt ? formatArchiveTime(item.latestPublishedAt) : '-'}</td>
    </tr>
  )
})
