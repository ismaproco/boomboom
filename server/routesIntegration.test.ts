import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildRuntime, createApp } from './appFactory'

let testDir = ''
let runtime: ReturnType<typeof buildRuntime>

beforeAll(() => {
  testDir = mkdtempSync(join(tmpdir(), 'boomboom-routes-'))
  process.env.DATA_DIR = testDir
  process.env.SQLITE_PATH = join(testDir, 'routes.sqlite')
  process.env.NODE_ENV = 'test'
  runtime = buildRuntime()
})

afterAll(() => {
  runtime.store.close()
  if (testDir) rmSync(testDir, { recursive: true, force: true })
})

describe('API routes integration', () => {
  const app = () => createApp(runtime)

  test('GET /api/health returns liveness payload', async () => {
    const response = await app().handle(new Request('http://localhost/api/health'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { ok: boolean; version: string; db: { ok: boolean } }
    expect(body.ok).toBe(true)
    expect(body.db.ok).toBe(true)
    expect(typeof body.version).toBe('string')
  })

  test('POST /api/portfolio-scenarios invalid body returns error envelope', async () => {
    const response = await app().handle(
      new Request('http://localhost/api/portfolio-scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      }),
    )
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('validation_error')
    expect(body.error.message).toContain('Invalid scenario')
  })

  test('GET /api/data-centers?all=1 returns bounded single-page payload', async () => {
    const response = await app().handle(new Request('http://localhost/api/data-centers?all=1&limit=50'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { page: number; pageSize: number; total: number; articles: unknown[] }
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(50)
    expect(body.articles.length).toBeLessThanOrEqual(50)
  })

  test('GET /api/data-centers?all=1 with 1k+ articles is a single bounded response', async () => {
    const fetchedAt = Date.now()
    const stories = Array.from({ length: 1200 }, (_, index) => ({
      id: 10_000 + index,
      section: 'Technology',
      headline: `Datacenter build wave ${index + 1}`,
      summary: 'Hyperscale data center campus expansion',
      source: 'Test Wire',
      time: '1h ago',
      impact: 'Medium' as const,
      url: undefined,
    }))
    runtime.store.store(stories, fetchedAt)

    const response = await app().handle(new Request('http://localhost/api/data-centers?all=1&limit=500'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { page: number; pageSize: number; total: number; articles: unknown[] }
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(500)
    expect(body.total).toBeGreaterThanOrEqual(1200)
    expect(body.articles).toHaveLength(500)
  })

  test('GET /api/popular/:snapshotId invalid id returns validation error', async () => {
    const response = await app().handle(new Request('http://localhost/api/popular/not-a-id'))
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('validation_error')
  })

  test('GET /api/articles?page=1&q=chips returns paginated search', async () => {
    runtime.store.store(
      [
        {
          id: 501,
          section: 'Technology',
          headline: 'Chips shortage eases',
          summary: 'Semiconductor supply improves',
          source: 'Test',
          time: '1h ago',
          impact: 'Medium' as const,
        },
      ],
      Date.now(),
    )
    const response = await app().handle(new Request('http://localhost/api/articles?page=1&q=chips'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { page: number; articles: Array<{ headline: string }> }
    expect(body.page).toBe(1)
    expect(body.articles.some((a) => a.headline.toLowerCase().includes('chips'))).toBe(true)
  })

  test('GET /api/popular returns latest snapshot payload', async () => {
    const response = await app().handle(new Request('http://localhost/api/popular'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { items: unknown[] }
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('GET /api/popular/:snapshotId returns snapshot when valid', async () => {
    const latest = await app().handle(new Request('http://localhost/api/popular/snapshots'))
    const snapshots = (await latest.json()) as { snapshots: Array<{ id: number }> }
    const id = snapshots.snapshots[0]?.id
    if (!id) return
    const response = await app().handle(new Request(`http://localhost/api/popular/${id}`))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { snapshot: { id: number } | null }
    expect(body.snapshot?.id).toBe(id)
  })

  test('POST /api/commodities/refresh returns snapshot payload', async () => {
    const response = await app().handle(new Request('http://localhost/api/commodities/refresh', { method: 'POST' }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { items: unknown[] }
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('POST /api/portfolios/optimize-jobs valid body returns 202', async () => {
    const response = await app().handle(
      new Request('http://localhost/api/portfolios/optimize-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: 8, method: 'max_sharpe' }),
      }),
    )
    expect(response.status).toBe(202)
    const body = (await response.json()) as { jobId: number }
    expect(body.jobId).toBeGreaterThan(0)
  })

  test('POST /api/portfolios/optimize-jobs duplicate scenario returns 409', async () => {
    const scenarioId = runtime.store.listPortfolioScenarios()[0]?.id
    expect(scenarioId).toBeGreaterThan(0)
    const payload = JSON.stringify({ n: 8, method: 'hrp', scenarioId })
    const first = await app().handle(
      new Request('http://localhost/api/portfolios/optimize-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }),
    )
    expect(first.status).toBe(202)
    const second = await app().handle(
      new Request('http://localhost/api/portfolios/optimize-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }),
    )
    expect(second.status).toBe(409)
    const body = (await second.json()) as { error: { code: string } }
    expect(body.error.code).toBe('conflict')
  })

  test('DELETE /api/portfolio-scenarios/:id missing returns 404', async () => {
    const response = await app().handle(new Request('http://localhost/api/portfolio-scenarios/999999', { method: 'DELETE' }))
    expect(response.status).toBe(404)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })

  test('POST /api/portfolios/optimize-jobs invalid body returns error envelope', async () => {
    const response = await app().handle(
      new Request('http://localhost/api/portfolios/optimize-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: 2 }),
      }),
    )
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('validation_error')
  })

  test('onError does not leak internal exception messages', async () => {
    const original = runtime.news.getTopNews.bind(runtime.news)
    runtime.news.getTopNews = () => {
      throw new Error('secret database connection string')
    }
    try {
      const response = await app().handle(new Request('http://localhost/api/top-news'))
      expect(response.status).toBe(500)
      const body = (await response.json()) as { error: { code: string; message: string } }
      expect(body.error.code).toBe('internal_error')
      expect(body.error.message).toBe('Internal server error')
      expect(body.error.message).not.toContain('secret')
    } finally {
      runtime.news.getTopNews = original
    }
  })
})
