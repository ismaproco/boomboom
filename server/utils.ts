import type { Impact, NewsStory } from './types'

export const parseDateMs = (value: string | undefined) => {
  if (!value) return Number.NaN
  const timestamp = new Date(value).getTime()
  if (Number.isFinite(timestamp)) return timestamp
  return new Date(`${value} UTC`).getTime()
}

export const parseDateIso = (value: string | undefined) => {
  const timestamp = parseDateMs(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

export const formatRelativeTime = (value: string | undefined) => {
  if (!value) return 'now'
  const timestamp = parseDateMs(value)
  if (!Number.isFinite(timestamp)) return 'now'
  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000))
  if (diffMinutes < 1) return 'now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hr ago`
  return `${Math.round(diffHours / 24)} d ago`
}

export const hashString = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

export const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: price >= 100 ? 2 : 3,
    minimumFractionDigits: 2,
  }).format(price)

export const inferSection = (headline: string) => {
  const normalized = headline.toLowerCase()
  if (/fed|inflation|treasury|rate|bond|ecb|bank of england/.test(normalized)) return 'Policy'
  if (/oil|gas|energy|crude|hormuz/.test(normalized)) return 'Energy'
  if (/ai|cloud|chip|nvidia|microsoft|alphabet|meta|amazon|apple|tech/.test(normalized)) return 'Technology'
  if (/earnings|stock|shares|dow|nasdaq|s&p|market/.test(normalized)) return 'Markets'
  return 'Top'
}

export const inferImpact = (headline: string): Impact =>
  /fed|inflation|oil|surge|plunge|tanks|soar|rates|war|earnings|beats/i.test(headline) ? 'High' : 'Medium'

export const dedupeStories = (stories: NewsStory[]) => {
  const seen = new Set<string>()
  return stories.filter((story) => {
    const key = story.headline.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const sortStoriesByPublishedAt = (stories: NewsStory[]) =>
  [...stories].sort((left, right) => {
    const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0
    const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0
    return rightTime - leftTime
  })

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.^=-]{0,15}$/

/** Normalize and validate a ticker-style symbol for upstream quote/history fetches. */
export const normalizeSymbol = (symbol: string): string | null => {
  const normalized = symbol.trim().toUpperCase()
  if (!normalized || !SYMBOL_PATTERN.test(normalized)) return null
  return normalized
}

export const normalizeSymbolList = (symbols: string[]) => [
  ...new Set(symbols.map((s) => normalizeSymbol(s)).filter((s): s is string => s !== null)),
]

/** Escape `%`, `_`, and `\` for SQLite LIKE … ESCAPE '\\' patterns. */
export const escapeLikeTerm = (term: string) => term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')

export const parseJsonArray = (value: string) => {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}
