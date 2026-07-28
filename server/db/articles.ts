import type { Database } from 'bun:sqlite'
import { escapeLikeTerm } from '../utils'
import type { ArticlePageRequest, ArticleRecord, ArticleRecordsResponse, NewsStory } from '../types'

export const dataCenterLikePatterns = [
  '%data center%',
  '%datacenter%',
  '%hyperscal%',
  '%colocation%',
  '%server farm%',
  '%compute campus%',
  '%rack density%',
  '%pue%',
  '%data center cooling%',
  '%data centers need to stay cool%',
  '%liquid cool%',
]

const buildDataCenterWhereClause = () =>
  dataCenterLikePatterns.map(() => "LOWER(section || ' ' || headline || ' ' || summary || ' ' || source) LIKE ?").join(' OR ')

export const getArticlePage = (db: Database, request: ArticlePageRequest): ArticleRecordsResponse => {
  const { page, pageSize } = request
  const offset = (page - 1) * pageSize
  const searchTerm = request.searchTerm
  const articleSearch = searchTerm ? `%${escapeLikeTerm(searchTerm)}%` : null
  const searchWhere = articleSearch
    ? `WHERE headline LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR section LIKE ? ESCAPE '\\' OR source LIKE ? ESCAPE '\\'`
    : ''
  const total = articleSearch
    ? (db
        .query<{ count: number }, [string, string, string, string]>(`SELECT COUNT(*) as count FROM raw_articles ${searchWhere}`)
        .get(articleSearch, articleSearch, articleSearch, articleSearch)?.count ?? 0)
    : (db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM raw_articles').get()?.count ?? 0)
  const articleSql = `SELECT id, section, headline, summary, source, time, impact, url, published_at as publishedAt, fetched_at as fetchedAt FROM raw_articles ${searchWhere} ORDER BY fetched_at DESC, COALESCE(published_at, fetched_at) DESC, id DESC LIMIT ? OFFSET ?`
  const articles = articleSearch
    ? db
        .query<ArticleRecord, [string, string, string, string, number, number]>(articleSql)
        .all(articleSearch, articleSearch, articleSearch, articleSearch, pageSize, offset)
    : db.query<ArticleRecord, [number, number]>(articleSql).all(pageSize, offset)

  return { updatedAt: new Date().toISOString(), page, pageSize, total, articles }
}

export const getDataCenterArticlePage = (db: Database, request: ArticlePageRequest): ArticleRecordsResponse => {
  const page = request.maxItems ? 1 : request.page
  const pageSize = request.maxItems ?? request.pageSize
  const offset = request.maxItems ? 0 : (page - 1) * pageSize
  const dataCenterWhere = buildDataCenterWhereClause()
  const searchTerm = request.searchTerm
  const articleSearch = searchTerm ? `%${escapeLikeTerm(searchTerm)}%` : null
  const searchWhere = articleSearch
    ? " AND (headline LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR section LIKE ? ESCAPE '\\' OR source LIKE ? ESCAPE '\\')"
    : ''
  const whereClause = `WHERE (${dataCenterWhere})${searchWhere}`
  const totalSql = `SELECT COUNT(*) as count FROM raw_articles ${whereClause}`
  const articleSql = `SELECT id, section, headline, summary, source, time, impact, url, published_at as publishedAt, fetched_at as fetchedAt FROM raw_articles ${whereClause} ORDER BY fetched_at DESC, COALESCE(published_at, fetched_at) DESC, id DESC LIMIT ? OFFSET ?`
  const totalParams = articleSearch
    ? [...dataCenterLikePatterns, articleSearch, articleSearch, articleSearch, articleSearch]
    : [...dataCenterLikePatterns]
  const articleParams = articleSearch
    ? [...dataCenterLikePatterns, articleSearch, articleSearch, articleSearch, articleSearch, pageSize, offset]
    : [...dataCenterLikePatterns, pageSize, offset]
  const total = db.query<{ count: number }, string[]>(totalSql).get(...(totalParams as string[] & [string, ...string[]]))?.count ?? 0
  const articles = db.query<ArticleRecord, (string | number)[]>(articleSql).all(...articleParams)

  return { updatedAt: new Date().toISOString(), page, pageSize, total, articles }
}

export const getRecentArticles = (db: Database, sinceIso: string, limit: number) =>
  db
    .query<ArticleRecord, [string, number]>(
      `SELECT id, section, headline, summary, source, time, impact, url, published_at as publishedAt, fetched_at as fetchedAt
      FROM raw_articles
      WHERE fetched_at >= ?
      ORDER BY COALESCE(published_at, fetched_at) DESC, id DESC
      LIMIT ?`,
    )
    .all(sinceIso, limit)

export const storeArticles = (db: Database, stories: NewsStory[], fetchedAt: number) => {
  const insertArticle = db.prepare(
    'INSERT OR REPLACE INTO raw_articles (id, section, headline, summary, source, time, impact, url, published_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const fetchedAtIso = new Date(fetchedAt).toISOString()

  db.transaction(() => {
    stories.forEach((story) =>
      insertArticle.run(
        story.id,
        story.section,
        story.headline,
        story.summary,
        story.source,
        story.time,
        story.impact,
        story.url ?? null,
        story.publishedAt ?? null,
        fetchedAtIso,
      ),
    )
  })()
}
