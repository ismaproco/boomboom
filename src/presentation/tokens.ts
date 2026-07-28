import type { NewsStory, RefreshLogEntry } from '../types'

/** Shared fallback when section/source group has no dedicated palette entry. */
export const DEFAULT_NEUTRAL_TONE = 'border-slate-300/20 bg-slate-300/10 text-slate-300' as const

export const SECTION_TONE_BY_KEY = {
  technology: 'border-sky-300/30 bg-sky-300/10 text-sky-200',
  policy: 'border-violet-300/30 bg-violet-300/10 text-violet-200',
  markets: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200',
  energy: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200',
  crypto: 'border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-200',
  deals: 'border-indigo-300/30 bg-indigo-300/10 text-indigo-200',
} as const satisfies Record<string, string>

export const IMPACT_TONE_BY_LEVEL = {
  High: 'border-red-300/30 bg-red-300/10 text-red-200',
  Medium: 'border-violet-300/30 bg-violet-300/10 text-violet-200',
  Low: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200',
} as const satisfies Record<NewsStory['impact'], string>

export const SOURCE_TONE_BY_GROUP = {
  Official: 'border-blue-300/30 bg-blue-300/10 text-blue-200',
  Wire: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200',
  Markets: 'border-teal-300/30 bg-teal-300/10 text-teal-200',
} as const satisfies Record<string, string>

export const LOG_STATUS_CLASS_BY_STATUS = {
  success: 'bg-emerald-300 text-slate-950',
  partial: 'bg-violet-300 text-slate-950',
  failed: 'bg-red-300 text-slate-950',
  skipped: 'bg-slate-700 text-slate-100',
} as const satisfies Record<RefreshLogEntry['status'], string>
