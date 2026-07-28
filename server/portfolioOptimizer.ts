import { Matrix, inverse } from 'ml-matrix'

import type { QuantMethod } from './types'

const TRADING_DAYS = 252

export type ReturnsMatrix = {
  /** Rows = days, cols = assets (same order as symbols). */
  matrix: number[][]
  symbols: string[]
}

/** Column means (daily). */
const columnMeans = (rows: number[][]) => {
  const n = rows.length
  const k = rows[0]?.length ?? 0
  const mu = new Array(k).fill(0)
  if (n === 0) return mu
  for (let j = 0; j < k; j++) {
    let s = 0
    for (let i = 0; i < n; i++) s += rows[i]![j]!
    mu[j] = s / n
  }
  return mu
}

/** Sample covariance (daily). */
const sampleCov = (rows: number[][], means: number[]) => {
  const n = rows.length
  const k = means.length
  const cov = Matrix.zeros(k, k)
  if (n < 2) return cov
  for (let i = 0; i < n; i++) {
    const row = rows[i]!
    for (let a = 0; a < k; a++) {
      const da = row[a]! - means[a]!
      for (let b = 0; b < k; b++) {
        const db = row[b]! - means[b]!
        cov.set(a, b, cov.get(a, b) + da * db)
      }
    }
  }
  const scale = 1 / (n - 1)
  for (let a = 0; a < k; a++) {
    for (let b = 0; b < k; b++) {
      cov.set(a, b, cov.get(a, b) * scale)
    }
  }
  return cov
}

const ledoitWolfShrink = (cov: Matrix): Matrix => {
  const k = cov.rows
  const diag = Matrix.zeros(k, k)
  let trace = 0
  for (let i = 0; i < k; i++) {
    const v = cov.get(i, i)
    diag.set(i, i, v)
    trace += v
  }
  const mu = trace / k
  const target = Matrix.zeros(k, k)
  for (let i = 0; i < k; i++) target.set(i, i, mu)

  let sumSq = 0
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const d = cov.get(i, j) - target.get(i, j)
      sumSq += d * d
    }
  }
  const shrink = Math.min(1, Math.max(0, sumSq > 0 ? sumSq / (sumSq + k * k) : 0.2))
  const out = Matrix.zeros(k, k)
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      out.set(i, j, (1 - shrink) * cov.get(i, j) + shrink * target.get(i, j))
    }
  }
  return out
}

const projectOntoSimplex = (v: number[]) => {
  const n = v.length
  const u = [...v].sort((a, b) => b - a)
  let rho = n
  let theta = 0
  for (let j = 0; j < n; j++) {
    const s = u.slice(0, j + 1).reduce((a, b) => a + b, 0) - 1
    theta = s / (j + 1)
    if (u[j]! - theta <= 0) {
      rho = j
      break
    }
  }
  const w = new Array(n).fill(0)
  const threshold = rho > 0 ? u[rho - 1]! - (u.slice(0, rho).reduce((a, b) => a + b, 0) - 1) / rho : 0
  for (let i = 0; i < n; i++) {
    w[i] = Math.max(0, v[i]! - threshold)
  }
  const sum = w.reduce((a, b) => a + b, 0)
  return sum > 0 ? w.map((x) => x / sum) : new Array(n).fill(1 / n)
}

/** Maximize Sharpe ratio (daily) with long-only weights; rfDaily annualized as fraction / TRADING_DAYS. */
const maxSharpeLongOnly = (mu: number[], sigma: Matrix, rfDaily: number): number[] => {
  const k = mu.length
  if (k === 0) return []
  const invSigma = inverse(sigma)
  const excess = mu.map((m) => m - rfDaily)
  let w = new Array(k).fill(1 / k)
  const raw = invSigma.mmul(Matrix.columnVector(excess)).to1DArray()
  const pos = raw.map((x) => Math.max(1e-12, x))
  const sum = pos.reduce((a, b) => a + b, 0)
  w = pos.map((x) => x / sum)

  for (let iter = 0; iter < 120; iter++) {
    const wMat = Matrix.columnVector(w)
    const portVar = wMat.transpose().mmul(sigma).mmul(wMat).get(0, 0)
    const portMu = w.reduce((acc, wi, i) => acc + wi * mu[i]!, 0)
    const denom = Math.sqrt(Math.max(portVar, 1e-18))
    const grad = mu.map((m, i) => (m - rfDaily) / denom - ((portMu - rfDaily) * sigma.mmul(wMat).get(i, 0)) / (denom * denom * denom))
    const step = 0.05 / (iter + 10)
    const trial = w.map((wi, i) => wi + step * grad[i]!)
    w = projectOntoSimplex(trial)
  }

  return w
}

const correlationFromCov = (cov: Matrix): Matrix => {
  const k = cov.rows
  const corr = Matrix.zeros(k, k)
  for (let i = 0; i < k; i++) {
    const vi = Math.sqrt(Math.max(cov.get(i, i), 1e-18))
    for (let j = 0; j < k; j++) {
      const vj = Math.sqrt(Math.max(cov.get(j, j), 1e-18))
      corr.set(i, j, cov.get(i, j) / (vi * vj))
    }
  }
  return corr
}

