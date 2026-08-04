#!/usr/bin/env python3
"""Verify a RunPod ACE-Step endpoint against the contract the backend expects.

Run this BEFORE wiring the backend up. It submits the same payload shape
`backend/services/runpod_client.py` will send and asserts the response matches
what that client will parse — so a pass here means the integration cannot fail
on shape, only on quality.

Stdlib only, so it runs on a laptop with no venv:

    export RUNPOD_API_KEY=...
    export RUNPOD_ENDPOINT_ID=...
    python3 test_endpoint.py

Writes the decoded song to ./out-cold.mp3 and ./out-warm.mp3. Listening to
those is the real test; this script only proves the plumbing.
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://api.runpod.ai/v2"

DEFAULT_LYRICS = """[verse]
Good morning Ken it's a Monday
Standup at nine with the crew
Design review lands at eleven
Then the afternoon belongs to you

[chorus]
Up and at 'em, the day is new
Three things waiting, that's all you do"""

DEFAULT_PROMPT = "indie pop, upbeat, bright morning energy, acoustic guitar, male vocal"


def _post(url: str, key: str, payload: dict, timeout: int = 30) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _get(url: str, key: str, timeout: int = 30) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _fail(msg: str) -> None:
    print(f"  FAIL  {msg}")
    sys.exit(1)


def _ok(msg: str) -> None:
    print(f"  ok    {msg}")


def run_once(key: str, endpoint: str, label: str, lyrics: str, prompt: str,
             duration: float, poll_timeout: int) -> float:
    """Submit one job, validate the response contract, write the MP3."""
    print(f"\n--- {label} run ---")
    payload = {"input": {"lyrics": lyrics, "prompt": prompt, "duration": duration}}

    started = time.monotonic()
    try:
        submitted = _post(f"{API}/{endpoint}/run", key, payload)
    except urllib.error.HTTPError as exc:
        _fail(f"submit returned HTTP {exc.code}: {exc.read().decode()[:300]}")
    except urllib.error.URLError as exc:
        _fail(f"cannot reach RunPod: {exc.reason}")

    job_id = submitted.get("id")
    if not job_id:
        _fail(f"no job id in submit response: {submitted}")
    _ok(f"submitted, job {job_id}")

    # Poll. A cold start pulls a ~10 GB image, so the first run is slow by
    # design; that is the number worth knowing, not a problem to fix here.
    status = None
    while True:
        elapsed = time.monotonic() - started
        if elapsed > poll_timeout:
            _fail(f"still {status} after {poll_timeout}s — raise the endpoint's "
                  f"execution timeout, or the GPU is too small for this duration")
        body = _get(f"{API}/{endpoint}/status/{job_id}", key)
        status = body.get("status")
        if status in ("COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"):
            break
        print(f"        {status} ({elapsed:.0f}s)", end="\r")
        time.sleep(3)

    total = time.monotonic() - started
    print(" " * 40, end="\r")
    if status != "COMPLETED":
        _fail(f"job ended {status}: {json.dumps(body)[:500]}")
    _ok(f"completed in {total:.1f}s")

    # --- contract assertions: everything runpod_client.py will rely on ---
    out = body.get("output")
    if not isinstance(out, dict):
        _fail(f"output is not an object: {type(out).__name__} — {str(out)[:200]}")

    if out.get("status") == "error":
        _fail(f"handler reported an error: {out.get('message')}")
    if out.get("status") != "ok":
        _fail(f"expected output.status 'ok', got {out.get('status')!r}")
    _ok("output.status == 'ok'")

    b64 = out.get("audio_base64")
    if not isinstance(b64, str) or not b64:
        _fail("output.audio_base64 missing or empty")
    try:
        audio = base64.b64decode(b64, validate=True)
    except Exception as exc:
        _fail(f"audio_base64 is not valid base64: {exc}")
    _ok(f"audio_base64 decodes ({len(audio) / 1024:.0f} KiB, "
        f"{len(b64) / 1024:.0f} KiB on the wire)")

    # An MP3 starts with an ID3 tag or a frame sync (11 set bits).
    if not (audio[:3] == b"ID3" or (audio[0] == 0xFF and audio[1] & 0xE0 == 0xE0)):
        _fail(f"not an MP3 — first bytes {audio[:4].hex()}. ffmpeg encode likely failed")
    _ok("decodes to a real MP3")

    sr = out.get("sample_rate")
    if not isinstance(sr, int) or sr <= 0:
        _fail(f"sample_rate should be a positive int, got {sr!r}")
    _ok(f"sample_rate = {sr}")

    dur = out.get("duration_seconds")
    if not isinstance(dur, (int, float)) or dur <= 0:
        _fail(f"duration_seconds should be a positive number, got {dur!r}")
    if abs(dur - duration) > max(5.0, duration * 0.25):
        print(f"  warn  asked for {duration}s, got {dur:.1f}s — check audio_duration "
              f"is being honoured before trusting the alarm timing")
    else:
        _ok(f"duration_seconds = {dur:.1f} (asked {duration})")

    # RunPod caps response payloads; a song long enough to exceed it fails here
    # rather than mysteriously in production.
    wire_mb = len(b64) / 1_000_000
    if wire_mb > 8:
        print(f"  warn  {wire_mb:.1f} MB response is near RunPod's payload cap — "
              f"switch to an S3/R2 upload before increasing duration or bitrate")

    path = f"out-{label}.mp3"
    with open(path, "wb") as fh:
        fh.write(audio)
    _ok(f"wrote {path}  <-- LISTEN TO THIS")
    return total


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--duration", type=float, default=45.0)
    ap.add_argument("--prompt", default=DEFAULT_PROMPT)
    ap.add_argument("--lyrics", default=DEFAULT_LYRICS)
    ap.add_argument("--timeout", type=int, default=420,
                    help="seconds to wait per job (default 420: a cold start "
                         "pulls a ~10 GB image)")
    ap.add_argument("--once", action="store_true",
                    help="skip the second (warm) run")
    args = ap.parse_args()

    key = os.getenv("RUNPOD_API_KEY")
    endpoint = os.getenv("RUNPOD_ENDPOINT_ID")
    if not key or not endpoint:
        sys.exit("set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID first")

    print(f"endpoint {endpoint}, {args.duration}s song")
    cold = run_once(key, endpoint, "cold", args.lyrics, args.prompt,
                    args.duration, args.timeout)

    warm = None
    if not args.once:
        # Immediately re-submit so the worker is still warm. The gap between
        # the two numbers is the cold-start cost the backend has to design for.
        warm = run_once(key, endpoint, "warm", args.lyrics, args.prompt,
                        args.duration, args.timeout)

    print("\n" + "=" * 58)
    print("CONTRACT OK — the backend integration will parse this response.")
    print(f"  cold start: {cold:.0f}s")
    if warm is not None:
        print(f"  warm:       {warm:.0f}s   (cold-start penalty {cold - warm:+.0f}s)")
        if warm > 55:
            print("\n  NOTE: warm runs exceed ~55s, so a blocking request would be")
            print("  cut off by nginx's 60s proxy_read_timeout. The async job +")
            print("  polling design handles this; do not switch to blocking.")
    print("\nNow LISTEN to out-cold.mp3. Shape passing is not quality passing —")
    print("if it sounds bad, no amount of backend code fixes that.")
    print("=" * 58)


if __name__ == "__main__":
    main()
