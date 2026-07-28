import type { PopularItem, PortfolioCalibrationPair } from './types'

/**
 * Product decision: news-driven portfolio metrics are exploratory attention / narrative
 * signals, not validated short-horizon return forecasts. Calibration pairs those features
 * with realized interval excess for internal sanity checks only.
 */
export const PORTFOLIO_SIGNAL_PRODUCT = {
  framing: 'exploratory' as const,
  /** Default max rows returned by signal-calibration API */
  calibrationDefaultLimit: 80,
  /** Description of the realized leg: interval between portfolio snapshots */
  realizedHorizonNote:
    'Realized excess is measured from one portfolio snapshot to the next (server refresh cadence), not a fixed calendar horizon.',
}

const bullish =
  /\b(surge|surges|rally|rallies|gain|gains|soar|soars|beat|beats|upgrade|upgrades|bull|bulls|highs?|rebound|rebounds|outperform|outperforms|growth|strong|optimis|optimism|positive)\b/gi
const bearish =
  /\b(plunge|plunges|drop|drops|fall|falls|miss|misses|downgrade|downgrades|bear|bears|selloff|crash|lawsuit|weak|pessimis|pessimism|negative|loss|losses|warning|warnings|decline|declines)\b/gi

const symbolPattern = /\b[A-Z]{1,5}\b/g

export function extractSymbolsFromPopularItem(item: PopularItem): Set<string> {
  const out = new Set<string>()
  const parse = (value: string) => {
    for (const m of value.toUpperCase().matchAll(symbolPattern)) out.add(m[0]!)
  }
  parse(`${item.headline} ${item.summary}`)
  for (const keyword of item.keywords) {
    const k = keyword.toUpperCase()
    if (/^[A-Z]{1,5}$/.test(k)) out.add(k)
  }
  return out
}

/**
 * Lexicon tilt in [-1, 1]: bullish minus bearish hits in Trending text, weighted by item score,
 * only for clusters that mention at least one portfolio symbol.
 */
export function computeLexiconTilt(items: readonly PopularItem[], portfolioSymbols: ReadonlySet<string>): number {
  if (items.length === 0 || portfolioSymbols.size === 0) return 0
  let num = 0
  let den = 0
  for (const item of items) {
    const syms = extractSymbolsFromPopularItem(item)
    let touches = false
    for (const s of syms) {
      if (portfolioSymbols.has(s)) {
        touches = true
        break
      }
    }
    if (!touches) continue
    const text = `${item.headline} ${item.summary}`
    const b = (text.match(bullish) ?? []).length
    const be = (text.match(bearish) ?? []).length
    const w = Math.max(0.1, item.score)
    num += (b - be) * w
    den += w
  }
  if (den <= 0) return 0
  return Math.max(-1, Math.min(1, num / (den * 3)))
}

/** Weighted narrative heat: how much the book sits in Trending-attention names (0–1). */
export function computeNewsAlignment(positions: ReadonlyArray<{ weight: number; viewScore: number }>): number {
  if (positions.length === 0) return 0
  let sum = 0
  for (const p of positions) {
    sum += p.weight * Math.min(1, Math.max(0, p.viewScore))
  }
  return Math.max(0, Math.min(1, sum))
}

export function buildCalibrationPairs(
  snapshotsAsc: ReadonlyArray<{
    id: number
    createdAt: string
    expectedReturn: number
    regimeShift: number
    newsAlignment: number
    lexiconTilt: number
    comparison: { comparedSnapshotId: number; excessReturn: number } | null
  }>,
): PortfolioCalibrationPair[] {
  const out: PortfolioCalibrationPair[] = []
  for (let i = 1; i < snapshotsAsc.length; i++) {
    const curr = snapshotsAsc[i]!
    const comp = curr.comparison
    if (!comp) continue
    const prior = snapshotsAsc.find((s) => s.id === comp.comparedSnapshotId)
    if (!prior) continue
    out.push({
      intervalEndSnapshotId: curr.id,
      intervalEndAt: curr.createdAt,
      priorSnapshotId: prior.id,
      priorSnapshotAt: prior.createdAt,
      modelTilt: prior.expectedReturn,
      regimeShift: prior.regimeShift,
      newsAlignment: prior.newsAlignment,
      lexiconTilt: prior.lexiconTilt,
      realizedExcessReturn: comp.excessReturn,
    })
  }
  return out
}

export function summarizeCalibrationCorrelation(pairs: PortfolioCalibrationPair[]): {
  sampleSize: number
  correlationModelTiltVsExcess: number | null
  meanAbsoluteError: number | null
} {
  const withY = pairs.filter((p) => p.realizedExcessReturn !== null && Number.isFinite(p.realizedExcessReturn))
  const n = withY.length
  if (n < 3) return { sampleSize: n, correlationModelTiltVsExcess: null, meanAbsoluteError: null }

  const xs = withY.map((p) => p.modelTilt)
  const ys = withY.map((p) => p.realizedExcessReturn!)
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const vx = xs[i]! - mx
    const vy = ys[i]! - my
    num += vx * vy
    dx += vx * vx
    dy += vy * vy
  }
  const denom = Math.sqrt(dx) * Math.sqrt(dy)
  const correlationModelTiltVsExcess = denom > 1e-12 ? num / denom : null

  let mae = 0
  for (const p of withY) {
    mae += Math.abs(p.realizedExcessReturn! - p.modelTilt)
  }
  const meanAbsoluteError = mae / n

  return { sampleSize: n, correlationModelTiltVsExcess, meanAbsoluteError }
}
