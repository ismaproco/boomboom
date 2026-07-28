import { z } from 'zod'
import type { PortfolioScenarioInput, QuantMethod, QuantUniversePolicy } from './types'

const noveltyProfileSchema = z.enum(['low', 'medium', 'high'])
const quantMethodSchema = z.enum(['max_sharpe', 'hrp', 'black_litterman'])
const quantUniversePolicySchema = z.enum(['reroll', 'keep', 'keep_some'])
const refreshModeSchema = z.enum(['news', 'quant'])
const scenarioSourceSchema = z.enum(['manual', 'optimized'])

const symbolsSchema = z.union([z.array(z.union([z.string(), z.number()])).min(1), z.string().min(1)])

const normalizeSymbols = (value: z.infer<typeof symbolsSchema>): string[] => {
  const raw = Array.isArray(value) ? value.map(String) : value.split(/[\s,]+/)
  return [...new Set(raw.map((s) => s.trim().toUpperCase()).filter(Boolean))]
}

const portfolioScenarioCreateSchema = z.object({
  name: z.string().trim().min(1),
  symbols: symbolsSchema,
  noveltyProfile: noveltyProfileSchema,
  maxWeightPerAsset: z.coerce.number().min(0.05).max(0.5).optional(),
})

export const parsePortfolioScenarioCreate = (body: unknown): PortfolioScenarioInput | null => {
  const result = portfolioScenarioCreateSchema.safeParse(body)
  if (!result.success) return null
  const symbols = normalizeSymbols(result.data.symbols)
  if (symbols.length === 0) return null
  return {
    name: result.data.name,
    symbols,
    noveltyProfile: result.data.noveltyProfile,
    maxWeightPerAsset: result.data.maxWeightPerAsset ?? 0.15,
  }
}

export const portfolioScenarioPatchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    symbols: symbolsSchema.optional(),
    noveltyProfile: noveltyProfileSchema.optional(),
    maxWeightPerAsset: z.coerce.number().min(0.05).max(0.5).optional(),
    refreshMode: refreshModeSchema.optional(),
    blendTrending: z.boolean().optional(),
    quantMethod: quantMethodSchema.optional(),
    quantTargetN: z.coerce.number().optional(),
    quantReoptimizeMs: z.coerce.number().optional(),
    quantReoptimizeMinutes: z.coerce.number().optional(),
    quantUniversePolicy: quantUniversePolicySchema.optional(),
    quantKeepCount: z.coerce.number().optional(),
    quantNextRunAt: z.string().optional(),
    source: scenarioSourceSchema.optional(),
  })
  .transform((body) => {
    const out: Record<string, unknown> = {}
    if (body.name !== undefined) out.name = body.name
    if (body.symbols !== undefined) {
      const symbols = normalizeSymbols(body.symbols)
      if (symbols.length > 0) out.symbols = symbols
    }
    if (body.noveltyProfile !== undefined) out.noveltyProfile = body.noveltyProfile
    if (body.maxWeightPerAsset !== undefined) out.maxWeightPerAsset = body.maxWeightPerAsset
    if (body.refreshMode !== undefined) out.refreshMode = body.refreshMode
    if (body.blendTrending !== undefined) out.blendTrending = body.blendTrending
    if (body.quantMethod !== undefined) out.quantMethod = body.quantMethod as QuantMethod
    if (body.quantTargetN !== undefined) out.quantTargetN = Math.floor(body.quantTargetN)
    if (body.quantReoptimizeMs !== undefined) out.quantReoptimizeMs = Math.max(60_000, body.quantReoptimizeMs)
    if (body.quantReoptimizeMinutes !== undefined)
      out.quantReoptimizeMs = Math.max(60_000, Math.round(body.quantReoptimizeMinutes * 60_000))
    if (body.quantUniversePolicy !== undefined) out.quantUniversePolicy = body.quantUniversePolicy as QuantUniversePolicy
    if (body.quantKeepCount !== undefined) out.quantKeepCount = Math.max(0, Math.floor(body.quantKeepCount))
    if (body.quantNextRunAt !== undefined) out.quantNextRunAt = body.quantNextRunAt
    if (body.source !== undefined) out.source = body.source
    return out
  })

export const optimizeJobBodySchema = z
  .object({
    n: z.coerce.number(),
    method: quantMethodSchema,
    seed: z.coerce.number().optional(),
    name: z.string().optional(),
    universePolicy: quantUniversePolicySchema.optional(),
    keepCount: z.coerce.number().optional(),
    scenarioId: z.coerce.number().optional(),
  })
  .transform((body) => ({
    n: Math.min(50, Math.max(5, Math.floor(body.n))),
    method: body.method as QuantMethod,
    seed: body.seed !== undefined && Number.isFinite(body.seed) ? Math.floor(body.seed) : undefined,
    name: body.name,
    universePolicy: body.universePolicy as QuantUniversePolicy | undefined,
    keepCount: body.keepCount !== undefined && Number.isFinite(body.keepCount) ? Math.max(0, Math.floor(body.keepCount)) : undefined,
    scenarioId: body.scenarioId !== undefined && body.scenarioId > 0 ? Math.floor(body.scenarioId) : undefined,
  }))

export const portfolioBacktestBodySchema = z.object({
  scenarioIds: z.array(z.coerce.number().int().positive()).optional(),
  lookbackDays: z.coerce.number().optional(),
  feeBps: z.coerce.number().optional(),
  slippageBps: z.coerce.number().optional(),
})

export const tickerHistorySyncBodySchema = z.object({
  symbols: z.array(z.union([z.string(), z.number()])).optional(),
})

export type OptimizeJobBody = {
  n: number
  method: QuantMethod
  seed?: number
  name?: string
  universePolicy?: QuantUniversePolicy
  keepCount?: number
  scenarioId?: number
}

export const parseWithSchema = <T>(schema: z.ZodType<T>, body: unknown) => schema.safeParse(body)
