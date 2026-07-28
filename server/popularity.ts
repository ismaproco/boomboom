import type {
  ArticleRecord,
  ArticleRepository,
  PopularRankingService,
  PopularRepository,
  PopularResponse,
  PopularSnapshotsResponse,
  RankedPopularCluster,
} from './types'
import {
  cosineSimilarity,
  createClusterKey,
  getArticlePublishedMs,
  getSourceFamily,
  getTopKeywords,
  jaccardSimilarity,
  KeywordTokenizer,
  type Tokenizer,
} from './popularityText'

type ArticleVector = {
  article: ArticleRecord
  tokens: string[]
  tokenSet: Set<string>
  headlineTokenSet: Set<string>
  weights: Map<string, number>
  publishedMs: number
  sourceFamily: string
}

type MutableCluster = RankedPopularCluster & {
  articles: ArticleRecord[]
  sourceSet: Set<string>
  sourceFamilies: Set<string>
  tokenWeights: Map<string, number>
  vectors: ArticleVector[]
}

export type PopularScoringConfig = {
  articleLookbackMs: number
  articleLimit: number
  topLimit: number
  snapshotListLimit: number
  similarityThreshold: number
  mergeSimilarityThreshold: number
  sourceWeight: number
  articleWeight: number
  recencyBase: number
  recencyDecayPerHour: number
  diversityMax: number
  diversityWeight: number
  sameSourcePenalty: number
  sameFamilyPenalty: number
  recentTimeBoostHours: number
  staleTimeBoostHours: number
  recentTimeBoost: number
  staleTimeBoost: number
  vectorWeight: number
  headlineWeight: number
  entityWeight: number
  velocityWeight: number
  specificityWeight: number
  duplicateBurstPenalty: number
  keywordLimit: number
  clusterKeyKeywordLimit: number
  minAgeHours: number
  millisPerHour: number
}

const defaultScoringConfig: PopularScoringConfig = {
  articleLookbackMs: 72 * 60 * 60 * 1000,
  articleLimit: 2500,
  topLimit: 100,
  snapshotListLimit: 1500,
  similarityThreshold: 0.42,
  mergeSimilarityThreshold: 0.58,
  sourceWeight: 48,
  articleWeight: 15,
  recencyBase: 34,
  recencyDecayPerHour: 1.15,
  diversityMax: 22,
  diversityWeight: 4.5,
  sameSourcePenalty: 0.12,
  sameFamilyPenalty: 0.06,
  recentTimeBoostHours: 10,
  staleTimeBoostHours: 30,
  recentTimeBoost: 0.08,
  staleTimeBoost: 0.03,
  vectorWeight: 0.58,
  headlineWeight: 0.18,
  entityWeight: 0.24,
  velocityWeight: 16,
  specificityWeight: 10,
  duplicateBurstPenalty: 18,
  keywordLimit: 8,
  clusterKeyKeywordLimit: 5,
  minAgeHours: 0.25,
  millisPerHour: 3_600_000,
}

export class KeywordPopularityRankingService implements PopularRankingService {
  constructor(
    private readonly config: PopularScoringConfig = defaultScoringConfig,
    private readonly tokenizer: Tokenizer = new KeywordTokenizer(),
  ) {}

  rank(articles: ArticleRecord[]) {
    const vectors = this.vectorize(articles)
    return this.rankClusters(this.cluster(vectors))
      .slice(0, this.config.topLimit)
      .map(
        ({
          articles: _articles,
          sourceSet: _sourceSet,
          sourceFamilies: _sourceFamilies,
          tokenWeights: _tokenWeights,
          vectors: _vectors,
          ...cluster
        }) => cluster,
      )
  }

  private vectorize(articles: ArticleRecord[]): ArticleVector[] {
    const raw = articles
      .map((article) => {
        const tokens = this.tokenizer.tokenize(`${article.headline} ${article.summary}`)
        return { article, tokens }
      })
      .filter((entry) => entry.tokens.length > 0)
    const documentFrequency = new Map<string, number>()

    raw.forEach((entry) => {
      new Set(entry.tokens).forEach((token) => documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1))
    })

