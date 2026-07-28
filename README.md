# BoomBoom News

A single-page news and markets dashboard. The **React** frontend (Vite + Tailwind CSS v4) is served by an **Elysia** API on **Bun**. News and quotes are refreshed in the background from open data and RSS sources; **SQLite** persists articles, refresh history, and Trending 100 snapshots.

## Problem and motivation

Market dashboards frequently combine live upstream data, derived rankings, scheduled refreshes, and interactive research in one process without making failure behavior explicit. BoomBoom explores how to keep those responsibilities separated while remaining deployable as a single small service for private-network use.

## Architecture decisions and trade-offs

- **One production process and one durable file.** Elysia serves the API and built React application from one port, while SQLite WAL mode provides local durability. This is operationally simple but intentionally not a multi-tenant or horizontally scaled design.
- **Thin HTTP routes and explicit service boundaries.** Route registration delegates to focused services for feeds, scheduling, portfolio calculations, decisions, persistence, and health reporting.
- **Persisted optimizer jobs.** CPU-heavy optimization work is queued in SQLite, bounded in memory, recovered after restart, and can run in a separate worker. Serial execution protects a small host at the cost of throughput.
- **Read operations do not trigger rebuilds.** Scheduled or operator-triggered mutations use explicit commands, keeping GET routes free of hidden writes.
- **Generated API contracts are checked in CI.** OpenAPI output and generated TypeScript types must remain synchronized with route definitions.

## Runtime flow

```text
RSS and market sources
        |
        v
refresh services + scheduler
        |
        v
SQLite repositories <---- persisted optimizer queue
        |                            |
        v                            v
Elysia API <---------------- external worker
        |
        v
React dashboard
```

## Features

- **Section feeds** — Top, Markets, Technology, and Energy news sections with keyboard shortcuts (`/`, `/markets`, `/technology`, `/energy`).
- **Tickers** — Configurable watchlist quotes (`WATCHLIST_SYMBOLS`, `/tickers`, `GET /api/tickers`).
- **Commodities** — Commodity snapshots, history, and manual refresh (`/commodities`).
- **Trending 100** — Clustered popularity ranking with snapshot history (`/popular`).
- **Articles & logs** — Browse persisted raw articles and backend refresh history.
- **Portfolios & decisions** — Manual/quant portfolios, five-minute optimized risk tiers, daily decision overlay, survivor finalize, and portfolio playoffs bracket.
- **Market signals** — Cross-feed signal ranking from tickers, Trending 100, optimized portfolios, and decisions.
- **Data Centers** — Data-center themed article browse.
- **Presentation** — Theme tokens and resolvers under `src/presentation/*`.
- **Production** — One process serves both the built SPA and `/api/*` on a single port.

## Prerequisites

