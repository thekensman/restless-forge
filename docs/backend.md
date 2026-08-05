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
                       songs in      /var/lib/restless-forge/song-cache
                       env/secrets   /etc/restless-forge/api.env
                                    │
                                    ▼ (per generation)
                       calendar provider (allowlisted iCal fetch)
                       Anthropic Claude API (lyrics)
                       RunPod / ACE-Step  (sings them — async job, polled)

nginx also serves /api/v1/rise-and-rhyme/song/*.mp3 straight off disk,
bypassing the app entirely: it handles Range requests, which Safari and
iOS need for <audio>.
```

- **Code**: `backend/` in the repo. Routes per tool under
  `/api/v1/<tool>/`; currently `rise_and_rhyme` (generate, preview,
  song-status, song audio, health).
- **No containers, no DB server** — stdlib SQLite, single uvicorn worker
  (the droplet has 1 GB RAM).

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/rise-and-rhyme/generate` | iCal → Claude lyrics → queue the sung song. Returns `pending` (job queued) or `ok` (lyrics only) |
| `POST /api/v1/rise-and-rhyme/preview` | iCal → event list + mood. **No model call, no cost.** |
| `GET /api/v1/rise-and-rhyme/song-status/{job_id}` | poll one song job: `pending` / `ready` / `failed` |
| `GET /api/v1/rise-and-rhyme/song/{token}.mp3` | the recording. **Served by nginx in production**, not this app |
| `GET /api/v1/rise-and-rhyme/health` | liveness + circuit state publicly; spend figures with `X-Metrics-Token` (§ Monitoring the bill) |

### Why songs are a job, not a response

Generation takes tens of seconds on a GPU. Returning it inline cannot work
here for two independent reasons: nginx cuts responses at
`proxy_read_timeout 60s`, and this service runs **one** uvicorn worker (1 GB
droplet), so a blocking call would hold the entire API — health checks
included — for the duration. `/generate` therefore returns as soon as the
lyrics exist, and the browser polls `song-status`.

The poll endpoint has **its own nginx rate-limit zone** (`rf_poll`, 60 r/m).
The general `rf_api` zone is 10 r/m and a 5-second poll is 12 r/m — sharing it
would throttle the first song partway through, in production only.

Note the path is `/song-status/{id}`, **not** `/song/{id}/status`: nginx serves
`/song/` straight off disk, so anything under that prefix never reaches the app.

### Falling back to v1

Sung songs are enabled only when `RUNPOD_API_KEY` **and** `RUNPOD_ENDPOINT_ID`
are set. Unset is a supported production state, not a misconfiguration — the
service then behaves exactly as v1 (lyrics + backing track + browser speech).
**Clearing the two variables and restarting is the rollback.**

Failures degrade rather than propagate, because the worst outcome this tool has
is an alarm that does not ring:

| Failure | Result |
|---|---|
| RunPod submit fails | `ok` + `song: "unavailable"` + a message; caller keeps the lyrics |
| A poll fails (network) | stays `pending` — a dropped poll says nothing about the job |
| Job fails on the worker | `failed` + reason; client uses lyrics + TTS |
| Job exceeds `SONG_JOB_TIMEOUT_SEC` | `failed`; same |
| Audio swept before playback | 404 with "expired"; client falls back |

The `pending` response deliberately carries the **complete** v1 payload
(lyrics, track, mood, cache window), so a browser that never manages to poll
still has everything it needs to ring.

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

Bootstrapped by the **first** deploy from the `ANTHROPIC_API_KEY`,
`RF_METRICS_TOKEN`, and `ALERT_WEBHOOK_URL` GitHub secrets; never overwritten
afterwards — this file is the server-side source of truth for ops changes.

**On a droplet that is already running, adding a var is a manual edit** — the
deploy will not touch an existing `api.env`:

```bash
$EDITOR /etc/restless-forge/api.env
systemctl restart restless-forge-api
```

| Var | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | — (required) | Claude API key |
| `CLAUDE_MODEL` | `claude-opus-5` | lyric model |
| `CLAUDE_INPUT_COST_PER_MTOK` / `CLAUDE_OUTPUT_COST_PER_MTOK` | `5.0` / `25.0` | pricing used for spend tracking — update if the model changes |
| `DAILY_GEN_CAP` | `500` | global generations/day |
| `DAILY_SPEND_CAP` | `10.0` | USD/day hard stop |
| `ALERT_WEBHOOK_URL` | empty | optional webhook for spend/circuit alerts (always logged regardless) |
| `RF_METRICS_TOKEN` | empty | shared secret that unlocks the spend figures on `/health`. Empty = they are omitted entirely (fail closed). See § Monitoring the bill. |
| `PREVIEW_MAX_PER_HOUR` | `10` | Calendar previews per IP per hour (separate from the generate budget) |
| `RF_DB_PATH` | `backend/.data/api.db` (dev) | SQLite location. **Production sets this in the systemd unit** (`/var/lib/restless-forge/api.db`); the code default is deliberately local so a laptop or CI box can never touch real cost-control state. |
| `GENERATION_LOG_RETENTION_DAYS` | `30` | How long the generation/cost log is kept |
| `DAILY_STATS_RETENTION_DAYS` | `400` | How long per-day totals are kept |
| `RUNPOD_API_KEY` | empty | RunPod key. **With `RUNPOD_ENDPOINT_ID`, this is the v2 feature flag** — both set = sung songs; either missing = v1 behaviour. See `docs/runpod-setup.md`. |
| `RUNPOD_ENDPOINT_ID` | empty | RunPod serverless endpoint id |
| `SONG_DURATION_SEC` | `45` | Length of the generated song. Drives GPU seconds, i.e. the bill. |
| `SONG_JOB_TIMEOUT_SEC` | `300` | Give up on a job after this long; client falls back to TTS |
| `RUNPOD_COST_PER_SEC` | `0.0004` | GPU rate used for spend tracking (24 GB tier). Charged against the **same** `DAILY_SPEND_CAP` as Claude. |
| `SONG_RETENTION_HOURS` | `36` | How long recordings are kept. Floor is "overnight plus the whole target day" — a song made at 22:00 is played the next morning, so 24 is too short. |
| `RF_SONG_CACHE_DIR` | `backend/.data/song-cache` (dev) | Where MP3s live. **Production sets this in the systemd unit** (`/var/lib/restless-forge/song-cache`). Never under `/var/www`: that path is `rsync --delete`'d every deploy, and `ProtectSystem=strict` makes it unwritable anyway. |

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
| Alerts | WARNING log + optional webhook at 80% and 100% of the spend cap, and on circuit open (§ Monitoring the bill) |
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

## Monitoring the bill

The Claude API is the only part of restless-forge.dev that costs money per
use, so it gets its own watch. Two channels, split by how fast the thing they
watch moves:

| Channel | Watches | Latency | Configured by |
|---|---|---|---|
| **Webhook** (`ALERT_WEBHOOK_URL`) | daily spend crossing 80% and 100% of `DAILY_SPEND_CAP`; circuit breaker opening | real time, from the request that crosses the line | `api.env` on the droplet |
| **GitHub issue** (`.github/workflows/health-check.yml`) | API unreachable; breaker still open; the cap having been hit; trailing-30-day spend projecting past `MONTHLY_BUDGET_USD` | every 30 min (budget review once a day, 13:00 UTC) | `RF_METRICS_TOKEN` repo secret |

The split exists because a per-request alert can't see a slow bleed (a month of
$3 days never crosses a $10 cap), and a 30-minute poll is too slow for "the cap
just closed the tool for the day". Neither channel is load-bearing on its own.

### The `/health` metrics

`/health` is public through nginx, so it always reports liveness and
`circuit_open` — but the money is behind `RF_METRICS_TOKEN`. Publishing spend
would also tell anyone how close the daily cap is to exhausted, which is a
free denial-of-service hint. With no token configured the `metrics` object is
omitted entirely (fail closed), never accidentally public.

```bash
# Public: liveness only
curl -s https://restless-forge.dev/api/v1/rise-and-rhyme/health
# {"status":"ok","circuit_open":false,"metrics":null}

# With the token: the numbers
curl -s -H "X-Metrics-Token: $RF_METRICS_TOKEN" \
  https://restless-forge.dev/api/v1/rise-and-rhyme/health
```

| Field | Meaning |
|---|---|
| `generations_today`, `spend_today` | today so far (UTC day, same boundary the caps use) |
| `daily_spend_cap` | the cap `spend_today` is racing, echoed so a monitor needs no config of its own |
| `spend_7d`, `spend_30d`, `generations_30d` | trailing windows, from `daily_stats` (kept 400 days, so they outlive the 30-day detail log) |
| `projected_monthly` | the last 7 days as a run rate × 30. A run rate, **not a forecast** — with under a week of history it over-projects, which is the safe direction for a spend warning. |

### Setup

1. Generate a token and put the **same value** in both places:
   ```bash
   openssl rand -hex 32
   ```
   - droplet: add `RF_METRICS_TOKEN=<value>` to `/etc/restless-forge/api.env`,
     then `systemctl restart restless-forge-api`
   - GitHub: Settings → Secrets and variables → Actions → `RF_METRICS_TOKEN`
2. Optional real-time paging: add `ALERT_WEBHOOK_URL=<incoming webhook>` to
   `api.env` (Slack/Discord-style `{"text": ...}` payload) and restart.
3. Adjust `MONTHLY_BUDGET_USD` at the top of `health-check.yml` to whatever
   monthly Anthropic spend should be worth an email.

If the repo secret and `api.env` ever drift apart, the health check says so
explicitly ("Backend rejected the metrics token") rather than silently going
blind.

### These numbers are this service's belief, not Anthropic's

Every dollar figure here is computed from the token counts in each API
response multiplied by `CLAUDE_INPUT_COST_PER_MTOK` /
`CLAUDE_OUTPUT_COST_PER_MTOK`. Nothing reads your actual Anthropic balance. So:

- **Set a spend limit in the Anthropic Console.** That is the authoritative
  backstop; everything in this repo is a courtesy warning in front of it.
- If the model or its pricing changes, update those two env vars or the
  accounting silently drifts from reality.
- Spend accumulates as a SQLite `REAL`, so a threshold alert can fire one
  generation (~$0.01) late. Bounded and deliberate — see
  `backend/tests/test_alerting.py`.

### No calendar data is ever in an alert

Alerts and logs carry counts, dollars, and hashes — never event titles, never
calendar URLs, never IP addresses. This is enforced by
`test_alerting.py::TestAlertsCarryNoCalendarData`, which runs a full generation
with distinctive private event titles and asserts that none of them reach the
webhook payload, the log output, or the health response.

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
| `song_jobs` | random job token, RunPod job id, state, duration, billed flag | 72 h |

### Generated audio (on disk, not in SQLite)

MP3s live in `RF_SONG_CACHE_DIR` and are deleted after
`SONG_RETENTION_HOURS` (36) by a sweep that runs on the write path — same
reasoning as the triggers above.

Two properties worth preserving if this code is ever touched:

- **Filenames are `secrets.token_urlsafe`, never derived from the calendar
  URL.** nginx serves these files with no authentication and they *sing the
  listener's schedule aloud*; a name anyone could compute would publish it.
  The token is the only credential.
- **`song_jobs` rows outlive the audio (72 h vs 36 h) on purpose.** A client
  polling a song that was swept overnight then gets a clear "expired" instead
  of an unexplained miss at 6:30am.

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

# Today's numbers (add the token for the spend figures — see § Monitoring the bill)
curl -s -H "X-Metrics-Token: $RF_METRICS_TOKEN" \
  https://restless-forge.dev/api/v1/rise-and-rhyme/health

# Inspect the state DB
sqlite3 /var/lib/restless-forge/api.db 'SELECT * FROM daily_stats ORDER BY date DESC LIMIT 7;'

# What the last 30 days actually cost, day by day
sqlite3 -header -column /var/lib/restless-forge/api.db \
  "SELECT date, count, ROUND(spend,4) AS usd FROM daily_stats
   WHERE date >= date('now','-30 day') ORDER BY date DESC;"

# Alerts that fired (they are logged whether or not a webhook is configured)
journalctl -u restless-forge-api --since '7 days ago' --no-pager | grep ALERT
```

Monitoring: `.github/workflows/health-check.yml` probes the health
endpoint every 30 minutes and opens a `site-health` issue when it fails;
with `RF_METRICS_TOKEN` set it also watches the Anthropic spend. Full
picture in § Monitoring the bill.

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
- The lyrics — which *are* the calendar rephrased — are sent to RunPod to be
  sung. The iCal URL, the IP address, and the raw feed are not.
- Generated audio is stored under an unguessable random token, never a value
  derived from the calendar, and deleted within `SONG_RETENTION_HOURS`.
- The SSRF allowlist in `backend/services/ical_parser.py` restricts
  fetches to known calendar providers over https only.

**Two processors, not one.** Adding RunPod changed what the public copy has to
say, and four places assert it. All of them must move together:

- `site/privacy.html` ("Cloud-Assisted Tools")
- `tools/rise-and-rhyme/frontend/src/privacy/index.md`
- `tools/rise-and-rhyme/frontend/src/about/index.md` (info box)
- `tools/rise-and-rhyme/frontend/src/articles/what-actually-leaves-your-browser/index.md`

That last one is an article whose entire subject is this data flow. A stale
version of it is worse than no article, so treat it as part of the code.
Prose lives in the `.md`; run `npm run sync` to regenerate the HTML.