    const totalDocuments = Math.max(1, raw.length)
    return raw.map(({ article, tokens }) => {
      const baseWeights = this.tokenizer.getWeights(tokens)
      const weights = new Map<string, number>()
      baseWeights.forEach((value, token) => {
        const df = documentFrequency.get(token) ?? 1
        const idf = Math.log((totalDocuments + 1) / (df + 0.5)) + 1
        weights.set(token, value * idf)
      })

      return {
        article,
        tokens,
        tokenSet: new Set(tokens),
        headlineTokenSet: new Set(this.tokenizer.tokenize(article.headline)),
        weights,
        publishedMs: getArticlePublishedMs(article),
        sourceFamily: getSourceFamily(article.source),
      }
    })
  }

  private cluster(vectors: ArticleVector[]) {
    if (vectors.length === 0) return []
    const unionFind = new UnionFind(vectors.length)
    const blocks = this.buildBlocks(vectors)

    blocks.forEach((indexes) => {
      const ordered = [...indexes].sort((left, right) => left - right)
      for (let i = 0; i < ordered.length; i += 1) {
        for (let j = i + 1; j < ordered.length; j += 1) {
          const leftIndex = ordered[i]!
          const rightIndex = ordered[j]!
          if (unionFind.find(leftIndex) === unionFind.find(rightIndex)) continue
          const similarity = this.getArticleSimilarity(vectors[leftIndex]!, vectors[rightIndex]!)
          if (similarity >= this.config.similarityThreshold) unionFind.union(leftIndex, rightIndex)
        }
      }
    })

    let clusters = this.buildClusters(vectors, unionFind)
    clusters = this.mergeSimilarClusters(clusters)
    return clusters
  }

  private buildBlocks(vectors: ArticleVector[]) {
    const tokenFrequency = new Map<string, number>()
    vectors.forEach((vector) => vector.tokenSet.forEach((token) => tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1)))
    const maxBlockSize = Math.max(12, Math.floor(vectors.length * 0.18))
    const blocks = new Map<string, Set<number>>()

    vectors.forEach((vector, index) => {
      const rankedTokens = [...vector.weights.entries()]
        .filter(([token]) => (tokenFrequency.get(token) ?? 0) <= maxBlockSize)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([token]) => token)
      const blockTokens = rankedTokens.length > 0 ? rankedTokens : [...vector.tokenSet].slice(0, 4)
      blockTokens.forEach((token) => {
        const block = blocks.get(token) ?? new Set<number>()
        block.add(index)
        blocks.set(token, block)
      })
    })

    return [...blocks.values()].filter((block) => block.size > 1 && block.size <= Math.max(60, maxBlockSize * 2))
  }

  private buildClusters(vectors: ArticleVector[], unionFind: UnionFind) {
    const groups = new Map<number, ArticleVector[]>()
    vectors.forEach((vector, index) => {
      const root = unionFind.find(index)
      const group = groups.get(root) ?? []
      group.push(vector)
      groups.set(root, group)
    })
    return [...groups.values()].map((group) => this.createCluster(group))
  }

  private createCluster(vectors: ArticleVector[]): MutableCluster {
    const tokenWeights = new Map<string, number>()
    const sourceSet = new Set<string>()
    const sourceFamilies = new Set<string>()
    let latestPublishedMs = 0
    let earliestPublishedMs = Number.POSITIVE_INFINITY

    vectors.forEach((vector) => {
      vector.weights.forEach((value, token) => tokenWeights.set(token, (tokenWeights.get(token) ?? 0) + value))
      sourceSet.add(vector.article.source)
      sourceFamilies.add(vector.sourceFamily)
      latestPublishedMs = Math.max(latestPublishedMs, vector.publishedMs)
      earliestPublishedMs = Math.min(earliestPublishedMs, vector.publishedMs)
    })

    const representative = this.selectRepresentative(vectors, tokenWeights)
    const keywords = getTopKeywords(tokenWeights, this.config.keywordLimit)

    return {
      key: createClusterKey(keywords, String(representative.article.id), this.config.clusterKeyKeywordLimit),
      headline: representative.article.headline,
      summary: representative.article.summary,
      section: this.getMajoritySection(vectors) ?? representative.article.section,
      primarySource: representative.article.source,
      sourceCount: sourceSet.size,
      articleCount: vectors.length,
      sources: [...sourceSet].sort(),
      articleIds: vectors.map((vector) => vector.article.id),
      keywords,
      latestPublishedMs,
      earliestPublishedMs: Number.isFinite(earliestPublishedMs) ? earliestPublishedMs : latestPublishedMs,
      score: 0,
      articles: vectors.map((vector) => vector.article),
      sourceSet,
      sourceFamilies,
      tokenWeights,
      vectors,
    }
  }

  private mergeSimilarClusters(clusters: MutableCluster[]) {
    if (clusters.length < 2) return clusters
    const unionFind = new UnionFind(clusters.length)

    for (let i = 0; i < clusters.length; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        if (unionFind.find(i) === unionFind.find(j)) continue
        const left = clusters[i]!
        const right = clusters[j]!
        const sharedFamilies = intersects(left.sourceFamilies, right.sourceFamilies)
        const similarity = cosineSimilarity(left.tokenWeights, right.tokenWeights)
        const entityOverlap = jaccardSimilarity(new Set(left.keywords.slice(0, 6)), new Set(right.keywords.slice(0, 6)))
        const timeDistanceHours = Math.abs(left.latestPublishedMs - right.latestPublishedMs) / this.config.millisPerHour
        if ((similarity >= this.config.mergeSimilarityThreshold || entityOverlap >= 0.42) && (sharedFamilies || timeDistanceHours <= 24))
          unionFind.union(i, j)
      }
    }

    const groups = new Map<number, ArticleVector[]>()
    clusters.forEach((cluster, index) => {
      const root = unionFind.find(index)
      const group = groups.get(root) ?? []
      group.push(...cluster.vectors)
      groups.set(root, group)
    })
    return [...groups.values()].map((group) => this.createCluster(group))
  }

  private rankClusters(clusters: MutableCluster[]) {
    const now = Date.now()

    return clusters
      .map((cluster) => {
        const ageHours = Math.max(this.config.minAgeHours, (now - cluster.latestPublishedMs) / this.config.millisPerHour)
        const independentSourceScore = Math.log2(cluster.sourceFamilies.size + 1) * this.config.sourceWeight
        const articleScore = Math.log2(Math.min(cluster.articles.length, 12) + 1) * this.config.articleWeight
        const recencyScore = Math.max(0, this.config.recencyBase - ageHours * this.config.recencyDecayPerHour)
        const diversityScore =
          cluster.sourceFamilies.size > 1
            ? Math.min(this.config.diversityMax, cluster.sourceFamilies.size * this.config.diversityWeight)
            : 0
        const recentArticleCount = cluster.vectors.filter((vector) => now - vector.publishedMs <= 6 * this.config.millisPerHour).length
        const velocityScore = Math.min(this.config.velocityWeight, recentArticleCount * 3)
        const specificityScore = Math.min(this.config.specificityWeight, averageTopWeight(cluster.tokenWeights, 5) / 4)
        const duplicatePenalty =
          cluster.sourceFamilies.size === 1 && cluster.articles.length > 3
            ? Math.min(this.config.duplicateBurstPenalty, (cluster.articles.length - 3) * 2.8)
            : 0
        cluster.score =
          independentSourceScore + articleScore + recencyScore + diversityScore + velocityScore + specificityScore - duplicatePenalty
        return cluster
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.sourceFamilies.size - left.sourceFamilies.size ||
          right.sourceSet.size - left.sourceSet.size ||
          right.latestPublishedMs - left.latestPublishedMs,
      )
  }

  private getArticleSimilarity(left: ArticleVector, right: ArticleVector) {
    const vectorSimilarity = cosineSimilarity(left.weights, right.weights)
    const headlineOverlap = jaccardSimilarity(left.headlineTokenSet, right.headlineTokenSet)
    const entityOverlap = jaccardSimilarity(getEntityTokens(left), getEntityTokens(right))
    const timeDistanceHours = Math.abs(left.publishedMs - right.publishedMs) / this.config.millisPerHour
    const timeBoost =
      timeDistanceHours <= this.config.recentTimeBoostHours
        ? this.config.recentTimeBoost
        : timeDistanceHours <= this.config.staleTimeBoostHours
          ? this.config.staleTimeBoost
          : 0
    const sameSourcePenalty =
      left.article.source === right.article.source
        ? this.config.sameSourcePenalty
        : left.sourceFamily === right.sourceFamily
          ? this.config.sameFamilyPenalty
          : 0
    return (
      vectorSimilarity * this.config.vectorWeight +
      headlineOverlap * this.config.headlineWeight +
      entityOverlap * this.config.entityWeight +
      timeBoost -
      sameSourcePenalty
    )
  }

  private selectRepresentative(vectors: ArticleVector[], centroid: Map<string, number>) {
    return [...vectors].sort((left, right) => {
      const leftScore =
        cosineSimilarity(left.weights, centroid) + (left.article.summary ? 0.03 : 0) + (left.publishedMs / Date.now()) * 0.01
      const rightScore =
        cosineSimilarity(right.weights, centroid) + (right.article.summary ? 0.03 : 0) + (right.publishedMs / Date.now()) * 0.01
      return rightScore - leftScore
    })[0]!
  }

  private getMajoritySection(vectors: ArticleVector[]) {
    const counts = new Map<string, number>()
    vectors.forEach((vector) => counts.set(vector.article.section, (counts.get(vector.article.section) ?? 0) + 1))
    return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0]
  }
}

