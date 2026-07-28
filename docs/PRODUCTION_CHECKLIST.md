# BoomBoom production hardening — implementation checklist

Actionable plan from the [production code review](../README.md). Work phases in order; check items off as you go.

**Deployment intent:** homelab / trusted LAN per [README](../README.md) and [AGENTS.md](../AGENTS.md). Items marked **(public)** apply only if exposure model changes.

---

## Phase 0 — Baseline (before changing code)

- [x] Record current SQLite size: article count, snapshot count, file size on disk
- [x] Note deployment mode: Docker vs `bun run start`, `HOST`, port exposure
- [x] Confirm production env: `ENABLE_SWAGGER`, `ENABLE_CORS`, `NODE_ENV=production`
- [x] Smoke test baseline: `/api/health`, `/`, `/markets`, `/popular`, `/articles`, one optimize job
- [x] Back up `data/boomboom.sqlite` and document restore steps

**Open questions (fill in):**

| Question                                  | Answer                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Typical article count / DB file size      | ~20,152 `raw_articles`, ~1,472 `popular_snapshots`, ~199 MB (`data/boomboom.sqlite`, 2026-05-22) |
| Concurrent LAN users                      | 1–3 typical homelab use                                                                          |
| Docker-only or host `bun run start` too?  | Docker Compose primary; `bun run start` supported for host dev/prod                              |
| `ENABLE_SWAGGER` / `ENABLE_CORS` in prod? | Off by default (`NODE_ENV=production` in image; not set in `docker-compose.yml`)                 |

---

## Phase 1 — Critical fixes (Week 1)

### Performance / stability

- [x] **Fix Data Centers “load all pages”** (`src/useNewsDashboard.ts`)

  - [x] Choose approach: server “list all matching” with cap **or** true page-by-page infinite scroll
  - [x] Add server endpoint or query param if needed (e.g. `?all=1&limit=500`)
  - [x] Remove `Promise.all(remainingPages.map(...))` fan-out
  - [x] Verify with 1k+ articles: single request or bounded requests only

- [x] **Limit optimize job impact on API** (`server/portfolioOptimizeRunner.ts`)
  - [x] Add max concurrent optimize jobs (e.g. 1–2)
  - [x] Document CPU/RAM expectations in README
  - [x] (Optional) External worker via `OPTIMIZE_EXECUTOR=external` + `bun run worker:optimize` (see Phase 5)

### Ops / deploy

- [x] **Docker healthcheck** (`docker-compose.yml`)

  - [x] `healthcheck` → `curl -f http://127.0.0.1:3210/api/health`
  - [x] Set `interval`, `timeout`, `retries`, `start_period`

- [x] **Fix dashboard code-splitting** (`src/App.tsx`, `src/dashboards.tsx`)
  - [x] Split chart-heavy dashboards into separate files
  - [x] Remove static import of modules that are `lazy()`-loaded
  - [x] Confirm Vite build has no `INEFFECTIVE_DYNAMIC_IMPORT` warning
  - [x] Compare `dist/assets/*.js` sizes before/after (`portfolioCharts-*.js` ~84 kB; main `index-*.js` ~276 kB)

### Tests (lock in Phase 1)

- [x] Integration test: articles / data-centers pagination contract (bounded client behavior)
- [x] Integration test: invalid `GET /api/popular/:snapshotId` → 400 or safe empty, not 500
- [x] Manual: open Data Centers, Network tab — request count bounded (covered by `src/api.test.ts` single-fetch test + live `?all=1` smoke)

**Phase 1 done when:** Data Centers uses ≤2 API calls in typical load; Docker reports healthy; bundle warning gone; `bun test` green.

> **Status (2026-05-23):** Phase 1 complete.

---

## Phase 2 — High priority structure (Week 2)

### Backend persistence

- [x] **Split `server/database.ts`**
  - [x] Extract `server/db/portfolio.ts`, `popular.ts`, `commodities.ts`
  - [x] Keep `SqliteStore` as thin facade delegating to modules
  - [x] Keep `database.test.ts` green

### API validation & contracts

- [x] **Zod at HTTP boundaries**
- [x] **Route param parsing** — `parsePositiveIntParam` on numeric path params
- [x] **OpenAPI / types** — documented in README (generated = contract reference; `shared/types.ts` for client)
  - [ ] **Option A:** Wire `src/generated/api-types.ts` into `src/api.ts` (deferred)
  - [ ] **Option B:** Remove `openapi:client` from CI (not chosen)

### Integration test coverage

- [x] All listed routes covered in `server/routesIntegration.test.ts`

> **Status (2026-05-23):** Phase 2 complete.

---

## Phase 3 — Frontend architecture (Week 3)

### Split god hook (`src/useNewsDashboard.ts`)

- [x] `src/hooks/useFeedPolling.ts` — top news, main feed, articles, data centers, refresh log
- [x] `src/hooks/usePortfolioDashboard.ts` — scenarios, portfolios, optimize job polling
- [x] `src/hooks/usePopularDashboard.ts` — popular + snapshots
- [x] `src/hooks/useCommoditiesDashboard.ts` — commodities + tickers
- [x] Slim `useNewsDashboard.ts` to composition + shared UI state (menu, search) (~315 lines)
- [x] Menu-aware market-signals polling; summary hidden off section menus (`shouldShowMarketSignals`)

### Split god UI (`src/dashboards.tsx`)

