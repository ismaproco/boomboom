import type { ArticleRecordsResponse } from '../../types'
import { formatTerminalTime } from '../../formatters'
import { getSourceGroup, inferDisplaySection } from '../../storyRules'
import { getImpactTone, getSectionTone, getSourceTone, SectionHeader, StoryLabel } from '../../presentation'

export function RawArticlesTable({ data, isLoading, onPageChange }: { data: ArticleRecordsResponse; isLoading: boolean; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))
  const firstRecord = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1
  const lastRecord = Math.min(data.total, data.page * data.pageSize)

  return (
    <section className="rounded-sm border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/30 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionHeader eyebrow="Article Store" title="Raw Gathered Articles" />
          <p className="mt-2 max-w-2xl text-sm/6 text-slate-300">
            Raw article records persisted from backend RSS gathering. Pagination is fixed at 100 records per page.
          </p>
        </div>
        <div className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-sm/6 text-slate-200">
          <p><span className="font-black uppercase tracking-[0.16em] text-cyan-300">Rows</span> {firstRecord}-{lastRecord} of {data.total}</p>
          <p><span className="font-black uppercase tracking-[0.16em] text-cyan-300">Page</span> {data.page} / {totalPages}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm/6 text-slate-300">Updated {formatTerminalTime(data.updatedAt)}{isLoading ? ' / loading' : ''}</p>
        <div className="flex gap-2">
          <button className="rounded-sm border border-white/10 px-3 py-1.5 text-sm/5 font-black uppercase tracking-[0.16em] text-slate-200 disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:border-cyan-300/70 enabled:hover:text-cyan-100" type="button" disabled={data.page <= 1 || isLoading} onClick={() => onPageChange(data.page - 1)}>
            Prev
          </button>
          <button className="rounded-sm border border-white/10 px-3 py-1.5 text-sm/5 font-black uppercase tracking-[0.16em] text-slate-200 disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:border-cyan-300/70 enabled:hover:text-cyan-100" type="button" disabled={data.page >= totalPages || isLoading} onClick={() => onPageChange(data.page + 1)}>
            Next
          </button>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-sm border border-white/10 bg-slate-950">
        <table className="min-w-[78rem] w-full border-collapse text-left text-sm/6">
          <thead className="bg-white/5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Fetched</th>
              <th className="px-3 py-2">Published</th>
              <th className="px-3 py-2">Section</th>
              <th className="px-3 py-2">Impact</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Headline</th>
              <th className="px-3 py-2">Summary</th>
              <th className="px-3 py-2">URL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-slate-200">
            {data.articles.length > 0 ? data.articles.map((article) => (
              <tr key={article.id} className="align-top hover:bg-white/5">
                <td className="px-3 py-2 font-mono text-xs/5 text-slate-300">{article.id}</td>
                <td className="px-3 py-2 font-mono text-xs/5 text-cyan-200">{article.fetchedAt}</td>
                <td className="px-3 py-2 font-mono text-xs/5 text-slate-300">{article.publishedAt ?? '-'}</td>
                <td className="px-3 py-2"><StoryLabel label={inferDisplaySection(article)} tone={getSectionTone(article)} /></td>
                <td className="px-3 py-2"><StoryLabel label={article.impact} tone={getImpactTone(article.impact)} /></td>
                <td className="px-3 py-2"><div className="flex flex-col items-start gap-1"><StoryLabel label={getSourceGroup(article.source)} tone={getSourceTone(article.source)} /><span className="text-slate-300">{article.source}</span></div></td>
                <td className="px-3 py-2 font-bold text-white">{article.headline}</td>
                <td className="px-3 py-2 max-w-md text-slate-300">{article.summary}</td>
                <td className="px-3 py-2 max-w-sm break-all">
                  {article.url ? <a className="text-cyan-300 underline decoration-cyan-300/30 underline-offset-4 hover:text-cyan-100" href={article.url} target="_blank" rel="noreferrer">{article.url}</a> : '-'}
                </td>
              </tr>
            )) : (
              <tr>
                <td className="px-4 py-6 text-slate-300" colSpan={9}>No stored article records are available yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
