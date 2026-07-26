# Backend runbook — restless-forge-api

The shared FastAPI service behind `/api/*` for **cloud-assisted** tools
(the ones with `tier: 'cloud'` in `site/tools-data.js` and a ☁ badge).
Everything else on the site remains static; if this service dies, only
`/api/*` is affected.

## Architecture

```
browser ──HTTPS──▶ Cloudflare ──▶ nginx (location ^~ /api/, rate-limited)
                                    │ proxy_pass
                                    ▼
                       uvicorn 127.0.0.1:8000 (systemd: restless-forge-api)
                       FastAPI app in /opt/restless-forge/backend
                       venv in       /opt/restless-forge/venv
                       SQLite in     /var/lib/restless-forge/api.db
                       env/secrets   /etc/restless-forge/api.env
                                    │
                                    ▼ (per generation)
                       calendar provider (allowlisted iCal fetch)
                       Anthropic Claude API (lyrics)
```

- **Code**: `backend/` in the repo. Routes per tool under
  `/api/v1/<tool>/`; currently `rise_and_rhyme` (generate + health).
- **No containers, no DB server** — stdlib SQLite, single uvicorn worker
  (the droplet has 1 GB RAM).

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/rise-and-rhyme/generate` | iCal → Claude lyrics → track selection |
| `GET /api/v1/rise-and-rhyme/health` | daily generation count, spend, circuit state |

## Environment (`/etc/restless-forge/api.env`)

Bootstrapped by the **first** deploy from the `ANTHROPIC_API_KEY` GitHub
secret; never overwritten afterwards — this file is the server-side source
of truth for ops changes.

| Var | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | — (required) | Claude API key |
| `CLAUDE_MODEL` | `claude-opus-5` | lyric model |
| `CLAUDE_INPUT_COST_PER_MTOK` / `CLAUDE_OUTPUT_COST_PER_MTOK` | `5.0` / `25.0` | pricing used for spend tracking — update if the model changes |
| `DAILY_GEN_CAP` | `500` | global generations/day |
| `DAILY_SPEND_CAP` | `10.0` | USD/day hard stop |
| `ALERT_WEBHOOK_URL` | empty | optional webhook for spend/circuit alerts (always logged regardless) |
| `RF_DB_PATH` | `/var/lib/restless-forge/api.db` | SQLite location |

After editing: `systemctl restart restless-forge-api`.

## Cost controls (enforced in code, `backend/services/rate_limiter.py`)

| Control | Value |
|---|---|
| Per calendar URL (SHA-256 hash) | 1 generation / 12 h |
| Per IP (`CF-Connecting-IP`) | 3 requests / h |
| Global daily generations | `DAILY_GEN_CAP` |
| Global daily spend (from real response usage) | `DAILY_SPEND_CAP` |
| Circuit breaker | 3 consecutive Claude API errors → 15 min cooldown |
| Alerts | WARNING log + optional webhook at 80% and 100% of the spend cap, and on circuit open |
| nginx layer | `limit_req` 10 r/min per CF-Connecting-IP, burst 5 |

Worst-case monthly Claude spend is capped at ~`DAILY_SPEND_CAP × 31`.

## Deploy flow (automatic, `.github/workflows/deploy.yml`)

Every push to main: pytest gate → rsync `backend/` →
`/opt/restless-forge/backend` (outside the web root; never touched by the
dist rsync) → venv refresh → systemd unit install (skip if unchanged) →
`api.env` bootstrap (only if missing) → restart → local health check
(fails the workflow loudly if the service doesn't come up) → public
health check through Cloudflare.

## Operations

```bash
# Status / logs
systemctl status restless-forge-api
journalctl -u restless-forge-api -n 100 --no-pager

# Restart after an env edit
systemctl restart restless-forge-api

# Rotate the Claude API key
$EDITOR /etc/restless-forge/api.env   # replace ANTHROPIC_API_KEY
systemctl restart restless-forge-api

# Kill switch: stop the service (static site unaffected; /api returns 502)
systemctl stop restless-forge-api     # `disable` too if it should survive deploys — note the deploy re-enables it

# Today's numbers
curl -s https://restless-forge.dev/api/v1/rise-and-rhyme/health

# Inspect the state DB
sqlite3 /var/lib/restless-forge/api.db 'SELECT * FROM daily_stats ORDER BY date DESC LIMIT 7;'
```

Monitoring: `.github/workflows/health-check.yml` probes the health
endpoint every 30 minutes and opens a `site-health` issue when it fails.

## Local development

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
ANTHROPIC_API_KEY=sk-... RF_DB_PATH=/tmp/rf-api.db \
  .venv/bin/uvicorn main:app --reload --port 8000
```

The root dev server (`npm run dev`, :8080) and rise-and-rhyme's own dev
server (:5198) both proxy `/api` to :8000. Tests: `.venv/bin/python -m
pytest tests` (no API key or network needed — Claude and feed fetches are
mocked).

## Privacy posture (what this service must keep true)

- Raw iCal URLs are **not** persisted — only SHA-256 hashes for rate
  limiting, plus per-generation cost/track/mood/event-count logs.
- Calendar event details are sent to the Claude API to write lyrics and
  are not stored after the response is returned.
- The SSRF allowlist in `backend/services/ical_parser.py` restricts
  fetches to known calendar providers over https only.

Public-facing copy that mirrors this: `site/privacy.html` ("Cloud-Assisted
Tools") and `tools/rise-and-rhyme/frontend/src/privacy/`.
