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
| `POST /api/v1/rise-and-rhyme/preview` | iCal → event list + mood. **No model call, no cost.** |
| `GET /api/v1/rise-and-rhyme/health` | daily generation count, spend, circuit state |

### Request contract

```json
{
  "ical_url": "https://calendar.google.com/calendar/ical/.../basic.ics",
  "target_date": "2026-07-30",
  "timezone": "America/Chicago",
  "preferred_genre": "any"
}
```

**`timezone` is load-bearing, not decoration.** A calendar day only means
something in a zone, and the browser is the only party that knows which one.
Expanding `target_date` in UTC instead (the original behaviour) broke three
things at once for anyone west of Greenwich: evening events fell into the next
UTC day and vanished from the song, every time in the lyrics was shifted by the
offset, and the response's `cache_until` — then a fixed 12:00Z — expired
*before* the alarm, so US Pacific users always woke to the fallback jingle.
The server now expands the day in the caller's zone, renders event times in it,
and caches until local end-of-day. Unknown zones are rejected with a 400.

### Preview (`POST /preview`)

Same request shape as `generate`. Returns what the song will be about instead
of writing it:

```json
{
  "status": "ok",
  "target_date": "2026-07-30",
  "timezone": "America/Chicago",
  "event_count": 3,
  "truncated": false,
  "mood": "smooth",
  "events": [{ "time": "7:00 AM", "summary": "Standup", "all_day": false }]
}
```

It exists so someone can confirm their iCal URL works — and, more importantly,
that the detected timezone is right — without spending the one generation that
calendar gets per day. Design constraints, all covered by tests in
`backend/tests/test_preview.py`:

- **Stops before Claude.** It reuses the calendar read and the same mood
  heuristic the generator uses, so the preview shows the mood the song would
  actually get. Nothing is billed, and `generations` / `daily_stats` /
  `rate_url` are untouched.
- **Its own rate bucket** (`rate_preview_ip`, `PREVIEW_MAX_PER_HOUR`, default
  10/hour). Sharing the generate bucket would mean three previews locked you
  out of the song you were previewing.
- **Same SSRF posture** — identical allowlist, private-IP screen, and streaming
  size cap, because it is the same attacker-controlled fetch.
- **Bounded response** — at most 12 events and 200 characters per summary;
  `truncated` tells the UI to say "plus N more".

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
| `PREVIEW_MAX_PER_HOUR` | `10` | Calendar previews per IP per hour (separate from the generate budget) |
| `RF_DB_PATH` | `backend/.data/api.db` (dev) | SQLite location. **Production sets this in the systemd unit** (`/var/lib/restless-forge/api.db`); the code default is deliberately local so a laptop or CI box can never touch real cost-control state. |
| `GENERATION_LOG_RETENTION_DAYS` | `30` | How long the generation/cost log is kept |
| `DAILY_STATS_RETENTION_DAYS` | `400` | How long per-day totals are kept |

After editing: `systemctl restart restless-forge-api`.

## Cost controls (enforced in code, `backend/services/rate_limiter.py`)

| Control | Value |
|---|---|
| Per calendar URL (SHA-256 hash) | 1 generation / 12 h |
| Per IP (SHA-256 of `CF-Connecting-IP`) | 3 generate requests / h |
| Per IP, preview only | `PREVIEW_MAX_PER_HOUR` (10) / h — separate bucket, zero cost |
| Global daily generations | `DAILY_GEN_CAP` |
| Global daily spend (from real response usage) | `DAILY_SPEND_CAP` |
| Circuit breaker | 3 consecutive Claude API errors → 15 min cooldown |
| Alerts | WARNING log + optional webhook at 80% and 100% of the spend cap, and on circuit open |
| nginx layer | `limit_req` 10 r/min per CF-Connecting-IP, burst 5 |

Worst-case monthly Claude spend is capped at ~`DAILY_SPEND_CAP × 31`.

Two properties the limiter is responsible for, both of which were holes worth
understanding before changing this code:

- **Every billed attempt is charged to the caps.** A safety refusal or a
  malformed model response still consumes billed tokens. An earlier version
  recorded spend only on the success path, so those calls were invisible to the
  daily cap *and* left no rate-limit trace — a calendar that reliably produced
  unusable output could be retried indefinitely. Failures now record spend and
  the per-IP counter; only the 12-hour per-calendar lock is released, so a
  server-side problem doesn't cost the user their slot for the day.
- **Reserving a slot is atomic.** Checking the limits and claiming the slot run
  in a single `BEGIN IMMEDIATE` transaction. Sync endpoints run in FastAPI's
  threadpool, so a check-then-record pair let two concurrent requests for the
  same calendar both pass and both pay.

## Data retention

The SQLite file holds **cost-control state only** — no calendar contents, no
lyrics, no raw URLs, no raw IP addresses:

| Table | Contents | Retention |
|---|---|---|
| `rate_url` | SHA-256 of the calendar URL, timestamp | 12 h (the rate-limit window) |
| `rate_ip` | SHA-256 of the client IP, timestamp | 1 h (the rate-limit window) |
| `rate_preview_ip` | SHA-256 of the client IP, timestamp | 1 h (the preview window) |
| `daily_stats` | date, generation count, spend | `DAILY_STATS_RETENTION_DAYS` (400) |
| `generations` | timestamp, URL hash, cost, track, mood, event count, success | `GENERATION_LOG_RETENTION_DAYS` (30) |
| `circuit` | one row: consecutive errors, cooldown expiry | permanent (single row) |

Pruning is enforced by **SQLite triggers**, rebuilt on every start-up so a
config change takes effect (`db.py::_prune_triggers`). Triggers rather than a
cron job because they fire on every write path — including ones added later —
and need nothing scheduled to keep working. `generations` is the only table
that grows with traffic (up to `DAILY_GEN_CAP` rows/day), which is why it has
the shortest meaningful retention; everything else is bounded by its window.

Consequence worth knowing: expired rows disappear on the next write to that
table, so a completely idle service can hold expired rows until traffic
resumes. They are never *read* — every query filters by window — so this
affects file size only, and only while nothing is happening.

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
ANTHROPIC_API_KEY=sk-... .venv/bin/uvicorn main:app --reload --port 8000
# State lands in backend/.data/api.db (gitignored). Override with RF_DB_PATH.
```

The root dev server (`npm run dev`, :8080) and rise-and-rhyme's own dev
server (:5198) both proxy `/api` to :8000. Tests: `.venv/bin/python -m
pytest tests` (no API key or network needed — Claude and feed fetches are
mocked).

## Privacy posture (what this service must keep true)

- Raw iCal URLs and raw IP addresses are **not** persisted — only SHA-256
  hashes, each deleted automatically once its rate-limit window closes, plus
  per-generation cost/track/mood/event-count logs.
- Calendar event details are sent to the Claude API to write lyrics and
  are not stored after the response is returned.
- The SSRF allowlist in `backend/services/ical_parser.py` restricts
  fetches to known calendar providers over https only.

Public-facing copy that mirrors this: `site/privacy.html` ("Cloud-Assisted
Tools") and `tools/rise-and-rhyme/frontend/src/privacy/`.
