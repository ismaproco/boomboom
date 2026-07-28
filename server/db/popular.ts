import type { Database } from 'bun:sqlite'
import { parseStringArrayJson } from '../dbJsonSchemas'
import type { PopularItem, PopularSnapshot, PopularSnapshotSummary, RankedPopularCluster } from '../types'

type PopularItemSummaryRow = {
  snapshotId: number
  clusterKey: string
  rank: number
  previousRank: number | null
  rankDelta: number | null
  score: number
  headline: string
  section: string
  sourceCount: number
  articleCount: number
  keywordsJson: string
}

type PopularItemSummary = Omit<PopularItemSummaryRow, 'keywordsJson'> & {
  keywords: string[]
}

const mapPopularItemSummary = (row: PopularItemSummaryRow): PopularItemSummary => ({
  ...row,
  keywords: parseStringArrayJson(row.keywordsJson),
})

const toPopularPreview = (item: PopularItemSummary | undefined): PopularSnapshotSummary['topCluster'] =>
  item
    ? {
        rank: item.rank,
        previousRank: item.previousRank,
        rankDelta: item.rankDelta,
        score: item.score,
        headline: item.headline,
        section: item.section,
        sourceCount: item.sourceCount,
        articleCount: item.articleCount,
        keywords: item.keywords.slice(0, 6),
      }
    : null

const getTopCounts = (values: string[], limit: number): Array<{ label: string; count: number }> => {
  const counts = new Map<string, number>()
  values.forEach((value) => {
    const label = value.trim()
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
  })
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }))
}

export class PopularDb {
  constructor(readonly db: Database) {}

  getLatestSnapshot() {
    return (
      this.db
        .query<
          PopularSnapshot,
          []
        >('SELECT id, created_at as createdAt, article_count as articleCount, cluster_count as clusterCount FROM popular_snapshots ORDER BY created_at DESC, id DESC LIMIT 1')
        .get() ?? null
    )
  }

  getSnapshot(snapshotId: number) {
    return (
      this.db
        .query<
          PopularSnapshot,
          [number]
        >('SELECT id, created_at as createdAt, article_count as articleCount, cluster_count as clusterCount FROM popular_snapshots WHERE id = ? LIMIT 1')
        .get(snapshotId) ?? null
    )
  }

  getPreviousSnapshot(createdAt: string) {
    return (
      this.db
        .query<
          PopularSnapshot,
          [string]
        >('SELECT id, created_at as createdAt, article_count as articleCount, cluster_count as clusterCount FROM popular_snapshots WHERE created_at < ? ORDER BY created_at DESC, id DESC LIMIT 1')
        .get(createdAt) ?? null
    )
  }

  getSnapshots(limit: number) {
    return this.db
      .query<
        PopularSnapshot,
        [number]
      >('SELECT id, created_at as createdAt, article_count as articleCount, cluster_count as clusterCount FROM popular_snapshots ORDER BY created_at DESC LIMIT ?')
      .all(limit)
  }

  getSnapshotSummaries(limit: number): PopularSnapshotSummary[] {
    const snapshots = this.getSnapshots(limit)
    if (snapshots.length === 0) return []

    const placeholders = snapshots.map(() => '?').join(', ')
    const rows = this.db
      .query<PopularItemSummaryRow, number[]>(
        `SELECT snapshot_id as snapshotId, cluster_key as clusterKey, rank, previous_rank as previousRank, rank_delta as rankDelta, score, headline, section, source_count as sourceCount, article_count as articleCount, keywords_json as keywordsJson
      FROM popular_items
      WHERE snapshot_id IN (${placeholders})
      ORDER BY snapshot_id DESC, rank ASC`,
      )
      .all(...snapshots.map((snapshot) => snapshot.id))

    const itemsBySnapshot = new Map<number, PopularItemSummary[]>()
    rows.forEach((row) => {
      const item = mapPopularItemSummary(row)
      const items = itemsBySnapshot.get(item.snapshotId) ?? []
      items.push(item)
      itemsBySnapshot.set(item.snapshotId, items)
    })

    return snapshots.map((snapshot, index) => {
      const items = itemsBySnapshot.get(snapshot.id) ?? []
      const previousSnapshot = snapshots[index + 1] ?? null
      const previousItems = previousSnapshot ? (itemsBySnapshot.get(previousSnapshot.id) ?? []) : []
      const currentKeys = new Set(items.map((item) => item.clusterKey))
      const dropped = previousItems.filter((item) => !currentKeys.has(item.clusterKey))
      const risingItems = items.filter((item) => (item.rankDelta ?? 0) > 0)
      const fallingItems = items.filter((item) => (item.rankDelta ?? 0) < 0)
      const newItems = items.filter((item) => item.previousRank === null)

      return {
        ...snapshot,
        articleDelta: previousSnapshot ? snapshot.articleCount - previousSnapshot.articleCount : null,
        clusterDelta: previousSnapshot ? snapshot.clusterCount - previousSnapshot.clusterCount : null,
        newCount: newItems.length,
        risingCount: risingItems.length,
        fallingCount: fallingItems.length,
        stableCount: items.filter((item) => item.previousRank !== null && item.rankDelta === 0).length,
        droppedCount: dropped.length,
        topCluster: toPopularPreview(items[0]),
        topNewCluster: toPopularPreview(newItems.sort((left, right) => left.rank - right.rank)[0]),
        biggestRiser: toPopularPreview(risingItems.sort((left, right) => (right.rankDelta ?? 0) - (left.rankDelta ?? 0))[0]),
        biggestFaller: toPopularPreview(fallingItems.sort((left, right) => (left.rankDelta ?? 0) - (right.rankDelta ?? 0))[0]),
        topDropped: toPopularPreview(dropped.sort((left, right) => left.rank - right.rank)[0]),
        leadingSections: getTopCounts(
          items.map((item) => item.section),
          4,
        ),
        leadingKeywords: getTopCounts(
          items.flatMap((item) => item.keywords.slice(0, 5)),
          8,
        ),
      }
    })
  }

