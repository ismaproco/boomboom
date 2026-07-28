import type { SectionFilter, SignalFilter } from './navigation'
import type { NewsStory, PopularItem } from './types'

export const getSourceGroup = (source: string) => {
  if (/federal reserve|sec/i.test(source)) return 'Official'
  if (/cnbc|yahoo|marketwatch/i.test(source)) return 'Wire'
  if (/investing/i.test(source)) return 'Markets'
  return 'Source'
}

export const inferDisplaySection = (story: Pick<NewsStory, 'section' | 'headline' | 'summary' | 'source'>) => {
  const text = `${story.section} ${story.headline} ${story.summary} ${story.source}`.toLowerCase()
  if (/crypto|bitcoin|btc|ether|coinbase|digital asset/.test(text)) return 'Crypto'
  if (/deal|m&a|merger|acquisition|ipo|buyout|private credit|refinancing/.test(text)) return 'Deals'
  return story.section
}

export const dedupeStoryList = <T extends NewsStory>(stories: T[]) => {
  const seen = new Set<number | string>()

  return stories.filter((story) => {
    const key = story.url ?? story.id ?? story.headline.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const storyMatchesSection = (story: NewsStory, section: SectionFilter) => {
  if (section === 'Top') return true

  const text = `${story.section} ${story.headline} ${story.summary}`.toLowerCase()
  const patterns: Record<SectionFilter, RegExp> = {
    Top: /./,
    Markets: /markets?|stocks?|shares?|equity|index|nasdaq|s&p|dow|rally|selloff/,
    Technology: /technology|tech|ai|chip|cloud|software|semiconductor|nvidia|microsoft|alphabet|meta|amazon|apple/,
    Energy: /energy|oil|gas|crude|brent|wti|opec|hormuz/,
  }

  return patterns[section].test(text)
}

export const storyMatchesSignal = (story: NewsStory, signal: SignalFilter | null) => {
  if (!signal) return true

  const text = `${story.section} ${story.headline} ${story.summary}`.toLowerCase()
  const patterns: Record<SignalFilter, RegExp> = {
    Breaking: /breaking|alert|urgent|surge|plunge|tanks|soar|warning|retaliation|war|crisis/,
    Fed: /fed|federal reserve|powell|central bank|inflation|treasury|rate cut|rate hike/,
    Earnings: /earnings|revenue|profit|guidance|quarter|eps|beats|misses/,
    Rates: /rates?|yield|bond|treasury|curve|mortgage|basis point|bps/,
    Energy: /energy|oil|gas|crude|brent|wti|opec|hormuz/,
    Crypto: /crypto|bitcoin|btc|ether|coinbase|mstr|digital asset/,
  }

  return patterns[signal].test(text) || (signal === 'Breaking' && story.impact === 'High')
}

export const getRankMoveClass = (item: Pick<PopularItem, 'previousRank' | 'rankDelta'>) => {
  const base = 'rounded-sm px-2 py-1 text-xs font-black uppercase tracking-[0.12em] '
  if (item.previousRank === null) return `${base}bg-cyan-300 text-slate-950`
  if ((item.rankDelta ?? 0) > 0) return `${base}bg-emerald-300 text-slate-950`
  if ((item.rankDelta ?? 0) < 0) return `${base}bg-red-300 text-slate-950`
  return `${base}bg-slate-700 text-slate-100`
}
