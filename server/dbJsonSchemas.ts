import { z } from 'zod'
import { optimizeJobBodySchema, type OptimizeJobBody } from './requestSchemas'
import type { PortfolioDecision, PortfolioDecisionNewsTheme, PortfolioOptimizeJobMetrics, PositionDecision } from './types'

const optimizeMetricsSchema = z.object({
  annualizedReturn: z.number(),
  annualizedVol: z.number(),
  sharpeRatio: z.number(),
})

const commoditySummarySchema = z.object({
  universe: z.number().optional(),
})

export const parseJsonColumn = <T>(raw: string, schema: z.ZodType<T>, fallback: T): T => {
  try {
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const parseJsonArray = <T>(raw: string, validate: (item: unknown) => item is T, fallback: T[]): T[] => {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return fallback
    return parsed.filter(validate)
  } catch {
    return fallback
  }
}

const isPortfolioDecision = (item: unknown): item is PortfolioDecision =>
  isRecord(item) && typeof item.scenarioId === 'number' && typeof item.scenarioName === 'string' && typeof item.score === 'number'

const isPositionDecision = (item: unknown): item is PositionDecision =>
  isRecord(item) && typeof item.symbol === 'string' && typeof item.scenarioId === 'number'

const isNewsTheme = (item: unknown): item is PortfolioDecisionNewsTheme =>
  isRecord(item) && typeof item.key === 'string' && typeof item.label === 'string'

export const parseStringArrayJson = (raw: string, fallback: string[] = []): string[] => {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return fallback
    return parsed.map((item) => String(item))
  } catch {
    return fallback
  }
}

export const parseNumberArrayJson = (raw: string, fallback: number[] = []): number[] => {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return fallback
    return parsed.map((item) => Number(item)).filter(Number.isFinite)
  } catch {
    return fallback
  }
}

export const parseSymbolListJson = (raw: string, fallback: string[] = []): string[] => {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return fallback
    return [...new Set(parsed.map((s) => String(s).trim().toUpperCase()).filter(Boolean))]
  } catch {
    return fallback
  }
}

export const parseCommoditySummaryJson = (raw: string, fallback: { universe?: number } = {}) =>
  parseJsonColumn(raw, commoditySummarySchema, fallback)

export const parsePortfolioDecisionsJson = (raw: string, fallback: PortfolioDecision[] = []) =>
  parseJsonArray(raw, isPortfolioDecision, fallback)

export const parsePositionDecisionsJson = (raw: string, fallback: PositionDecision[] = []) =>
  parseJsonArray(raw, isPositionDecision, fallback)

export const parseNewsThemesJson = (raw: string, fallback: PortfolioDecisionNewsTheme[] = []) => parseJsonArray(raw, isNewsTheme, fallback)

export const parseOptimizeMetricsJson = (raw: string | null): PortfolioOptimizeJobMetrics | null => {
  if (!raw) return null
  try {
    const parsed = optimizeMetricsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export const parseOptimizeJobRequestJson = (raw: string | null): OptimizeJobBody | null => {
  if (!raw) return null
  try {
    const parsed = optimizeJobBodySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
