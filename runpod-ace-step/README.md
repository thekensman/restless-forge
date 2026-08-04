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

## Setting it up

Full walkthrough — build, endpoint settings, credentials, testing, wiring it
to the droplet — is **`docs/runpod-setup.md`**. Kept there rather than here so
there is one copy to drift out of date instead of two.

Short version:

```bash
docker build --platform linux/amd64 -t <dockerhub-user>/ace-step-worker:v1 .
docker push  <dockerhub-user>/ace-step-worker:v1
```

`--platform linux/amd64` matters on Apple Silicon: RunPod's GPU hosts are x86,
and an arm64 image fails with an exec-format error only once it is deployed.

## Verify before wiring the backend

```bash
export RUNPOD_API_KEY=...  RUNPOD_ENDPOINT_ID=...
python3 test_endpoint.py
```

`test_endpoint.py` sends the payload the backend will send and asserts every
field the client will parse, then writes the song to `out-cold.mp3`. Listen to
it. Quality, not a 200, is what is actually being checked.

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
