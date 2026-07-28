import { describe, expect, test } from 'bun:test'
import {
  parseCommoditySummaryJson,
  parseNumberArrayJson,
  parseOptimizeJobRequestJson,
  parseOptimizeMetricsJson,
  parsePortfolioDecisionsJson,
  parseStringArrayJson,
  parseSymbolListJson,
} from './dbJsonSchemas'

describe('dbJsonSchemas', () => {
  test('parsePortfolioDecisionsJson rejects invalid rows', () => {
    const valid = JSON.stringify([{ scenarioId: 1, scenarioName: 'A', score: 0.5 }])
    expect(parsePortfolioDecisionsJson(valid)).toHaveLength(1)

    const invalid = JSON.stringify([{ scenarioId: 1 }, { foo: 1 }])
    expect(parsePortfolioDecisionsJson(invalid)).toHaveLength(0)

    expect(parsePortfolioDecisionsJson('not-json', [])).toEqual([])
  })

  test('parseOptimizeMetricsJson validates metrics shape', () => {
    const ok = JSON.stringify({ annualizedReturn: 0.1, annualizedVol: 0.2, sharpeRatio: 0.5 })
    expect(parseOptimizeMetricsJson(ok)).toEqual({ annualizedReturn: 0.1, annualizedVol: 0.2, sharpeRatio: 0.5 })

    expect(parseOptimizeMetricsJson(JSON.stringify({ annualizedReturn: 'bad' }))).toBeNull()
    expect(parseOptimizeMetricsJson(null)).toBeNull()
  })

  test('parseStringArrayJson and parseNumberArrayJson coerce values', () => {
    expect(parseStringArrayJson('["A", 2]')).toEqual(['A', '2'])
    expect(parseStringArrayJson('{"nope":true}')).toEqual([])
    expect(parseNumberArrayJson('[1, "2.5", "bad"]')).toEqual([1, 2.5])
  })

  test('parseSymbolListJson normalizes symbols', () => {
    expect(parseSymbolListJson('[" spy ", "QQQ", "spy"]')).toEqual(['SPY', 'QQQ'])
  })

  test('parseCommoditySummaryJson accepts summary shape', () => {
    expect(parseCommoditySummaryJson('{"universe":12}')).toEqual({ universe: 12 })
    expect(parseCommoditySummaryJson('{"unexpected":true}')).toEqual({})
  })

  test('parseOptimizeJobRequestJson validates persisted optimize requests', () => {
    const ok = JSON.stringify({ n: 12, method: 'max_sharpe', scenarioId: 3 })
    expect(parseOptimizeJobRequestJson(ok)).toEqual({ n: 12, method: 'max_sharpe', scenarioId: 3 })

    expect(parseOptimizeJobRequestJson(JSON.stringify({ n: 2, method: 'max_sharpe' }))).toEqual({
      n: 5,
      method: 'max_sharpe',
    })
    expect(parseOptimizeJobRequestJson(null)).toBeNull()
  })
})
