import type { ArticleRecord } from './types'

export interface Tokenizer {
  tokenize(value: string): string[]
  getWeights(tokens: string[]): Map<string, number>
}

export type SimilarityInput = {
  clusterHeadline: string
  clusterSources: Set<string>
  clusterTokenWeights: Map<string, number>
  clusterLatestPublishedMs: number
  article: ArticleRecord
  articleTokenWeights: Map<string, number>
  millisPerHour: number
  sameSourcePenalty: number
  recentTimeBoostHours: number
  staleTimeBoostHours: number
  recentTimeBoost: number
  staleTimeBoost: number
  vectorWeight: number
  headlineWeight: number
}

export interface SimilarityService {
  getSimilarity(input: SimilarityInput): number
}

const stopWords = new Set([
  'able',
  'about',
  'above',
  'after',
  'again',
  'against',
  'ahead',
  'also',
  'amid',
  'among',
  'and',
  'are',
  'around',
  'away',
  'back',
  'because',
  'been',
  'before',
  'being',
  'between',
  'both',
  'but',
  'can',
  'chief',
  'could',
  'day',
  'days',
  'did',
  'does',
  'down',
  'due',
  'during',
  'each',
  'early',
  'even',
  'ever',
  'every',
  'few',
  'for',
  'from',
  'get',
  'gets',
  'got',
  'had',
  'has',
  'have',
  'having',
  'her',
  'here',
  'him',
  'his',
  'how',
  'into',
  'its',
  'last',
  'latest',
  'less',
  'like',
  'many',
  'may',
  'more',
  'most',
  'new',
  'news',
  'not',
  'now',
  'off',
  'one',
  'only',
  'onto',
  'other',
  'our',
  'out',
  'over',
  'own',
  'per',
  'put',
  'report',
  'reported',
  'reports',
  'says',
  'said',
  'see',
  'set',
  'she',
  'should',
  'since',
  'some',
  'than',
  'that',
  'the',
  'their',
  'them',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'under',
  'until',
  'upon',
  'was',
  'week',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'why',
  'will',
  'with',
  'would',
  'year',
  'years',
  'you',
  'your',
  'market',
  'markets',
  'stock',
  'stocks',
  'share',
  'shares',
  'update',
  'updates',
  'finance',
  'financial',
  'company',
  'companies',
  'investor',
  'investors',
  'business',
  'today',
  'watch',
  'live',
  'coverage',
  'breaking',
])

const phrasePatterns: Array<[RegExp, string]> = [
  [/\bdata\s+centers?\b/g, 'data center'],
  [/\bartificial\s+intelligence\b/g, 'ai'],
  [/\bmiddle\s+east\b/g, 'middle east'],
  [/\bfederal\s+reserve\b/g, 'federal reserve'],
  [/\binterest\s+rates?\b/g, 'interest rates'],
  [/\brate\s+cuts?\b/g, 'rate cuts'],
  [/\brate\s+hikes?\b/g, 'rate hikes'],
  [/\btreasury\s+yields?\b/g, 'treasury yields'],
  [/\bstock\s+market\b/g, 'stock market'],
  [/\boil\s+prices?\b/g, 'oil prices'],
  [/\bpeace\s+(?:deal|talks?|hopes?)\b/g, 'peace deal'],
  [/\biran\s+war\b/g, 'iran war'],
  [/\bopen\s*ai\b/g, 'openai'],
  [/\bspace\s*x\b/g, 'spacex'],
  [/\bsoft\s*bank\b/g, 'softbank'],
  [/\bbank\s+of\s+england\b/g, 'bank of england'],
  [/\beuropean\s+central\s+bank\b/g, 'ecb'],
]

const entityBoost = new Set([
  'ai',
  'apple',
  'amazon',
  'alphabet',
  'amd',
  'anthropic',
  'arm',
  'avgo',
  'boeing',
  'broadcom',
  'china',
  'coreweave',
  'ecb',
  'fed',
  'google',
  'hormuz',
  'iran',
  'meta',
  'microsoft',
  'musk',
  'netflix',
  'nvidia',
  'openai',
  'spacex',
  'tesla',
  'trump',
  'yahoo',
])

export class KeywordTokenizer implements Tokenizer {
  tokenize(value: string) {
    const normalized = normalizeText(value)
    const phrases = phrasePatterns.flatMap(([pattern, token]) => normalized.match(pattern)?.map(() => token) ?? [])
    const words = normalized
      .replace(/[^a-z0-9$\s]/g, ' ')
      .split(/\s+/)
      .map((token) => normalizeToken(token))
      .filter((token) => token.length > 2 && !stopWords.has(token) && !/^\$?\d+$/.test(token))
    return [...phrases, ...words]
  }