const clusterVarInflation = (cov: Matrix, indices: number[]): number => {
  const n = indices.length
  if (n === 0) return 0
  if (n === 1) return cov.get(indices[0]!, indices[0]!)
  const iv = indices.map((idx) => 1 / Math.max(cov.get(idx, idx), 1e-18))
  const s = iv.reduce((a, b) => a + b, 0)
  const w = iv.map((x) => x / s)
  let v = 0
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      v += w[a]! * cov.get(indices[a]!, indices[b]!) * w[b]!
    }
  }
  return v
}

/** HRP: quasi-diagonal sort + recursive bisection (López de Prado). */
const hrpWeights = (cov: Matrix): number[] => {
  const k = cov.rows
  if (k === 0) return []
  if (k === 1) return [1]

  const corr = correlationFromCov(cov)
  const score = new Array(k).fill(0)
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) score[i]! += corr.get(i, j)
  }
  const order = [...Array(k).keys()].sort((a, b) => score[b]! - score[a]!)

  const w = new Array(k).fill(0)
  const bisect = (indices: number[], mass: number) => {
    if (indices.length === 0) return
    if (indices.length === 1) {
      w[indices[0]!]! += mass
      return
    }
    const mid = Math.floor(indices.length / 2)
    const left = indices.slice(0, mid)
    const right = indices.slice(mid)
    const vL = clusterVarInflation(cov, left)
    const vR = clusterVarInflation(cov, right)
    const den = vL + vR + 1e-18
    const a = vR / den
    bisect(left, mass * a)
    bisect(right, mass * (1 - a))
  }
  bisect(order, 1)
  const sum = w.reduce((acc, x) => acc + x, 0)
  return sum > 0 ? w.map((x) => x / sum) : new Array(k).fill(1 / k)
}

/** Simplified Black–Litterman: blend prior π = δ Σ w_eq with views Q = sample means; weights ~ softmax(μ_BL). */
const blackLittermanWeights = (mu: number[], sigma: Matrix, tau = 0.05): number[] => {
  const k = mu.length
  if (k === 0) return []
  const wEq = new Array(k).fill(1 / k)
  const delta = 3
  const pi = sigma.mmul(Matrix.columnVector(wEq.map((w) => w * delta))).to1DArray()

  const tauSigma = sigma.clone()
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      tauSigma.set(i, j, tauSigma.get(i, j) * tau)
    }
  }

  const omega = Matrix.eye(k, k).mul(tauSigma.trace() / k)
  const tsInv = inverse(tauSigma)
  const oInv = inverse(omega)

  const m1 = tsInv.clone()
  const m2 = oInv.clone()
  const rhs = tsInv.mmul(Matrix.columnVector(pi)).add(oInv.mmul(Matrix.columnVector(mu)))
  const M = m1.add(m2)
  const muBl = inverse(M).mmul(rhs).to1DArray()

  const scores = muBl.map((x) => Math.exp(Math.min(50, Math.max(-50, x * 120))))
  const sum = scores.reduce((a, b) => a + b, 0)
  return sum > 0 ? scores.map((x) => x / sum) : new Array(k).fill(1 / k)
}

export function computeWeights(method: QuantMethod, rows: number[][], rfAnnual = 0.02): number[] {
  const k = rows[0]?.length ?? 0
  if (k === 0) return []
  const muDaily = columnMeans(rows)
  const covRaw = sampleCov(rows, muDaily)
  const sigma = ledoitWolfShrink(covRaw)
  const rfDaily = rfAnnual / TRADING_DAYS

  if (method === 'max_sharpe') return maxSharpeLongOnly(muDaily, sigma, rfDaily)
  if (method === 'hrp') return hrpWeights(sigma)
  return blackLittermanWeights(muDaily, sigma)
}

export function portfolioMetrics(rows: number[][], weights: number[], rfAnnual = 0.02) {
  const muDaily = columnMeans(rows)
  const cov = sampleCov(rows, muDaily)
  const w = Matrix.columnVector(weights)
  const portMeanDaily = weights.reduce((acc, wi, i) => acc + wi * muDaily[i]!, 0)
  const varDaily = w.transpose().mmul(cov).mmul(w).get(0, 0)
  const volDaily = Math.sqrt(Math.max(varDaily, 0))
  const rfDaily = rfAnnual / TRADING_DAYS
  const excess = portMeanDaily - rfDaily
  const sharpeDaily = volDaily > 1e-12 ? excess / volDaily : 0

  return {
    annualizedReturn: portMeanDaily * TRADING_DAYS,
    annualizedVol: volDaily * Math.sqrt(TRADING_DAYS),
    sharpeRatio: sharpeDaily * Math.sqrt(TRADING_DAYS),
  }
}