export class PopularSnapshotService {
  private ensuring = false

  constructor(
    private readonly articles: ArticleRepository,
    private readonly popular: PopularRepository,
    private readonly ranking: PopularRankingService,
    private readonly refreshMs: number,
    private readonly retentionMs: number,
    private readonly scoringConfig: Pick<
      PopularScoringConfig,
      'articleLookbackMs' | 'articleLimit' | 'snapshotListLimit'
    > = defaultScoringConfig,
  ) {}

  getSnapshots(): PopularSnapshotsResponse {
    return { updatedAt: new Date().toISOString(), snapshots: this.popular.getSnapshotSummaries(this.scoringConfig.snapshotListLimit) }
  }

  /** Read-only; snapshots are built by the scheduler and news refresh. */
  getLatest(): PopularResponse {
    return this.getSnapshotResponse()
  }

  getById(snapshotId: string): PopularResponse {
    return this.getSnapshotResponse(snapshotId)
  }

  private getSnapshotResponse(snapshotId?: string): PopularResponse {
    const snapshot = snapshotId ? this.popular.getSnapshot(Number(snapshotId)) : this.popular.getLatestSnapshot()
    const previousSnapshot = snapshot ? this.popular.getPreviousSnapshot(snapshot.createdAt) : null
    return { updatedAt: new Date().toISOString(), snapshot, previousSnapshot, items: snapshot ? this.popular.getItems(snapshot.id) : [] }
  }

