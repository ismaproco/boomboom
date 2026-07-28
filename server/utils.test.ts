import { describe, expect, test } from 'bun:test'
import { dedupeStories, escapeLikeTerm, inferImpact, inferSection, normalizeSymbol, parseDateIso, parseJsonArray } from './utils'
import type { NewsStory } from './types'

describe('utils', () => {
  test('normalizes valid dates and rejects invalid dates', () => {
    expect(parseDateIso('2025-01-02T03:04:05Z')).toBe('2025-01-02T03:04:05.000Z')
    expect(parseDateIso(undefined)).toBeNull()
    expect(parseDateIso('not-a-date')).toBeNull()
  })

  test('infers market sections and impact from headlines', () => {
    expect(inferSection('Fed rate decision moves bonds')).toBe('Policy')
    expect(inferSection('Nvidia chip demand rises')).toBe('Technology')
    expect(inferImpact('Oil prices surge after supply shock')).toBe('High')
  })

  test('deduplicates stories by case-insensitive headline', () => {
    const base: NewsStory = { id: 1, section: 'Top', headline: 'Markets rally', summary: '', source: 'A', time: 'now', impact: 'Medium' }
    expect(dedupeStories([base, { ...base, id: 2, headline: 'markets rally' }])).toHaveLength(1)
  })

  test('normalizes valid symbols and rejects invalid', () => {
    expect(normalizeSymbol(' spy ')).toBe('SPY')
    expect(normalizeSymbol('')).toBeNull()
    expect(normalizeSymbol('../etc')).toBeNull()
  })

  test('escapes LIKE wildcards', () => {
    expect(escapeLikeTerm('100%')).toBe('100\\%')
    expect(escapeLikeTerm('a_b')).toBe('a\\_b')
    expect(escapeLikeTerm('back\\slash')).toBe('back\\\\slash')
  })

  test('parses JSON arrays defensively', () => {
    expect(parseJsonArray('["A", 2]')).toEqual(['A', '2'])
    expect(parseJsonArray('{"nope":true}')).toEqual([])
    expect(parseJsonArray('not json')).toEqual([])
  })
})