- [Bun](https://bun.sh/) (runtime and package manager)

Optional: Docker and Docker Compose for containerized deployment.

## Quick start

Install dependencies:

```bash
bun install
```

### Development

Runs the API with `--watch` and Vite on **0.0.0.0**. The dev server proxies `/api` to the backend (default API port **3210**).

```bash
bun run dev
```

- Frontend: `http://0.0.0.0:5173` (or your machine’s hostname on that port)
- API health: `http://127.0.0.1:3210/api/health`

### Backend only

```bash
bun run server
```

### Production build (local)

```bash
bun run build
bun run start
```

Then open `http://127.0.0.1:3210` (or set `HOST` / `API_PORT` as below).

## Deployment (private network)

BoomBoom is built for **private / homelab use** on a trusted network (home LAN, VPN, or localhost). It is **not** intended to be exposed on the public internet.

| Topic | Guidance |
| ----- | -------- |
| **Reachability** | Default `HOST=0.0.0.0` lets other devices on your LAN open the dashboard. Do not port-forward `3210` on your router unless you add your own perimeter controls. |
| **Local only** | Set `HOST=127.0.0.1` or map Docker to `127.0.0.1:3210:3210` when only this machine should connect. |
| **Authentication** | No user accounts or API keys. Anyone who can reach the port can use mutating endpoints (scenarios, optimize jobs, refresh, finalize). |
| **HTTPS** | Not built in; terminate TLS yourself on LAN if needed. |
| **Data** | Single SQLite file under `data/` (or `/data` in Docker). Back up the volume; there is no multi-tenant isolation. |

Portfolio decisions and market signals are exploratory research overlays, not investment advice. See [`AGENTS.md`](./AGENTS.md) for contributor conventions.

## Docker

Build and run with host SQLite under `./data`:

```bash
docker compose build
docker compose up -d
```

App and API: `http://0.0.0.0:3210`

Stop:

```bash
docker compose down
```

The image uses multi-stage builds (install → Vite build → runtime with `dist` + `server`). Override Bun image/version via `BUN_IMAGE` and `BUN_VERSION` build args if needed.

## Environment variables

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `HOST` | Bind address | `0.0.0.0` |
| `API_PORT` | HTTP port (dev proxy reads this too) | `3210` |
| `DATA_DIR` | Directory for SQLite and related files | `data` (cwd-relative) / `/data` in Docker |
| `SQLITE_PATH` | SQLite database file | `${DATA_DIR}/boomboom.sqlite` |
| `WATCHLIST_SYMBOLS` | Comma-separated symbols for quotes | See `server/config.ts` / compose defaults |
| `DATA_REFRESH_SECONDS` | Background refresh interval | `600` |
| `OPEN_DATA_TIMEOUT_SECONDS` | Upstream HTTP timeout | `8` |
| `POPULAR_REFRESH_MINUTES` | Trending 100 snapshot freshness window | `15` |
| `POPULAR_ENSURE_MINUTES` | Background Trending 100 ensure interval | `15` |
| `POPULAR_RETENTION_DAYS` | Trending 100 snapshot retention | `30` |
| `PORTFOLIO_REFRESH_MINUTES` | Auto portfolio refresh interval | `10` |
| `PORTFOLIO_QUANT_REOPTIMIZE_MINUTES` | Default quant scenario reoptimize interval | `1440` |
| `PORTFOLIO_NOVELTY_PROFILE` | Default portfolio novelty profile (`low`, `medium`, `high`) | `medium` |
| `PORTFOLIO_DIVERSITY_WEIGHT` | Portfolio diversity scoring weight | `1` |
| `ENABLE_SWAGGER` | Expose `/swagger` API docs (`1` to enable) | unset (off) |
| `ENABLE_CORS` | Allow cross-origin API access in production (`1` to enable) | unset (off when `NODE_ENV=production`) |
| `HEALTH_SCHEDULER_DETAILS` | Include scheduler task status (last error, overlaps) in `/api/health` (`1` to enable) | unset |
| `HEALTH_OPTIMIZE_QUEUE` | Include optimize queue depth in `/api/health` (`1` to enable) | unset |
| `OPTIMIZE_EXECUTOR` | `embedded` (default) runs jobs in the API process; `external` enqueues only (pair with `bun run worker:optimize`) | `embedded` |

**Logging:** `server/index.ts` prints bind URL, SQLite path, and refresh intervals at startup (intentional homelab visibility). Runtime errors in scheduled tasks use `logError` from `server/logger.ts` (JSON in production, objects in dev).

**Node for Vite:** `bun run build` uses the project TypeScript build; if you run `vite` directly outside Bun, use **Node.js ≥ 20.19** (Vite 8 warns on older Node).

Do not commit generated database files; `data/*.sqlite` (and WAL/SHM) should stay ignored.

**Backup:** stop the app, then copy `data/boomboom.sqlite` and any `-wal`/`-shm` sidecars. See [`docs/ops.md`](docs/ops.md).

**Optimize jobs:** job requests are persisted in SQLite (`request_json`); embedded mode recovers queued jobs after restart. Stale `queued`/`running` rows older than 30 minutes are marked failed on startup and when enqueueing new work. Only **one** job runs at a time (CPU-heavy `ml-matrix` work); at most **three** jobs may wait in the in-process queue—additional enqueue requests return conflict until the queue drains. Set `OPTIMIZE_EXECUTOR=external` on the API and run `bun run worker:optimize` in a second process to isolate CPU from the HTTP server on small hosts.

## API (overview)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/api/health` | Liveness + DB ping (`ok`, `version`, `db`, `scheduler`) |
| `GET` | `/api/top-news` | Cached live feed + seeded fallback |
| `GET` | `/api/tickers` | Watchlist quotes |
| `GET` | `/api/market-signals` | Ranked market signal cards |
| `GET` | `/api/ticker-history/status` | ETF/history sync status (`?symbols=`) |
| `POST` | `/api/ticker-history/sync` | Trigger history sync (`{ symbols?: string[] }`) |
| `GET` | `/api/commodities` | Latest commodity snapshot |
| `POST` | `/api/commodities/refresh` | Refresh commodity data |
| `GET` | `/api/commodities/history?symbol=X` | Commodity price history (`?days=`) |
| `GET` | `/api/commodities/snapshots` | Commodity snapshot list (`?limit=`) |
| `GET` | `/api/articles?page=N&q=TERM` | Paginated articles (optional search) |
| `GET` | `/api/data-centers?page=N&q=TERM` | Data-center themed article page |
| `GET` | `/api/refresh-log?page=N` | Refresh history |
| `GET` | `/api/popular` | Latest Trending 100 (read-only) |
| `POST` | `/api/popular/ensure` | Manually rebuild Trending 100 snapshot if needed |
| `GET` | `/api/popular/snapshots` | Snapshot history (read-only) |
| `GET` | `/api/popular/:snapshotId` | Historical snapshot (read-only) |
| `GET` | `/api/portfolio-scenarios` | Portfolio scenarios |
| `POST` | `/api/portfolio-scenarios` | Create a portfolio scenario |
| `PATCH` | `/api/portfolio-scenarios/:id` | Update a portfolio scenario |
| `DELETE` | `/api/portfolio-scenarios/:id` | Delete a non-default scenario |
| `GET` | `/api/portfolios?scenarioId=N` | Latest portfolio snapshot |
| `GET` | `/api/portfolios/history?page=N&scenarioId=N` | Portfolio snapshot history |
| `GET` | `/api/portfolios/signal-calibration?scenarioId=N&limit=80` | Exploratory tilt vs realized excess (`limit` 10–500) |
| `GET` | `/api/portfolios/comparison?horizons=30,90,365` | Scenario performance comparison |
| `POST` | `/api/portfolios/backtest` | Run portfolio backtest |
| `GET` | `/api/portfolios/backtest/:runId` | Backtest run status |
| `GET` | `/api/portfolios/candidates` | Backtest candidate scenarios |
| `GET` | `/api/portfolio-decisions?profile=balanced` | Daily decision overlay with rankings, allocations, risk flags, and position actions |
| `GET` | `/api/portfolio-decisions/latest?profile=balanced` | Latest persisted decision run |
| `GET` | `/api/portfolio-decisions/runs?limit=30` | Recent persisted decision runs |
| `GET` | `/api/portfolio-decisions/survivors?date=YYYY-MM-DD` | Daily top-three survivor portfolios |
| `GET` | `/api/portfolio-decisions/bracket` | Playoff bracket (`startDate`, `endDate`, `mode`, `source`, `rankScope`) |
| `POST` | `/api/portfolio-decisions/finalize?profile=balanced&date=YYYY-MM-DD` | Idempotently finalize top-three survivors |
| `GET` | `/api/optimized-portfolios` | Five-minute optimized portfolio summary |
| `GET` | `/api/optimized-portfolios/comparison?horizons=7,30,90,365` | Optimized portfolio comparison |
| `POST` | `/api/portfolios/optimize-jobs` | Queue a quant optimizer job |
| `GET` | `/api/portfolios/optimize-jobs/:id` | Optimizer job status |

In production, non-API routes serve the static Vite build (SPA).

Background jobs ensure Trending 100 snapshots on a schedule (`POPULAR_ENSURE_MINUTES`) and after news refresh. `GET /api/popular` is read-only; use `POST /api/popular/ensure` for a manual rebuild.

The portfolio decision endpoint is an exploratory overlay. It does not mutate raw optimized weights; it translates current model portfolios into daily actions using concentration caps, negative implied-return pruning, realized-history warnings, beta/drawdown guardrails, and Trending 100 theme signals. Supported profiles are `conservative`, `balanced`, and `aggressive`.

Decision runs are persisted. After the NYSE close buffer, the server finalizes a daily top-three survivor set using a blend of realized excess return, original decision score, drawdown control, concentration control, and turnover control. Non-survivors are retained for audit/history and de-emphasized in the UI rather than deleted.

## Project layout (high level)

| Path | Role |
| ---- | ---- |
| `src/App.tsx` | Main dashboard and routing |
| `src/navigation.ts` | Menu labels, shortcuts, routes |
| `server/index.ts` | Composition root: wire services, scheduler, listen |
| `server/registerApiRoutes.ts` | HTTP route registration |
| `server/config.ts` | Feeds, watchlist, intervals |
| `server/database.ts` | SQLite schema and repositories |
| `server/feeds.ts` | RSS / open data fetching |
| `server/newsService.ts` | Refresh orchestration and article/refresh-log reads |
| `server/popularity.ts` | Trending 100 logic |
| `server/portfolioScenarioService.ts` | Portfolio scenario CRUD |
| `server/portfolioCacheCoordinator.ts` | Portfolio comparison/decision cache warming |
| `server/portfolioDecisionService.ts` | Decision overlay, survivors, bracket |
| `server/commoditiesService.ts` | Commodity refresh and history |
| `server/tickerWatchlistService.ts` | Watchlist quotes |
| `server/marketSignalsService.ts` | Market signal ranking |
| `server/seedData.ts` | Seeded fallback content |
| `src/presentation/` | Theme tokens and UI resolvers |
| `data/` | Host-mounted DB directory (Docker / local) |

For contributor-oriented conventions (boundaries, SOLID, Tailwind rules), see [`AGENTS.md`](./AGENTS.md) and [`TAILWIND_RULES.md`](./TAILWIND_RULES.md).

## Scripts

| Script | Command |
| ------ | ------- |
| `dev` | API (watch) + Vite dev server |
| `server` / `start` | Run `server/index.ts` |
| `build` | `tsc -b` + `vite build` |
| `test` | Run Bun unit tests |
| `openapi:emit` | Write `openapi.json` from running app (temp SQLite) |
| `openapi:client` | Generate `src/generated/api-types.ts` |
| `openapi` | Emit + generate client types |

**API types (OpenAPI):** CI keeps `openapi.json` and `src/generated/api-types.ts` in sync with the live Elysia routes. The React client still uses hand-maintained types in `shared/types.ts` (re-exported as `src/types.ts`) for day-to-day development; treat the generated file as the contract reference when adding or changing routes, and run `bun run openapi` after route changes. Wiring `paths` from `api-types.ts` into `src/api.ts` is optional follow-up.
| `preview` | Preview production build (Vite) |

---

**BoomBoom News** — Vite · React · Tailwind · Elysia · Bun · SQLite

## Public edition

This repository starts with a clean public history. Private deployment configuration, local databases, credentials, and internal operational files are intentionally excluded.

## License

MIT
