"""RunPod Serverless client — submits ACE-Step jobs and reads their status.

The other half of this interface is `runpod-ace-step/handler.py` in this repo,
and `docs/runpod-setup.md` documents the frozen contract. Changing the payload
or the response keys here without changing the handler breaks production.

Deliberately **synchronous** (httpx.Client, not AsyncClient): every route in
this service is a plain `def` running in FastAPI's threadpool, and an async
client would need an event loop that isn't there.

Deliberately **non-blocking across the job**: submit returns as soon as RunPod
accepts the job, and status is one fast lookup. Waiting for a 40-second GPU job
inside a request would blow through nginx's 60s proxy_read_timeout and, worse,
occupy the single uvicorn worker for the duration — health checks included.
"""

from __future__ import annotations

import base64
import binascii
import logging
from dataclasses import dataclass

import httpx

from config import Settings

log = logging.getLogger("rf.runpod")

API_BASE = "https://api.runpod.ai/v2"

# Submitting is a small POST; status is smaller. Neither waits for the GPU.
SUBMIT_TIMEOUT = 20.0
STATUS_TIMEOUT = 20.0

# RunPod's terminal states. Anything else means "still working".
_TERMINAL_FAILURES = {"FAILED", "CANCELLED", "TIMED_OUT"}


class RunPodError(Exception):
    """RunPod itself is unreachable or erroring — feeds the circuit breaker."""


@dataclass
class SongResult:
    """Outcome of one status poll.

    `pending` is the common case and carries nothing else. A terminal poll
    carries either audio or a message, never both.
    """

    state: str  # "pending" | "ready" | "failed"
    audio: bytes | None = None
    sample_rate: int = 0
    duration_seconds: float = 0.0
    execution_ms: int = 0
    message: str = ""

    @property
    def terminal(self) -> bool:
        return self.state != "pending"


def _headers(settings: Settings) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.runpod_api_key}",
        "Content-Type": "application/json",
    }


def submit(
    lyrics: str,
    style: str,
    settings: Settings,
    *,
    client: httpx.Client | None = None,
) -> str:
    """Queue a song. Returns RunPod's job id.

    `lyrics` must already carry [verse]/[chorus] section tags, and `style` is
    the music description — they are separate fields because ACE-Step sings
    whatever is in `lyrics`. Merging them makes it sing the genre tags aloud.
    """
    payload = {
        "input": {
            "lyrics": lyrics,
            "prompt": style,
            "duration": settings.song_duration_sec,
        }
    }
    url = f"{API_BASE}/{settings.runpod_endpoint_id}/run"
    try:
        if client is None:
            with httpx.Client(timeout=SUBMIT_TIMEOUT) as c:
                response = c.post(url, json=payload, headers=_headers(settings))
        else:
            response = client.post(url, json=payload, headers=_headers(settings))
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise RunPodError(f"submit failed: {exc}") from exc

    job_id = data.get("id") if isinstance(data, dict) else None
    if not job_id:
        raise RunPodError(f"submit returned no job id: {str(data)[:200]}")
    return str(job_id)


def poll(runpod_job_id: str, settings: Settings, *, client: httpx.Client | None = None) -> SongResult:
    """One status check. Fast — never waits for the GPU.

    A worker-side error arrives as a COMPLETED job whose output says
    `status: "error"` (the handler returns errors rather than raising, so the
    reason survives). That is a failed song, not a failed service, so it does
    NOT raise: the caller serves the fallback without tripping the breaker.
    """
    url = f"{API_BASE}/{settings.runpod_endpoint_id}/status/{runpod_job_id}"
    try:
        if client is None:
            with httpx.Client(timeout=STATUS_TIMEOUT) as c:
                response = c.get(url, headers=_headers(settings))
        else:
            response = client.get(url, headers=_headers(settings))
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise RunPodError(f"status check failed: {exc}") from exc

    if not isinstance(data, dict):
        raise RunPodError("status response was not an object")

    state = str(data.get("status") or "").upper()
    execution_ms = int(data.get("executionTime") or 0)

    if state in _TERMINAL_FAILURES:
        return SongResult("failed", execution_ms=execution_ms, message=f"RunPod job {state.lower()}")
    if state != "COMPLETED":
        return SongResult("pending")

    output = data.get("output")
    if not isinstance(output, dict):
        return SongResult("failed", execution_ms=execution_ms, message="worker returned no output")

    if output.get("status") != "ok":
        detail = str(output.get("message") or "unknown worker error")
        log.warning("ACE-Step worker error: %s", detail)
        return SongResult("failed", execution_ms=execution_ms, message=detail)

    encoded = output.get("audio_base64")
    if not isinstance(encoded, str) or not encoded:
        return SongResult("failed", execution_ms=execution_ms, message="worker returned no audio")
    try:
        audio = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        return SongResult("failed", execution_ms=execution_ms, message="worker returned unreadable audio")

    # Cheap sanity check before this reaches a browser as audio/mpeg: an MP3
    # starts with an ID3 tag or a frame sync. Catches an ffmpeg failure that
    # would otherwise be diagnosed as "the alarm played silence".
    if not (audio[:3] == b"ID3" or (len(audio) > 2 and audio[0] == 0xFF and audio[1] & 0xE0 == 0xE0)):
        return SongResult("failed", execution_ms=execution_ms, message="worker returned non-MP3 data")

    return SongResult(
        "ready",
        audio=audio,
        sample_rate=int(output.get("sample_rate") or 0),
        duration_seconds=float(output.get("duration_seconds") or 0.0),
        execution_ms=execution_ms,
    )


def cost_for(execution_ms: int, settings: Settings) -> float:
    """GPU seconds turned into dollars for the shared daily spend cap.

    An estimate from RunPod's reported execution time and the configured rate,
    not a reading from RunPod's billing — same caveat as the Claude figures.
    Set a spend limit in the RunPod console as well.
    """
    return max(0.0, execution_ms / 1000.0 * settings.runpod_cost_per_sec)
