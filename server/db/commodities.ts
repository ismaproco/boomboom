import type { Database } from 'bun:sqlite'
import { parseNumberArrayJson, parseStringArrayJson } from '../dbJsonSchemas'
import type { CommodityInstrument, CommodityNewsLink, CommoditySnapshot, CommoditySnapshotSummary, CommoditySnapshotItem } from '../types'

export class CommodityDb {
  constructor(readonly db: Database) {}

  upsertCommodityInstruments(instruments: CommodityInstrument[]) {
    if (instruments.length === 0) return
    const upsert = this.db.prepare(
      `INSERT INTO commodity_instruments (symbol, name, category, underlying, proxy_type, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        underlying = excluded.underlying,
        proxy_type = excluded.proxy_type,
        sort_order = excluded.sort_order,
        is_active = excluded.is_active`,
    )
    this.db.transaction(() => {
      instruments.forEach((instrument) => {
        upsert.run(
          instrument.symbol.trim().toUpperCase(),
          instrument.name,
          instrument.category,
          instrument.underlying,
          instrument.proxyType,
          instrument.sortOrder,
          instrument.isActive ? 1 : 0,
        )
      })
    })()
  }

  listCommodityInstruments(activeOnly = true) {
    const rows = activeOnly
      ? this.db
          .query<CommodityInstrument & { isActiveRaw: number }, []>(
            `SELECT symbol, name, category, underlying, proxy_type as proxyType, sort_order as sortOrder, is_active as isActiveRaw
        FROM commodity_instruments WHERE is_active = 1 ORDER BY sort_order ASC, symbol ASC`,
          )
          .all()
      : this.db
          .query<CommodityInstrument & { isActiveRaw: number }, []>(
            `SELECT symbol, name, category, underlying, proxy_type as proxyType, sort_order as sortOrder, is_active as isActiveRaw
        FROM commodity_instruments ORDER BY sort_order ASC, symbol ASC`,
          )
          .all()
    return rows.map((row) => ({ ...row, isActive: Boolean(row.isActiveRaw) }))
  }

  upsertCommodityPriceHistory(symbol: string, bars: Array<{ date: string; close: number }>) {
    const normalized = symbol.trim().toUpperCase()
    if (!normalized || bars.length === 0) return
    const updatedAt = new Date().toISOString()
    const upsert = this.db.prepare(
      `INSERT INTO commodity_price_history (symbol, date, close, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(symbol, date) DO UPDATE SET close = excluded.close, updated_at = excluded.updated_at`,
    )
    this.db.transaction(() => {
      bars.forEach((bar) => {
        if (!bar.date || !Number.isFinite(bar.close) || bar.close <= 0) return
        upsert.run(normalized, bar.date, bar.close, updatedAt)
      })
    })()
  }

  getCommodityPriceHistory(symbol: string, fromDate: string, toDate: string) {
    return this.db
      .query<{ symbol: string; date: string; close: number; updatedAt: string }, [string, string, string]>(
        `SELECT symbol, date, close, updated_at as updatedAt
      FROM commodity_price_history
      WHERE symbol = ? AND date >= ? AND date <= ?
      ORDER BY date ASC`,
      )
      .all(symbol.trim().toUpperCase(), fromDate, toDate)
  }

