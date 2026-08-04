# RunPod setup — ACE-Step song generation

How to stand up the GPU endpoint that Rise & Rhyme v2 calls to turn lyrics
into an actual sung song. Everything here is manual and one-time; the worker
source is `runpod-ace-step/`.

Do this **before** the backend integration lands. The endpoint is the part
with real-world unknowns (does the model sound good, what does a cold start
cost), and there is no point writing retry logic around a service that has
not been heard yet.

```
backend (droplet)                     RunPod Serverless
  runpod_client.py ──POST /run───────▶ queue ──▶ GPU worker (cold start: pull
        │                                        image, load model to VRAM)
        └──GET /status/{id}──(poll)──▶            │
                                                  ▼
                                        handler.py: AceStepPipeline
                                        ffmpeg → MP3 → base64
```

## What it costs

Billed per GPU-second, only while a job runs. Scale-to-zero means an idle
endpoint costs nothing.

| | |
|---|---|
| Generation | ~20–40 GPU-seconds for a 45 s song on a 24 GB card |
| Rate | ~$0.00025–0.0005 /s (varies by card and region) |
| **Per song** | **~$0.01–0.02**, plus cold-start seconds on the first of the day |
| One person, nightly | well under $1/month |

Cold starts are billed too, which is the argument for baking weights into the
image rather than downloading them per worker.

## Prerequisites

- RunPod account with a payment method and a few dollars of credit.
- A container registry account (Docker Hub free tier is fine).
- For **Path A**: Docker, ~30 GB free disk, and patience for a ~10 GB push.
- For **Path B**: nothing local at all.

---

## Step 1 — get the image built

The image bakes in the model weights (~10 GB), so it is large by design. On a
scale-to-zero endpoint, downloading weights at runtime would put that download
on the critical path of the first song every morning.

### Path A — build locally, push to Docker Hub

```bash
cd runpod-ace-step
docker build --platform linux/amd64 -t <dockerhub-user>/ace-step-worker:v1 .
docker push <dockerhub-user>/ace-step-worker:v1
```

> **`--platform linux/amd64` is not optional on an Apple Silicon Mac.** Docker
> would otherwise build an arm64 image, which RunPod's x86 GPU hosts cannot
> run. The failure shows up as an exec-format error in the worker log, long
> after the slow push has finished.

Expect the build to take a while — it downloads the weights — and the push to
be bound by your upstream bandwidth. Tag with `:v1` rather than `:latest`, so
that pushing a fix later is a deliberate endpoint change and not a silent
swap under a running worker.

### Path B — let RunPod build from GitHub (no local Docker)

RunPod can build the image itself from a repo, which avoids pushing 10 GB from
a laptop and is usually the faster route.

1. RunPod console → **Serverless** → **New Endpoint** → source **GitHub**.
2. Authorize the RunPod GitHub app; grant it `thekensman/restless-forge`
   (private repos are supported once the app is installed on them).
3. Branch: whichever carries `runpod-ace-step/`. Build context / Dockerfile
   path: `runpod-ace-step/Dockerfile`.

RunPod then rebuilds on each push to that branch. Convenient, but note it also
means a merge can change your endpoint — pin to a branch you control if that
matters.

## Step 2 — create the endpoint

Serverless → New Endpoint → point it at the image (Path A) or repo (Path B).

| Setting | Value | Why |
|---|---|---|
| GPU | 24 GB (RTX 4090 / 3090 / A5000) | ACE-Step 1.5 needs ≥6 GB VRAM at 48 kHz stereo; 24 GB tier is cheap and has the best availability |
| Active (min) workers | **0** | scale to zero — one song a night; a min worker bills 24/7 |
| Max workers | **2** | caps runaway spend if something retries in a loop |
| Idle timeout | 30 s | keeps the worker warm across a retry or a second attempt |
| Execution timeout | **180 s** | must exceed cold start + generation, or jobs are killed mid-song |
| FlashBoot | **on** | materially cuts cold start; free |
| Container disk | ≥ 20 GB | the image alone is ~10 GB |

Leave the queue delay / scaling strategy at defaults. Nothing about this
workload benefits from tuning them at one request per day.

## Step 3 — credentials

- **Endpoint ID**: on the endpoint page, and in its URL
  (`.../serverless/<endpoint-id>`).
- **API key**: Settings → API Keys → **+ API Key**. Read/write is fine. It is
  shown once — copy it now.

Keep both out of the repo. They belong in `/etc/restless-forge/api.env` on the
droplet (Step 6) and nowhere else.

## Step 4 — smoke test

```bash
export RUNPOD_API_KEY=...
export RUNPOD_ENDPOINT_ID=...

curl -X POST "https://api.runpod.ai/v2/$RUNPOD_ENDPOINT_ID/run" \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"lyrics":"[verse]\nGood morning Ken it'\''s Monday\nStandup at nine with the crew\n[chorus]\nUp and at em, the day is new","prompt":"indie pop, upbeat, bright","duration":30}}'
```

Returns `{"id":"...","status":"IN_QUEUE"}`. Poll it:

