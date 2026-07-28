import { describe, expect, test } from 'bun:test'
import {
  getArticlePageRequest,
  getPageRequest,
  maxArticleListItems,
  parseOptimizeJobBody,
  parsePositiveIntParam,
  parseScenarioCreateBody,
  parseScenarioIdQuery,
  parseScenarioPatchBody,
} from './requestParams'

describe('request params', () => {
  test('defaults invalid pages to the first page', () => {
    expect(getPageRequest({}).page).toBe(1)
    expect(getPageRequest({ page: '0' }).page).toBe(1)
    expect(getPageRequest({ page: 'nope' }).page).toBe(1)
  })

  test('parses article search when present', () => {
    expect(getArticlePageRequest({ page: '3', q: '  chips  ' })).toEqual({
      page: 3,
      pageSize: 100,
      searchTerm: 'chips',
    })
  })

  test('parses bounded list-all article requests', () => {
    expect(getArticlePageRequest({ all: '1' })).toEqual({
      page: 1,
      pageSize: 100,
      maxItems: maxArticleListItems,
    })
    expect(getArticlePageRequest({ all: 'true', limit: '1200' })).toEqual({
      page: 1,
      pageSize: 100,
      maxItems: maxArticleListItems,
    })
    expect(getArticlePageRequest({ all: '1', limit: '250' }).maxItems).toBe(250)
  })

  test('parses positive integer path params', () => {
    expect(parsePositiveIntParam(undefined)).toBeNull()
    expect(parsePositiveIntParam('abc')).toBeNull()
    expect(parsePositiveIntParam('12')).toBe(12)
  })

  test('accepts only positive scenario ids', () => {
    expect(parseScenarioIdQuery(undefined)).toBeNull()
    expect(parseScenarioIdQuery('')).toBeNull()
    expect(parseScenarioIdQuery('-1')).toBeNull()
    expect(parseScenarioIdQuery('12')).toBe(12)
  })

  test('parses portfolio scenario create bodies', () => {
    expect(parseScenarioCreateBody({})).toBeNull()
    expect(
      parseScenarioCreateBody({
        name: 'Growth',
        symbols: ['SPY', 'QQQ'],
        noveltyProfile: 'medium',
      }),
    ).toEqual({
      name: 'Growth',
      symbols: ['SPY', 'QQQ'],
      noveltyProfile: 'medium',
      maxWeightPerAsset: 0.15,
    })
  })

  test('parses portfolio scenario patch bodies', () => {
    expect(parseScenarioPatchBody({ refreshMode: 'quant', quantMethod: 'hrp' })).toEqual({
      refreshMode: 'quant',
      quantMethod: 'hrp',
    })
    expect(parseScenarioPatchBody({ quantMethod: 'nope' })).toBeNull()
  })

  test('parses optimize job bodies', () => {
    expect(parseOptimizeJobBody({ n: 3 })).toBeNull()
    expect(parseOptimizeJobBody({ n: 12, method: 'max_sharpe', seed: 7.8 })).toEqual({
      n: 12,
      method: 'max_sharpe',
      seed: 7,
      name: undefined,
      universePolicy: undefined,
      keepCount: undefined,
      scenarioId: undefined,
    })
  })
})
