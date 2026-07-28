import type { ArticlePageRequest, PageRequest, PortfolioScenarioInput } from './types'
import {
  type OptimizeJobBody,
  optimizeJobBodySchema,
  parsePortfolioScenarioCreate,
  parseWithSchema,
  portfolioScenarioPatchSchema,
} from './requestSchemas'

export type { OptimizeJobBody }

const defaultPageSize = 100
export const maxArticleListItems = 500

type RequestQuery = Record<string, string | undefined>

const parsePage = (value: string | undefined) => Math.max(1, Number.parseInt(value ?? '1', 10) || 1)

export const parsePositiveIntParam = (value: string | undefined) => {
  const id = Number.parseInt(value ?? '', 10)
  return Number.isFinite(id) && id > 0 ? id : null
}

export const getPageRequest = (query: RequestQuery, pageSize = defaultPageSize): PageRequest => ({
  page: parsePage(query.page),
  pageSize,
})

export const getArticlePageRequest = (query: RequestQuery, pageSize = defaultPageSize): ArticlePageRequest => {
  const base = {
    ...getPageRequest(query, pageSize),
    ...(query.q?.trim() ? { searchTerm: query.q.trim() } : {}),
  }
  if (query.all !== '1' && query.all !== 'true') return base
  const limitRaw = Number.parseInt(query.limit ?? String(maxArticleListItems), 10)
  const maxItems = Math.min(maxArticleListItems, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : maxArticleListItems))
  return { ...base, page: 1, maxItems }
}

export const parseScenarioIdQuery = (raw: string | undefined) => {
  if (raw === undefined || raw === '') return null
  const id = Number.parseInt(raw, 10)
  return Number.isFinite(id) && id > 0 ? id : null
}

export const parseScenarioCreateBody = (body: Record<string, unknown>): PortfolioScenarioInput | null => parsePortfolioScenarioCreate(body)

export const parseScenarioPatchBody = (body: Record<string, unknown>): Partial<PortfolioScenarioInput> | null => {
  const result = parseWithSchema(portfolioScenarioPatchSchema, body)
  return result.success ? (result.data as Partial<PortfolioScenarioInput>) : null
}

export const parseOptimizeJobBody = (body: Record<string, unknown>): OptimizeJobBody | null => {
  const result = parseWithSchema(optimizeJobBodySchema, body)
  if (!result.success) return null
  const data = result.data
  return {
    n: data.n,
    method: data.method,
    seed: data.seed,
    name: data.name,
    universePolicy: data.universePolicy,
    keepCount: data.keepCount,
    scenarioId: data.scenarioId,
  }
}

export const parseDecisionRunLimit = (value: unknown) => {
  const limit = Number(value)
  return Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.floor(limit))) : 30
}
