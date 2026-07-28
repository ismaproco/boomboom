# Operations (homelab)

## SQLite backup

Stop the container or server, then copy:

- `data/boomboom.sqlite`
- `data/boomboom.sqlite-wal` and `data/boomboom.sqlite-shm` (if present)

Docker volume maps host `./data` to `/data` in the container.

### Automated backup (cron)

Use the helper script (copies main DB + WAL/SHM when present):

```bash
chmod +x scripts/backup-sqlite.sh
./scripts/backup-sqlite.sh /path/to/backups/boomboom-$(date +%Y%m%d)
```

Example weekly cron (Sunday 03:15, stop container first if you need a quiesced copy):

```cron
15 3 * * 0 cd /path/to/boomboom && docker compose stop boomboom && ./scripts/backup-sqlite.sh && docker compose start boomboom
```

For live copies while running, SQLite WAL mode is usually consistent enough for homelab restore; for strict consistency, stop the app before backup.

### Restore

1. Stop BoomBoom (`docker compose down` or stop `bun run start`).
2. Replace files under `data/` (or `/data` in the container) with the backup copy.
3. If you copied only the main `.sqlite` file, delete stale `-wal` / `-shm` sidecars from the target directory.
4. Start the app and run `curl -f http://127.0.0.1:3210/api/health`.

Record baseline size when auditing production hardening:

```bash
ls -lh data/boomboom.sqlite
bun -e "import{Database}from'bun:sqlite';const d=new Database('data/boomboom.sqlite',{readonly:true});console.log(d.query('SELECT COUNT(*) c FROM raw_articles').get(),d.query('SELECT COUNT(*) c FROM popular_snapshots').get())"
```

## Post-deploy smoke

```bash
curl -f http://127.0.0.1:3210/api/health
curl -f http://127.0.0.1:3210/api/articles
curl -f http://127.0.0.1:3210/api/popular
# Data Centers bounded list (one request in the UI; no page fan-out)
curl -sf "http://127.0.0.1:3210/api/data-centers?all=1&limit=500" | head -c 200
docker inspect boomboom-news --format '{{.State.Health.Status}}'
bun run test:e2e
```

## Reachability

- Local only: `HOST=127.0.0.1` or bind Docker to `127.0.0.1:3210:3210`
- LAN: default `0.0.0.0` — do not port-forward `3210` to the internet without perimeter controls

### Firewall verification (operator)

Confirm port `3210` is not reachable from WAN:

```bash
# Linux (ufw example): deny inbound 3210 from outside LAN
sudo ufw status | grep -E '3210|Status'
# From an external host (should fail / time out):
# curl -m 5 http://YOUR_PUBLIC_IP:3210/api/health
```

Document your router rule: **no port-forward of 3210 to the internet**.

## Optional diagnostics

- `HEALTH_SCHEDULER_DETAILS=1` — include scheduler task status in `/api/health` (last error, skipped overlaps)
- `HEALTH_OPTIMIZE_QUEUE=1` — include optimize queue depth in `/api/health` (`inMemoryQueued`, `db.queued`, `db.running`)
- `ENABLE_SWAGGER=1` — expose `/swagger` (dev/docs only; off in production Docker image)

## External optimize worker

To keep quant jobs off the API process:

1. API / compose: `OPTIMIZE_EXECUTOR=external`
2. Second process: `bun run worker:optimize` (same `DATA_DIR` / `SQLITE_PATH` as the API)

Do **not** run embedded and external executors against the same database.

## Security (homelab)

- Block WAN access to port `3210` (host firewall or router; no port-forward to the internet).
- Use `HOST=127.0.0.1` in compose or `bun run start` when only this machine needs the UI.
- Leave `ENABLE_CORS` and `ENABLE_SWAGGER` unset in production unless you intend cross-origin or public API docs.
- Schedule SQLite backups (cron + `scripts/backup-sqlite.sh`; see [Automated backup](#automated-backup-cron) above).
- After dependency bumps: `bun audit` (CI runs this on push).

Docker Compose sets `mem_limit: 2g` and `cpus: 2` as a homelab guardrail; tune for your host.