- [x] `src/dashboards/feed/` — Popular, Articles, Data Centers, Refresh log
- [x] `src/dashboards/markets/` — Tickers, Commodities, Market signals
- [x] `src/dashboards/portfolio/portfolioCharts.tsx` — lazy portfolio dashboards (single chunk file)
- [x] Re-export from `src/dashboards/index.ts` and `src/dashboards.tsx`

### Smarter polling

- [x] Poll only the **active menu** on interval (`loadActiveMenu`)
- [x] `document.visibilityState` skip unchanged
- [x] Market signals polled only on section menus (`shouldPollMarketSignals`)
- [x] Portfolio comparison loads only when portfolio menus call `loadPortfolios` / `loadOptimizedPortfolios`
- [x] `AbortSignal` cleanup via `useAbortableRequest`

### Frontend tests

- [x] Unit tests for `pollingHelpers` (`src/hooks/pollingHelpers.test.ts`)
- [x] (Optional) Playwright smoke: `/` → `/popular`, no console errors (`e2e/smoke.spec.ts`)

**Phase 3 done when:** No `src` hook file &gt;600 lines; feed/markets dashboards split; menu-aware polling verified.

> **Status (2026-05-23):** Phase 3 complete. `portfolioCharts.tsx` remains ~1.8k lines but is lazy-loaded (~84 kB chunk). Further split into four files is deferred (helpers are interleaved).

---

## Phase 4 — Type safety & quality (Week 4)

### TypeScript compiler

- [x] Enable `noUncheckedIndexedAccess` in `tsconfig.node.json` (server)
- [x] Fix fallout in `database.ts`, `newsService.ts`, `portfolio.ts`, `scheduler.ts`
- [ ] (Later) Enable on `tsconfig.app.json` for frontend

### Error handling consistency

- [x] `scheduler.ts`: use `logError` instead of `console.error`
- [x] Document boot logging choice in README (`server/index.ts` startup lines)
- [x] Legacy `{ error: '...' }` — only internal/job payloads remain; HTTP uses `apiError` envelope via `legacyErrorMessage` adapter in `onError`
- [ ] Remove `legacyErrorMessage` when all handlers return `ApiErrorBody` directly (deferred)

### Logging & observability (homelab)

- [x] Document `HEALTH_SCHEDULER_DETAILS=1` in README and `docs/ops.md`
- [x] (Optional) Expose optimize queue depth via health when env-gated (`HEALTH_OPTIMIZE_QUEUE=1`)

### Tooling

- [x] Add Prettier + `bun run format` / `format:check` + CI step
- [x] Note Node ≥20.19 if running Vite outside Bun (README)

**Phase 4 done when:** `bun test`, `bun run lint`, `bun run build`, `bun run format:check` green; server `noUncheckedIndexedAccess` enabled.

> **Status (2026-05-23):** Phase 4 complete.

---

## Phase 5 — Backlog (nice-to-have)

- [x] `React.memo` on Trending 100 table rows (`PopularRankRow`)
- [x] Split `shared/types.ts` into domain files (`shared/types/{common,core,health}.ts` + barrel)
- [x] Zod for all JSON columns in `dbJsonSchemas.ts` (string/number/symbol arrays + persisted optimize requests)
- [x] Worker process for quant optimize (`server/optimizeWorker.ts`, `OPTIMIZE_EXECUTOR=external`, `request_json` persistence)
- [x] Playwright CI smoke on `/`, `/markets`, `/articles`, `/popular` (`.github/workflows/ci.yml` + `e2e/smoke.spec.ts`)
- [x] `docker compose` memory/CPU limits (`mem_limit: 2g`, `cpus: 2`)
- [ ] Dedicated RSS parser if feed edge cases multiply (not needed yet; `feeds.test.ts` covers current parser)

> **Status (2026-05-23):** Phase 5 complete except conditional RSS parser.

---

## Phase 6 — Security & deployment (ongoing)

- [x] Documented in `docs/ops.md`: firewall, `HOST=127.0.0.1`, CORS/Swagger, backups, `bun audit`
- [x] Firewall: block port `3210` from WAN — verification steps in `docs/ops.md` (**operator action** on host/router)
- [x] Scheduled SQLite backup — `scripts/backup-sqlite.sh` + cron example in `docs/ops.md` (**operator cron**)

**(public)** If ever internet-exposed: reverse-proxy auth in front of mutating routes.

> **Status (2026-05-23):** Phase 6 operator procedures documented; run firewall/backup steps on your host.

---

## Suggested PR breakdown

| PR  | Scope                                                           |
| --- | --------------------------------------------------------------- |
| 1–6 | Phases 1–2 (done)                                               |
| 7   | `refactor: split useNewsDashboard hooks`                        |
| 8   | `refactor: split dashboards by domain`                          |
| 9   | `chore: noUncheckedIndexedAccess server`                        |
| 10  | `chore: unify logging + prettier CI`                            |
| 11  | `feat: health optimize queue + external worker + playwright CI` |

---

## Review scores (reference)

Re-score after deployment soak.

| Category                           | Score (1–10) |
| ---------------------------------- | ------------ |
| Architecture                       | 8            |
| Type safety                        | 8            |
| Code quality                       | 8            |
| Security (homelab intent)          | 7            |
| Performance                        | 7            |
| Testing                            | 7            |
| Maintainability                    | 8            |
| Production readiness (homelab)     | 8            |
| Production readiness (public SaaS) | 4            |

---

## Related docs

- [README](../README.md) — deployment and API overview
- [AGENTS.md](../AGENTS.md) — architecture rules for contributors
- [ops.md](./ops.md) — operational notes