  getWeights(tokens: string[]) {
    const weights = new Map<string, number>()
    tokens.forEach((token) => weights.set(token, (weights.get(token) ?? 0) + 1))
    weights.forEach((count, token) => weights.set(token, count * getTokenPrior(token)))
    return weights
  }
}

export class WeightedTokenSimilarity implements SimilarityService {
  constructor(private readonly tokenizer: Tokenizer = new KeywordTokenizer()) {}

  getSimilarity(input: SimilarityInput) {
    const vectorSimilarity = cosineSimilarity(input.clusterTokenWeights, input.articleTokenWeights)
    const headlineOverlap = jaccardSimilarity(
      new Set(this.tokenizer.tokenize(input.clusterHeadline)),
      new Set(this.tokenizer.tokenize(input.article.headline)),
    )
    const sameSourcePenalty = input.clusterSources.has(input.article.source) ? input.sameSourcePenalty : 0
    const timeDistanceHours = Math.abs(input.clusterLatestPublishedMs - getArticlePublishedMs(input.article)) / input.millisPerHour
    const timeBoost =
      timeDistanceHours <= input.recentTimeBoostHours
        ? input.recentTimeBoost
        : timeDistanceHours <= input.staleTimeBoostHours
          ? input.staleTimeBoost
          : 0
    return vectorSimilarity * input.vectorWeight + headlineOverlap * input.headlineWeight + timeBoost - sameSourcePenalty
  }
}

export const getArticlePublishedMs = (article: ArticleRecord) => {
  const published = article.publishedAt ? new Date(article.publishedAt).getTime() : Number.NaN
  const fetched = new Date(article.fetchedAt).getTime()
  return Number.isFinite(published) ? published : fetched
}

export const mergeTokenWeights = (target: Map<string, number>, source: Map<string, number>) =>
  source.forEach((value, token) => target.set(token, (target.get(token) ?? 0) + value))

export const getTopKeywords = (weights: Map<string, number>, limit: number) =>
  [...weights.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([token]) => token)

export const createClusterKey = (keywords: string[], fallback: string, limit: number) => keywords.slice(0, limit).join('-') || fallback

export const getSourceFamily = (source: string) => {
  const normalized = source.toLowerCase()
  if (normalized.includes('bloomberg')) return 'Bloomberg'
  if (normalized.includes('cnbc')) return 'CNBC'
  if (normalized.includes('investing.com')) return 'Investing.com'
  if (normalized.includes('yahoo')) return 'Yahoo Finance'
  if (normalized.includes('marketwatch')) return 'MarketWatch'
  if (normalized.includes('new york times') || normalized.includes('nyt')) return 'NYT'
  if (normalized.includes('wall street journal') || normalized.includes('wsj') || normalized.includes('dow jones')) return 'Dow Jones'
  if (normalized.includes('guardian')) return 'Guardian'
  if (normalized.includes('bbc')) return 'BBC'
  if (normalized.includes('forbes')) return 'Forbes'
  if (normalized.includes('techcrunch')) return 'TechCrunch'
  if (normalized.includes('ars technica')) return 'Ars Technica'
  if (normalized.includes('verge')) return 'The Verge'
  if (normalized.includes('oilprice')) return 'OilPrice'
  return source
    .replace(/\s+(rss|atom)$/i, '')
    .replace(/\s+(top stories|top news|markets|economics|business|stocks|commodities)$/i, '')
    .trim()
}

export const cosineSimilarity = (left: Map<string, number>, right: Map<string, number>) => {
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  left.forEach((value, token) => {
    dot += value * (right.get(token) ?? 0)
    leftMagnitude += value * value
  })
  right.forEach((value) => {
    rightMagnitude += value * value
  })
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))
}

export const jaccardSimilarity = (left: Set<string>, right: Set<string>) => {
  if (left.size === 0 || right.size === 0) return 0
  const intersection = [...left].filter((token) => right.has(token)).length
  return intersection / (left.size + right.size - intersection)
}

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&/g, ' and ')
    .replace(/\b([a-z0-9]+)'s\b/g, '$1')

const normalizeToken = (token: string) => {
  const cleaned = token.replace(/^\$+/, '').trim()
  if (cleaned.length > 4 && cleaned.endsWith('ies')) return `${cleaned.slice(0, -3)}y`
  if (cleaned.length > 4 && cleaned.endsWith('s') && !cleaned.endsWith('ss')) return cleaned.slice(0, -1)
  return cleaned
}

const getTokenPrior = (token: string) => {
  const phraseBoost = token.includes(' ') ? 1.45 : 1
  const properBoost = entityBoost.has(token) || /^[A-Z]{2,5}$/.test(token) ? 1.35 : 1
  const lengthBoost = token.length > 8 ? 1.25 : token.length > 5 ? 1.1 : 1
  return phraseBoost * properBoost * lengthBoost
}
