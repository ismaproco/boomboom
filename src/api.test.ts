import { afterEach, describe, expect, test } from 'bun:test'
import { newsApi, parseApiErrorMessage } from './api'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('parseApiErrorMessage', () => {
  test('reads envelope message', () => {
    expect(parseApiErrorMessage({ error: { code: 'validation_error', message: 'Bad input' } }, 'fallback')).toBe('Bad input')
  })

  test('reads legacy string error', () => {
    expect(parseApiErrorMessage({ error: 'legacy' }, 'fallback')).toBe('legacy')
  })

  test('returns fallback when shape unknown', () => {
    expect(parseApiErrorMessage({ ok: true }, 'fallback')).toBe('fallback')
  })
})

describe('newsApi.getDataCenters', () => {
  test('fetchAll issues one list-all request (no pagination fan-out)', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (input) => {
      urls.push(String(input))
      return new Response(
        JSON.stringify({ updatedAt: new Date().toISOString(), page: 1, pageSize: 500, total: 1200, articles: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch

    await newsApi.getDataCenters('chips', undefined, { fetchAll: true, limit: 500 })

    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('/api/data-centers?')
    expect(urls[0]).toContain('all=1')
    expect(urls[0]).toContain('limit=500')
    expect(urls[0]).toContain('q=chips')
    expect(urls[0]).not.toMatch(/page=2/)
  })
})