  getItems(snapshotId: number) {
    return this.db
      .query<
        Omit<PopularItem, 'sources' | 'articleIds' | 'keywords'> & { sourcesJson: string; articleIdsJson: string; keywordsJson: string },
        [number]
      >(
        `SELECT id, snapshot_id as snapshotId, rank, previous_rank as previousRank, rank_delta as rankDelta, score, headline, summary, section, primary_source as primarySource, source_count as sourceCount, article_count as articleCount, sources_json as sourcesJson, article_ids_json as articleIdsJson, keywords_json as keywordsJson, latest_published_at as latestPublishedAt, earliest_published_at as earliestPublishedAt FROM popular_items WHERE snapshot_id = ? ORDER BY rank ASC`,
      )
      .all(snapshotId)
      .map((item) => ({
        ...item,
        sources: parseStringArrayJson(item.sourcesJson),
        articleIds: parseStringArrayJson(item.articleIdsJson).map(Number).filter(Number.isFinite),
        keywords: parseStringArrayJson(item.keywordsJson),
      }))
  }

  getPreviousRanks(snapshotId: number) {
    const ranks = this.db
      .query<
        { clusterKey: string; rank: number },
        [number]
      >('SELECT cluster_key as clusterKey, rank FROM popular_items WHERE snapshot_id = ?')
      .all(snapshotId)
    return new Map(ranks.map((item) => [item.clusterKey, item.rank]))
  }

  saveSnapshot(input: { createdAt: string; articleCount: number; clusters: RankedPopularCluster[]; previousRanks: Map<string, number> }) {
    this.db.transaction(() => {
      const snapshotResult = this.db
        .prepare('INSERT INTO popular_snapshots (created_at, article_count, cluster_count) VALUES (?, ?, ?)')
        .run(input.createdAt, input.articleCount, input.clusters.length)
      const snapshotId = Number(snapshotResult.lastInsertRowid)
      const insertItem = this.db.prepare(
        'INSERT INTO popular_items (snapshot_id, cluster_key, rank, previous_rank, rank_delta, score, headline, summary, section, primary_source, source_count, article_count, sources_json, article_ids_json, keywords_json, latest_published_at, earliest_published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )

      input.clusters.forEach((cluster, index) => {
        const rank = index + 1
        const previousRank = input.previousRanks.get(cluster.key) ?? null
        insertItem.run(
          snapshotId,
          cluster.key,
          rank,
          previousRank,
          previousRank ? previousRank - rank : null,
          Number(cluster.score.toFixed(2)),
          cluster.headline,
          cluster.summary,
          cluster.section,
          cluster.primarySource,
          cluster.sourceCount,
          cluster.articleCount,
          JSON.stringify(cluster.sources),
          JSON.stringify(cluster.articleIds),
          JSON.stringify(cluster.keywords),
          Number.isFinite(cluster.latestPublishedMs) ? new Date(cluster.latestPublishedMs).toISOString() : null,
          Number.isFinite(cluster.earliestPublishedMs) ? new Date(cluster.earliestPublishedMs).toISOString() : null,
        )
      })
    })()
  }

  cleanup(cutoffIso: string) {
    const oldSnapshots = this.db.query<{ id: number }, [string]>('SELECT id FROM popular_snapshots WHERE created_at < ?').all(cutoffIso)
    oldSnapshots.forEach((snapshot) => {
      this.db.prepare('DELETE FROM popular_items WHERE snapshot_id = ?').run(snapshot.id)
      this.db.prepare('DELETE FROM popular_snapshots WHERE id = ?').run(snapshot.id)
    })
  }
}
