import {
  dedupeStories,
  formatPrice,
  formatRelativeTime,
  hashString,
  inferImpact,
  inferSection,
  normalizeSymbol,
  parseDateIso,
  sortStoriesByPublishedAt,
} from './utils'
import type { LiveNewsGateway, NewsFeedSource, NewsStory, Ticker } from './types'

type ChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string
        regularMarketPrice?: number
        previousClose?: number
        chartPreviousClose?: number
      }
    }>
  }
}

export type Fetcher = (url: string) => Promise<Response>

export type RssParserConfig = {
  maxItems: number
  summaryLength: number
}

const defaultRssParserConfig: RssParserConfig = {
  maxItems: 20,
  summaryLength: 260,
}

const MAX_FEED_XML_BYTES = 5 * 1024 * 1024
const MAX_FEED_ENTRY_MATCHES = 500

export interface QuoteProvider {
  fetch(symbol: string): Promise<Ticker | undefined>
}

export interface NewsFeedParser {
  parse(sourceConfig: NewsFeedSource, xml: string): NewsStory[]
}

export class YahooChartQuoteProvider implements QuoteProvider {
  constructor(private readonly fetcher: Fetcher) {}

  async fetch(symbol: string): Promise<Ticker | undefined> {
    const normalized = normalizeSymbol(symbol)
    if (!normalized) return undefined
    const encodedSymbol = encodeURIComponent(normalized)
    const response = await this.fetcher(`https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1m&range=1d`)
    if (!response.ok) return undefined

    const data = (await response.json()) as ChartResponse
    const meta = data.chart?.result?.[0]?.meta
    const price = meta?.regularMarketPrice
    const previousClose = meta?.previousClose ?? meta?.chartPreviousClose
    if (!Number.isFinite(price) || !Number.isFinite(previousClose) || !price || !previousClose) return undefined

    const changePercent = ((price - previousClose) / previousClose) * 100
    return {
      symbol: meta?.symbol ?? symbol,
      value: formatPrice(price),
      change: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
      lastPrice: price,
    }
  }
}

export class RssNewsFeedParser implements NewsFeedParser {
  constructor(private readonly config: RssParserConfig = defaultRssParserConfig) {}

  parse(sourceConfig: NewsFeedSource, xml: string): NewsStory[] {
    return getFeedEntries(xml)
      .slice(0, this.config.maxItems)
      .map((item, index) => {
        const headline = decodeXml(readXmlTag(item, 'title') || 'Market headline')
        const summary = stripTags(decodeXml(readXmlTag(item, 'description') || headline)).slice(0, this.config.summaryLength)
        const publishedAt = readXmlTag(item, 'pubDate') ?? readXmlTag(item, 'published') ?? readXmlTag(item, 'updated')
        const articleUrl = extractArticleUrl(item)

        return {
          id: hashString(`${sourceConfig.name}:${headline}:${publishedAt || index}`),
          section: inferSection(`${headline} ${readXmlTag(item, 'category') ?? ''}`),
          headline,
          summary,
          source: sourceConfig.name,
          time: formatRelativeTime(publishedAt),
          impact: inferImpact(headline),
          publishedAt: parseDateIso(publishedAt),
          ...(articleUrl ? { url: articleUrl } : {}),
        }
      })
  }
}

export class OpenDataClient implements LiveNewsGateway {
  private readonly quoteProvider: QuoteProvider
  private readonly feedParser: NewsFeedParser

  constructor(
    private readonly fetcher: Fetcher,
    private readonly watchlist: string[],
    private readonly feeds: NewsFeedSource[],
    quoteProvider?: QuoteProvider,
    feedParser?: NewsFeedParser,
  ) {
    this.quoteProvider = quoteProvider ?? new YahooChartQuoteProvider(fetcher)
    this.feedParser = feedParser ?? new RssNewsFeedParser()
  }

  async fetchLiveTickers(additionalSymbols: readonly string[] = []) {
    const merged = [
      ...new Set([...this.watchlist, ...additionalSymbols].map((symbol) => normalizeSymbol(symbol)).filter((s): s is string => s !== null)),
    ]
    const quoteResults = await Promise.allSettled(merged.map((symbol) => this.quoteProvider.fetch(symbol)))
    return quoteResults
      .filter((result): result is PromiseFulfilledResult<Ticker | undefined> => result.status === 'fulfilled')
      .map((result) => result.value)
      .filter((ticker): ticker is Ticker => Boolean(ticker))
  }

  async fetchLiveNews() {
    const feedResults = await Promise.allSettled(this.feeds.map((source) => this.fetchRssFeed(source)))
    const stories = feedResults
      .filter((result): result is PromiseFulfilledResult<NewsStory[]> => result.status === 'fulfilled')
      .flatMap((result) => result.value)
    return sortStoriesByPublishedAt(dedupeStories(stories))
  }

  private async fetchRssFeed(sourceConfig: NewsFeedSource): Promise<NewsStory[]> {
    const response = await this.fetcher(sourceConfig.url)
    if (!response.ok) return []

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > MAX_FEED_XML_BYTES) return []
    const xml = new TextDecoder().decode(buffer)
    return this.feedParser.parse(sourceConfig, xml)
  }
}

export const createTimeoutFetcher =
  (fetchTimeoutMs: number): Fetcher =>
  async (url: string) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs)

    try {
      return await fetch(url, {
        headers: {
          accept: 'application/json, application/rss+xml, application/xml, text/xml, */*',
          'user-agent': 'Mozilla/5.0 (compatible; BoomBoomNews/0.1; +https://localhost)',
        },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

const getFeedEntries = (xml: string) => {
  const rssItems = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]).slice(0, MAX_FEED_ENTRY_MATCHES)
  if (rssItems.length > 0) return rssItems
  return [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]).slice(0, MAX_FEED_ENTRY_MATCHES)
}

const readXmlTag = (xml: string, tag: string) =>
  xml
    .match(new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`, 'i'))?.[1]
    ?.replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .trim()
const stripTags = (value: string) =>
  value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
const decodeXml = (value: string) =>
  value
    .replaceAll('&amp;', '&')
    .replaceAll('&apos;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/&#(x?[0-9a-f]+);/gi, (_match, code: string) => {
      const codePoint = code.toLowerCase().startsWith('x') ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : ''
    })
const normalizeArticleUrl = (value: string | undefined) => {
  const decodedUrl = decodeXml(value ?? '').trim()
  if (!/^https?:\/\//i.test(decodedUrl)) return undefined
  return decodedUrl
}
const extractArticleUrl = (item: string) => {
  const linkUrl = normalizeArticleUrl(readXmlTag(item, 'link'))
  if (linkUrl) return linkUrl
  const atomHrefMatch = item.match(/<link\b[^>]*\bhref=(?:"([^"]+)"|'([^']+)')/i)
  const atomLink = normalizeArticleUrl(atomHrefMatch?.[1] ?? atomHrefMatch?.[2])
  if (atomLink) return atomLink
  if (/\sispermalink=("true"|'true')/i.test(item)) return normalizeArticleUrl(readXmlTag(item, 'guid'))
  return undefined
}