```bash
curl "https://api.runpod.ai/v2/$RUNPOD_ENDPOINT_ID/status/<id>" \
  -H "Authorization: Bearer $RUNPOD_API_KEY"
```

The first call is a cold start and can take minutes while the image is pulled
onto a host. That is expected once, not every time.

## Step 5 — conformance test (this is the one that matters)

`runpod-ace-step/test_endpoint.py` submits the exact payload shape the backend
will send and asserts every field the client will parse. Stdlib only, no venv:

```bash
cd runpod-ace-step
export RUNPOD_API_KEY=...  RUNPOD_ENDPOINT_ID=...
python3 test_endpoint.py                 # cold + warm run, 45 s song
python3 test_endpoint.py --duration 60 --once
```

It checks the job completes, `output.status == "ok"`, `audio_base64` decodes,
the bytes are a real MP3 (not an ffmpeg failure), `sample_rate` and
`duration_seconds` are sane, and the payload is clear of RunPod's response-size
cap. It writes `out-cold.mp3` / `out-warm.mp3` and reports the cold-start
penalty.

**A pass means the integration cannot fail on shape — only on quality.**

## Step 6 — quality gate

Listen to `out-cold.mp3`. This is a judgement only you can make, and it is the
actual go/no-go for the migration: no amount of backend code rescues a model
that sounds bad singing your calendar.

Worth trying before deciding:

- **The `prompt`** carries the genre and mood and is the biggest lever —
  `"indie pop, upbeat, acoustic guitar, male vocal"` versus
  `"lo-fi hip hop, mellow, jazzy keys"`. This becomes the tool's music-style
  picker, so try the styles you would actually ship.
- **Section tags.** Lyrics need `[verse]` / `[chorus]` markers; without them
  the model has no structure to follow and the result wanders. The lyric
  generator's Claude prompt will be changed to emit them.
- **Duration.** Longer is not better — a 45 s song with a strong chorus beats
  90 s of filler, and costs half as much.

If quality is not there, say so before I write the integration. The fallback
options (keep TTS + music bed, or try a different model) are much cheaper to
choose now than after the backend is rewritten around this.

## Step 7 — wire it into the droplet

Only after Steps 5 and 6 pass:

```bash
ssh <droplet>
sudo nano /etc/restless-forge/api.env
```

```ini
RUNPOD_API_KEY=...
RUNPOD_ENDPOINT_ID=...
```

```bash
sudo systemctl restart restless-forge-api
curl -s localhost:8000/api/v1/rise-and-rhyme/health
```

That file is created-if-missing by the deploy and is never overwritten, so
this edit survives deploys — the same way `RF_METRICS_TOKEN` is handled. Add
both values to the GitHub repo secrets too if you want a rebuilt droplet to
come up already configured.

The integration will be **feature-flagged on the presence of these two
variables**: unset, the backend behaves exactly as it does today. That makes
this step the actual v2 switch, and unsetting them the rollback.

---

## The contract (frozen)

`runpod-ace-step/handler.py` and `backend/services/runpod_client.py` are two
halves of one interface. Changing either without the other breaks production.

```jsonc
// input
{ "lyrics": "[verse]\n...",              // required; section-tagged
  "prompt": "indie pop, upbeat, bright", // music description, NOT sung
  "duration": 45,                        // seconds, clamped to 10..90
  "seed": 1234 }                         // optional, for reproducibility

// output — success
{ "status": "ok", "audio_base64": "<mp3>", "sample_rate": 48000,
  "duration_seconds": 45.0 }

// output — failure (a result, not an exception)
{ "status": "error", "message": "RuntimeError: CUDA out of memory" }
```

`prompt` and `lyrics` are **separate** fields. Concatenating them makes the
model sing the genre tags out loud.

Errors come back as `status: "error"` with a message rather than a raised
exception, because a raised exception marks the job FAILED with no detail and
the caller sees only a timeout.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `exec format error` in worker logs | arm64 image on an x86 host — rebuild with `--platform linux/amd64` |
| Job sits `IN_QUEUE` for minutes | normal cold start (10 GB image pull). Persistent → no GPU capacity in region; add a second GPU type |
| `TIMED_OUT` | execution timeout below cold start + generation; raise to 180 s |
| `status: "error"`, CUDA out of memory | GPU too small — use the 24 GB tier, or lower `duration` |
| `status: "error"`, `AceStepPipeline` import error | `diffusers` is installed from `main`; the API moved. Pin a working commit in `requirements.txt` |
| Output is not an MP3 | ffmpeg encode failed — check it is in the image (`libsndfile1`, `ffmpeg` apt line) |
| Model sings the genre tags | `prompt` was folded into `lyrics`; they are separate fields |
| Song is shapeless, no structure | lyrics lack `[verse]` / `[chorus]` tags |
| Response too large | 128 kbps at 45 s is ~1 MB; long/high-bitrate songs approach RunPod's cap. Move to an S3/R2 upload returning a URL |
| Bill higher than expected | check Active (min) workers is **0**, not 1 |

## Related

- `runpod-ace-step/README.md` — worker internals, build/push commands
- `docs/backend.md` — the service that will call this, cost caps, circuit breaker
- `docs/infrastructure.md` — droplet, nginx, certs
