import type { NewsStory } from '../../types'
import { inferDisplaySection } from '../../storyRules'
import { getImpactTone, getSectionTone, SectionHeader, StoryLabel } from '../../presentation'

export function DataCentersDashboard({ stories, isLoading, lastRefreshTime, nextRefreshTime }: { stories: NewsStory[]; isLoading: boolean; lastRefreshTime: string; nextRefreshTime: string }) {
  const highImpactCount = stories.filter((story) => story.impact === 'High').length
  const sourceCount = new Set(stories.map((story) => story.source)).size
  const leadStory = stories[0]

  return (
    <section className="rounded-sm border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/30 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionHeader eyebrow="Infrastructure Desk" title="Data Centers" />
          <p className="mt-2 max-w-3xl text-sm/6 text-slate-300">
            Curated stories matched on data-center terms like hyperscalers, cooling, power, and AI infrastructure buildout.
          </p>
        </div>
        <div className="rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-sm/6 text-slate-200">
          <p><span className="font-black uppercase tracking-[0.16em] text-cyan-300">Stories</span> {stories.length}</p>
          <p><span className="font-black uppercase tracking-[0.16em] text-cyan-300">High Impact</span> {highImpactCount}</p>
          <p><span className="font-black uppercase tracking-[0.16em] text-cyan-300">Sources</span> {sourceCount}</p>
        </div>
      </div>

      <div className="mt-3 rounded-sm border border-white/10 bg-slate-950 px-4 py-3 text-sm/6 text-slate-300">
        Last refresh {lastRefreshTime} / next {nextRefreshTime}{isLoading ? ' / loading more news' : ''}
      </div>

      {leadStory ? (
        <article className="mt-3 rounded-sm border border-cyan-300/30 bg-cyan-100 p-4 text-slate-950">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-black uppercase tracking-[0.18em]">
            <span className="rounded-sm bg-slate-950 px-3 py-1.5 text-cyan-100">Lead Signal</span>
            <StoryLabel label={inferDisplaySection(leadStory)} tone={getSectionTone(leadStory)} />
            <StoryLabel label={leadStory.impact} tone={getImpactTone(leadStory.impact)} />
          </div>
          {leadStory.url ? (
            <a href={leadStory.url} target="_blank" rel="noreferrer" className="mt-3 block text-2xl/8 font-black tracking-tight underline decoration-slate-950/20 underline-offset-4 hover:decoration-slate-950">
              {leadStory.headline}
            </a>
          ) : (
            <h3 className="mt-3 text-2xl/8 font-black tracking-tight">{leadStory.headline}</h3>
          )}
          <p className="mt-2 text-sm/6 text-slate-800">{leadStory.summary}</p>
        </article>
      ) : (
        <div className="mt-3 rounded-sm border border-white/10 bg-slate-950 px-4 py-8 text-center text-slate-300">
          No data center stories match the current search.
        </div>
      )}

      {stories.length > 1 && (
        <div className="mt-3 grid gap-2">
          {stories.slice(1).map((story) => (
            <article key={story.id} className="grid gap-3 rounded-sm border border-white/10 bg-slate-950/70 p-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                  <StoryLabel label={inferDisplaySection(story)} tone={getSectionTone(story)} />
                  <StoryLabel label={story.impact} tone={getImpactTone(story.impact)} />
                </div>
                {story.url ? (
                  <a href={story.url} target="_blank" rel="noreferrer" className="mt-1.5 block text-lg/6 font-black tracking-tight text-white underline decoration-transparent underline-offset-4 hover:text-cyan-100 hover:decoration-cyan-300/60">
                    {story.headline}
                  </a>
                ) : (
                  <h3 className="mt-1.5 text-lg/6 font-black tracking-tight text-white">{story.headline}</h3>
                )}
                <p className="mt-1 text-sm/6 text-slate-300">{story.summary}</p>
              </div>
              <div className="flex flex-col items-start gap-1.5 sm:items-end">
                <p className="rounded-sm bg-white/5 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-300">{story.source}</p>
                <span className="font-mono text-xs/5 text-cyan-200">{story.time}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
