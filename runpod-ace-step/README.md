# ACE-Step worker (Rise & Rhyme v2)

RunPod Serverless worker that turns lyrics into a sung song. Lives in this repo
rather than its own so the handler's input/output contract stays versioned
beside `backend/services/runpod_client.py`, which is the only thing that calls
it.

Not part of any deploy: `build.sh` discovers tools from `tools/*/frontend/`,
and the Deploy workflow rsyncs only `dist/` and `backend/`. This directory is
built and pushed by hand, on the rare occasions it changes.

## Contract

```jsonc
// input
{ "lyrics": "[verse]\nGood morning...", "prompt": "indie pop, upbeat, bright",
  "duration": 60, "seed": 1234 }

// output
{ "status": "ok", "audio_base64": "<mp3 bytes>", "sample_rate": 48000,
  "duration_seconds": 60.0 }
{ "status": "error", "message": "..." }
```

`prompt` describes the music; `lyrics` are sung. They are separate pipeline
arguments — concatenating them makes the model sing the genre tags.

## Build and push

```bash
docker build -t <dockerhub-user>/ace-step-worker:latest .
docker push  <dockerhub-user>/ace-step-worker:latest
```

The build downloads model weights (~10 GB), so expect a slow first build and a
large image. No GPU is needed to build — only to run.

## Endpoint settings

| Setting | Value | Why |
|---|---|---|
| GPU | RTX 3090 / 4090 (24 GB) | ACE-Step 1.5 wants ≥6 GB VRAM at 48 kHz stereo; 24 GB cards are cheap and always available |
| Min workers | 0 | scale to zero — songs are generated once a night |
| Max workers | 2 | caps runaway spend |
| Idle timeout | 30 s | keeps a worker warm through a burst |
| Execution timeout | 180 s | cold start + generation, with headroom |
| FlashBoot | on | materially cuts cold start |

## Verify before wiring the backend

```bash
curl -X POST "https://api.runpod.ai/v2/$RUNPOD_ENDPOINT_ID/run" \
  -H "Authorization: Bearer $RUNPOD_API_KEY" -H "Content-Type: application/json" \
  -d '{"input":{"lyrics":"[verse]\nGood morning Ken it'\''s Monday\nStandup at nine with the crew\n[chorus]\nUp and at em, the day is new","prompt":"indie pop, upbeat, morning, cheerful","duration":30}}'

# -> {"id":"...","status":"IN_QUEUE"}; then poll:
curl "https://api.runpod.ai/v2/$RUNPOD_ENDPOINT_ID/status/<id>" \
  -H "Authorization: Bearer $RUNPOD_API_KEY"
```

Decode `output.audio_base64` to a file and listen to it before pointing the
backend at the endpoint. Quality, not just a 200, is the thing being checked.

## Known sharp edges

- **`audio_base64` is capped by RunPod's response size.** A 60 s 128 kbps MP3
  is ~1 MB, ~1.3 MB base64 — fine. Longer songs or a higher bitrate will
  eventually hit the limit; switch to an S3/R2 upload with a returned URL if
  that day comes.
- **`diffusers` is installed from `main`.** `AceStepPipeline` had not appeared
  in a tagged release when this was written. Pin a commit as soon as one ships.
- **The pipeline call is verified against the diffusers docs, not run here.**
  Nobody in this repo has executed it on a GPU. Treat the first real generation
  as the actual test of `pipe(...)`, `.audios`, and `pipe.sample_rate`.