  ensureSnapshot() {
    if (this.ensuring) return
    this.ensuring = true
    try {
      const latest = this.popular.getLatestSnapshot()
      const latestMs = latest ? new Date(latest.createdAt).getTime() : 0
      if (latest && Number.isFinite(latestMs) && Date.now() - latestMs < this.refreshMs) return

      const createdAt = new Date().toISOString()
      const sinceIso = new Date(Date.now() - this.scoringConfig.articleLookbackMs).toISOString()
      const articles = this.articles.getRecentArticles(sinceIso, this.scoringConfig.articleLimit)
      const previousRanks = latest ? this.popular.getPreviousRanks(latest.id) : new Map<string, number>()
      this.popular.saveSnapshot({ createdAt, articleCount: articles.length, clusters: this.ranking.rank(articles), previousRanks })
      this.popular.cleanup(new Date(new Date(createdAt).getTime() - this.retentionMs).toISOString())
    } finally {
      this.ensuring = false
    }
  }
}

class UnionFind {
  private readonly parents: number[]
  private readonly ranks: number[]

  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_value, index) => index)
    this.ranks = Array.from({ length: size }, () => 0)
  }

  find(index: number): number {
    const parent = this.parents[index]!
    if (parent === index) return index
    const root = this.find(parent)
    this.parents[index] = root
    return root
  }

  union(left: number, right: number) {
    const leftRoot = this.find(left)
    const rightRoot = this.find(right)
    if (leftRoot === rightRoot) return
    const leftRank = this.ranks[leftRoot]!
    const rightRank = this.ranks[rightRoot]!
    if (leftRank < rightRank) {
      this.parents[leftRoot] = rightRoot
      return
    }
    this.parents[rightRoot] = leftRoot
    if (leftRank === rightRank) this.ranks[leftRoot] = leftRank + 1
  }
}

const getEntityTokens = (vector: ArticleVector) => new Set([...vector.tokenSet].filter((token) => token.includes(' ') || token.length > 4))
const averageTopWeight = (weights: Map<string, number>, limit: number) => {
  const top = [...weights.values()].sort((left, right) => right - left).slice(0, limit)
  return top.length === 0 ? 0 : top.reduce((sum, value) => sum + value, 0) / top.length
}
const intersects = <T>(left: Set<T>, right: Set<T>) => [...left].some((item) => right.has(item))
