import { readFileSync, writeFileSync } from 'node:fs'

const orig = readFileSync('server/database.ts', 'utf8')
const schemaMatch = orig.match(/const schemaSql = `([\s\S]*?)`/)
const schemaSql = schemaMatch ? schemaMatch[1] : ''
const initMatch = orig.match(/private initialize\(\) \{([\s\S]*?)\n  \}\n\}/)
const initBody = initMatch ? initMatch[1] : ''

const extractMethods = (path, className) => {
  const lines = readFileSync(path, 'utf8').split('\n')
  const start = lines.findIndex((l) => l.includes(`export class ${className}`))
  const methods = []
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].includes('export const migrate')) break
    const m = lines[i].match(/^  ([a-zA-Z][\w]*)\(/)
    if (m && m[1] !== 'constructor') methods.push(m[1])
  }
  return methods
}

const portfolio = extractMethods('server/db/portfolio.ts', 'PortfolioDb')
const popular = extractMethods('server/db/popular.ts', 'PopularDb')
const commodity = extractMethods('server/db/commodities.ts', 'CommodityDb')

const decl = (typeName, names) => names.map((n) => `  ${n}!: ${typeName}['${n}']`).join('\n')
const bind = (varName, names) => names.map((n) => `    this.${n} = ${varName}.${n}.bind(${varName})`).join('\n')

const content = `import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { applySqlitePragmas } from './db/connection'
import { CommodityDb, migrateCommodityDomain } from './db/commodities'
import { PortfolioDb, migratePortfolioDomain } from './db/portfolio'
import { PopularDb } from './db/popular'
import { topNews, tickers } from './seedData'
import * as articleDb from './db/articles'
import type {
  ArticlePageRequest,
  ArticleRecordsResponse,
  ArticleRepository,
  NewsStory,
  PageRequest,
  PopularRepository,
  PortfolioRepository,
  RefreshLogEntry,
  RefreshLogInput,
  RefreshLogRepository,
  RefreshLogResponse,
  TopNewsFallbackRepository,
  TopNewsResponse,
  Ticker,
} from './types'
const schemaSql = \`${schemaSql}\`

export class SqliteStore implements ArticleRepository, PopularRepository, PortfolioRepository, RefreshLogRepository, TopNewsFallbackRepository {
  readonly db: Database
  private readonly portfolio: PortfolioDb
  private readonly popular: PopularDb
  private readonly commodities: CommodityDb

${decl('PortfolioDb', portfolio)}
${decl('PopularDb', popular)}
${decl('CommodityDb', commodity)}

  constructor(private readonly dbPath: string, private readonly dataDir: string) {
    mkdirSync(dataDir, { recursive: true })
    this.db = new Database(dbPath, { create: true })
    applySqlitePragmas(this.db)
    this.portfolio = new PortfolioDb(this.db)
    this.popular = new PopularDb(this.db)
    this.commodities = new CommodityDb(this.db)
    this.initialize()
    migratePortfolioDomain(this.db)
    migrateCommodityDomain(this.db)
    const portfolio = this.portfolio
    const popular = this.popular
    const commodities = this.commodities
${bind('portfolio', portfolio)}
${bind('popular', popular)}
${bind('commodities', commodity)}
  }

  get path() {
    return this.dbPath
  }

  ping(): boolean {
    const row = this.db.query<{ ok: number }, []>('SELECT 1 as ok').get()
    return row?.ok === 1
  }

  close() {
    this.db.close()
  }

  getSeededTopNews(nextRefreshAt: number): TopNewsResponse {
    const stories = this.db.query<NewsStory, []>('SELECT id, section, headline, summary, source, time, impact, url FROM news_stories ORDER BY sort_order ASC').all()
    const marketTickers = this.db.query<Ticker, []>('SELECT symbol, value, change FROM market_tickers ORDER BY sort_order ASC').all()
    const fallbackStories = stories.length > 0 ? stories : topNews

    return {
      updatedAt: new Date().toISOString(),
      lead: fallbackStories[0],
      stories: fallbackStories.slice(1),
      tickers: marketTickers.length > 0 ? marketTickers : tickers,
      dataSource: 'fallback',
      marketSource: 'fallback',
      newsSource: 'fallback',
      lastRefreshAt: null,
      nextRefreshAt: nextRefreshAt ? new Date(nextRefreshAt).toISOString() : null,
    }
  }

  getPage(request: ArticlePageRequest): ArticleRecordsResponse {
    return articleDb.getArticlePage(this.db, request)
  }

  getDataCenterPage(request: ArticlePageRequest): ArticleRecordsResponse {
    return articleDb.getDataCenterArticlePage(this.db, request)
  }

  getRecentArticles(sinceIso: string, limit: number) {
    return articleDb.getRecentArticles(this.db, sinceIso, limit)
  }

  store(stories: NewsStory[], fetchedAt: number) {
    articleDb.storeArticles(this.db, stories, fetchedAt)
  }

  getRefreshLog(request: PageRequest, isRefreshing: boolean): RefreshLogResponse {
    const { page, pageSize } = request
    const offset = (page - 1) * pageSize
    const total = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM refresh_logs').get()?.count ?? 0
    const summary = this.db.query<{ totalArticles: number | null; totalMarketQuotes: number | null; successfulRuns: number | null; failedRuns: number | null; averageDurationMs: number | null }, []>(
      \`SELECT COALESCE(SUM(news_count), 0) as totalArticles, COALESCE(SUM(market_count), 0) as totalMarketQuotes, COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) as successfulRuns, COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failedRuns, COALESCE(ROUND(AVG(duration_ms)), 0) as averageDurationMs FROM refresh_logs\`,
    ).get()
    const entries = this.db.query<RefreshLogEntry, [number, number]>(
      \`SELECT id, started_at as startedAt, finished_at as finishedAt, status, market_count as marketCount, news_count as newsCount, duration_ms as durationMs, message, next_refresh_at as nextRefreshAt FROM refresh_logs ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?\`,
    ).all(pageSize, offset)

    return {
      updatedAt: new Date().toISOString(),
      isRefreshing,
      page,
      pageSize,
      total,
      summary: {
        totalArticles: summary?.totalArticles ?? 0,
        totalMarketQuotes: summary?.totalMarketQuotes ?? 0,
        successfulRuns: summary?.successfulRuns ?? 0,
        failedRuns: summary?.failedRuns ?? 0,
        averageDurationMs: summary?.averageDurationMs ?? 0,
      },
      entries,
    }
  }

  recordRefreshLog(entry: RefreshLogInput, nextRefreshAt: number) {
    this.db.prepare('INSERT INTO refresh_logs (started_at, finished_at, status, market_count, news_count, duration_ms, message, next_refresh_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      new Date(entry.startedAt).toISOString(),
      new Date(entry.finishedAt).toISOString(),
      entry.status,
      entry.marketCount,
      entry.newsCount,
      Math.max(0, entry.finishedAt - entry.startedAt),
      entry.message,
      nextRefreshAt ? new Date(nextRefreshAt).toISOString() : null,
    )
  }

  private initialize() {${initBody}
  }
}
`

writeFileSync('server/database.ts', content)
console.log('wrote database.ts', content.split('\n').length, 'lines')