  saveCommoditySnapshot(input: {
    source: 'live' | 'stale' | 'fallback'
    status: 'ok' | 'partial' | 'error'
    summaryJson: string
    items: CommoditySnapshotItem[]
  }) {
    return this.db.transaction(() => {
      const snapshotResult = this.db
        .prepare('INSERT INTO commodity_snapshots (created_at, source, status, summary_json) VALUES (?, ?, ?, ?)')
        .run(new Date().toISOString(), input.source, input.status, input.summaryJson)
      const snapshotId = Number(snapshotResult.lastInsertRowid)
      const insertItem = this.db.prepare(
        `INSERT INTO commodity_snapshot_items
        (snapshot_id, symbol, name, category, underlying, proxy_type, price, change_1d, change_1w, change_1m, week_change_series_json, volatility_30d, signal, signal_score, risk_label, risk_score, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      input.items.forEach((item) => {
        insertItem.run(
          snapshotId,
          item.symbol,
          item.name,
          item.category,
          item.underlying,
          item.proxyType,
          item.price,
          item.change1Day,
          item.change1Week,
          item.change1Month,
          JSON.stringify(item.weekChangeSeries),
          item.volatility30d,
          item.signal,
          item.signalScore,
          item.riskLabel,
          item.riskScore,
          item.note,
        )
      })
      return snapshotId
    })()
  }

  getLatestCommoditySnapshot() {
    return (
      this.db
        .query<CommoditySnapshot, []>(
          `SELECT id, created_at as createdAt, source, status, summary_json as summaryJson
      FROM commodity_snapshots ORDER BY created_at DESC, id DESC LIMIT 1`,
        )
        .get() ?? null
    )
  }

  getCommoditySnapshotItems(snapshotId: number) {
    return this.db
      .query<CommoditySnapshotItem, [number]>(
        `SELECT symbol, name, category, underlying, proxy_type as proxyType, price,
      change_1d as change1Day, change_1w as change1Week, change_1m as change1Month,
      volatility_30d as volatility30d, signal, signal_score as signalScore, risk_label as riskLabel, risk_score as riskScore, note,
      week_change_series_json as weekChangeSeriesJson
      FROM commodity_snapshot_items
      WHERE snapshot_id = ?
      ORDER BY category ASC, symbol ASC`,
      )
      .all(snapshotId)
      .map((item) => {
        const { weekChangeSeriesJson, ...rest } = item as CommoditySnapshotItem & { weekChangeSeriesJson?: string }
        return {
          ...rest,
          weekChangeSeries: parseNumberArrayJson(weekChangeSeriesJson ?? '[]'),
        }
      })
  }

  getCommoditySnapshots(limit: number) {
    return this.db
      .query<CommoditySnapshotSummary, [number]>(
        `SELECT cs.id, cs.created_at as createdAt, cs.source, cs.status,
      COALESCE(SUM(CASE WHEN csi.signal = 'bullish' THEN 1 ELSE 0 END), 0) as bullishCount,
      COALESCE(SUM(CASE WHEN csi.signal = 'neutral' THEN 1 ELSE 0 END), 0) as neutralCount,
      COALESCE(SUM(CASE WHEN csi.signal = 'bearish' THEN 1 ELSE 0 END), 0) as bearishCount,
      COUNT(csi.id) as itemCount
      FROM commodity_snapshots cs
      LEFT JOIN commodity_snapshot_items csi ON csi.snapshot_id = cs.id
      GROUP BY cs.id
      ORDER BY cs.created_at DESC, cs.id DESC
      LIMIT ?`,
      )
      .all(limit)
  }

  replaceCommodityNewsLinks(snapshotId: number, links: Array<Omit<CommodityNewsLink, 'id' | 'snapshotId'>>) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM commodity_news_links WHERE snapshot_id = ?').run(snapshotId)
      const insert = this.db.prepare(
        `INSERT INTO commodity_news_links (snapshot_id, symbol, article_id, score, matched_terms_json)
        VALUES (?, ?, ?, ?, ?)`,
      )
      links.forEach((link) => {
        insert.run(snapshotId, link.symbol.trim().toUpperCase(), link.articleId, link.score, JSON.stringify(link.matchedTerms))
      })
    })()
  }

  getCommodityNewsLinks(snapshotId: number, symbol?: string) {
    if (!symbol) {
      return this.db
        .query<CommodityNewsLink & { matchedTermsJson: string }, [number]>(
          `SELECT id, snapshot_id as snapshotId, symbol, article_id as articleId, score, matched_terms_json as matchedTermsJson
        FROM commodity_news_links WHERE snapshot_id = ? ORDER BY symbol ASC, score DESC, id DESC`,
        )
        .all(snapshotId)
        .map((row) => ({ ...row, matchedTerms: parseStringArrayJson(row.matchedTermsJson) }))
    }
    return this.db
      .query<CommodityNewsLink & { matchedTermsJson: string }, [number, string]>(
        `SELECT id, snapshot_id as snapshotId, symbol, article_id as articleId, score, matched_terms_json as matchedTermsJson
      FROM commodity_news_links WHERE snapshot_id = ? AND symbol = ? ORDER BY score DESC, id DESC`,
      )
      .all(snapshotId, symbol.trim().toUpperCase())
      .map((row) => ({ ...row, matchedTerms: parseStringArrayJson(row.matchedTermsJson) }))
  }
}

export const migrateCommodityDomain = (db: Database) => {
  db.exec(`CREATE TABLE IF NOT EXISTS commodity_instruments (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('energy', 'precious-metals', 'industrial-metals', 'agriculture', 'miners')),
      underlying TEXT NOT NULL,
      proxy_type TEXT NOT NULL CHECK (proxy_type IN ('etf', 'equity')),
      sort_order INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
    )`)
  db.exec(`CREATE TABLE IF NOT EXISTS commodity_price_history (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      close REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (symbol, date)
    )`)
  db.exec('CREATE INDEX IF NOT EXISTS commodity_price_history_symbol_date_idx ON commodity_price_history(symbol, date ASC)')
  db.exec(`CREATE TABLE IF NOT EXISTS commodity_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('live', 'stale', 'fallback')),
      status TEXT NOT NULL CHECK (status IN ('ok', 'partial', 'error')),
      summary_json TEXT NOT NULL
    )`)
  db.exec('CREATE INDEX IF NOT EXISTS commodity_snapshots_created_idx ON commodity_snapshots(created_at DESC)')
  db.exec(`CREATE TABLE IF NOT EXISTS commodity_snapshot_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      underlying TEXT NOT NULL,
      proxy_type TEXT NOT NULL,
      price REAL,
      change_1d REAL,
      change_1w REAL,
      change_1m REAL,
      week_change_series_json TEXT NOT NULL DEFAULT '[]',
      volatility_30d REAL,
      signal TEXT NOT NULL CHECK (signal IN ('bullish', 'neutral', 'bearish')),
      signal_score INTEGER NOT NULL,
      risk_label TEXT NOT NULL DEFAULT 'low-vol' CHECK (risk_label IN ('low-vol', 'elevated-vol', 'shock-vol')),
      risk_score INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL,
      FOREIGN KEY (snapshot_id) REFERENCES commodity_snapshots(id) ON DELETE CASCADE
    )`)
  const commoditySnapshotItemColumns = db.query<{ name: string }, []>('PRAGMA table_info(commodity_snapshot_items)').all()
  const commoditySnapshotItemColumnNames = new Set(commoditySnapshotItemColumns.map((column) => column.name))
  if (!commoditySnapshotItemColumnNames.has('week_change_series_json'))
    db.exec("ALTER TABLE commodity_snapshot_items ADD COLUMN week_change_series_json TEXT NOT NULL DEFAULT '[]'")
  if (!commoditySnapshotItemColumnNames.has('risk_label'))
    db.exec("ALTER TABLE commodity_snapshot_items ADD COLUMN risk_label TEXT NOT NULL DEFAULT 'low-vol'")
  if (!commoditySnapshotItemColumnNames.has('risk_score'))
    db.exec('ALTER TABLE commodity_snapshot_items ADD COLUMN risk_score INTEGER NOT NULL DEFAULT 0')
  db.exec('CREATE INDEX IF NOT EXISTS commodity_snapshot_items_snapshot_idx ON commodity_snapshot_items(snapshot_id, category, symbol)')
  db.exec(`CREATE TABLE IF NOT EXISTS commodity_news_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      article_id INTEGER NOT NULL,
      score REAL NOT NULL,
      matched_terms_json TEXT NOT NULL,
      FOREIGN KEY (snapshot_id) REFERENCES commodity_snapshots(id) ON DELETE CASCADE,
      FOREIGN KEY (article_id) REFERENCES raw_articles(id) ON DELETE CASCADE
    )`)
  db.exec('CREATE INDEX IF NOT EXISTS commodity_news_links_snapshot_symbol_idx ON commodity_news_links(snapshot_id, symbol, score DESC)')
}
