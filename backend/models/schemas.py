"""Pydantic request/response models for /api/v1/rise-and-rhyme."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    ical_url: str = Field(min_length=12, max_length=2048)
    target_date: date
    preferred_genre: str = "any"
    # IANA zone the target_date is expressed in. A calendar day is meaningless
    # without one: expanding "2026-07-30" in UTC for a Chicago user silently
    # drops their evening events and shifts every time in the lyrics.
    timezone: str = Field(default="UTC", max_length=64)


class GenerateOk(BaseModel):
    """Lyrics are ready and there is no sung song coming.

    This is the whole response in v1 mode (RunPod not configured), and it is
    also what a caller gets when song generation could not be started — hence
    `song`, which tells the UI whether to explain a downgrade or just play.
    """

    status: Literal["ok"] = "ok"
    lyrics: list[str]
    track_id: str
    mood: str
    event_count: int
    generated_at: str
    cache_until: str
    # "off"       — sung songs aren't enabled; nothing was lost, say nothing
    # "unavailable" — they are enabled but this one couldn't start; say so
    song: Literal["off", "unavailable"] = "off"
    song_message: str = ""


class GeneratePending(BaseModel):
    """Lyrics are ready; the sung song is still on the GPU.

    Carries the complete v1 payload as well as the job id. That redundancy is
    the fallback: if polling fails, times out, or the browser is offline in the
    morning, the client already holds everything it needs to wake someone with
    the backing track and browser speech instead.
    """

    status: Literal["pending"] = "pending"
    job_id: str
    # Rough seconds, for the progress UI. A cold GPU worker is much slower than
    # a warm one, so this is a hint to display, never a deadline to enforce.
    estimated_seconds: int
    poll_after: int
    lyrics: list[str]
    track_id: str
    mood: str
    event_count: int
    generated_at: str
    cache_until: str


class SongPending(BaseModel):
    status: Literal["pending"] = "pending"
    elapsed_seconds: int
    poll_after: int


class SongReady(BaseModel):
    status: Literal["ready"] = "ready"
    song_url: str
    duration_seconds: float


class SongFailed(BaseModel):
    """The sung song is not coming. The client falls back to the v1 path.

    A distinct status rather than an HTTP error: the client is not broken, it
    just needs to stop polling and use the lyrics it already has.
    """

    status: Literal["failed"] = "failed"
    message: str


class GenerateRateLimited(BaseModel):
    status: Literal["rate_limited"] = "rate_limited"
    message: str
    retry_after: int


class GenerateCapacity(BaseModel):
    status: Literal["capacity"] = "capacity"
    message: str
    fallback: bool = True


class GenerateError(BaseModel):
    status: Literal["error"] = "error"
    message: str


class PreviewRequest(BaseModel):
    ical_url: str = Field(min_length=12, max_length=2048)
    target_date: date
    timezone: str = Field(default="UTC", max_length=64)
    preferred_genre: str = "any"


class PreviewEvent(BaseModel):
    """One row of the preview list. `time` is pre-formatted in the caller's
    zone so the UI shows exactly what the songwriter will be told."""

    time: str
    summary: str
    all_day: bool


class PreviewOk(BaseModel):
    status: Literal["ok"] = "ok"
    target_date: str
    # Echoed back so a wrong timezone is visible in the UI — the failure mode
    # that silently produced wrong songs before it was part of the contract.
    timezone: str
    event_count: int
    events: list[PreviewEvent]
    truncated: bool
    mood: str


class SpendMetrics(BaseModel):
    generations_today: int
    spend_today: float
    daily_spend_cap: float
    spend_7d: float
    spend_30d: float
    generations_30d: int
    projected_monthly: float


class Health(BaseModel):
    """Liveness is public; the money is not.

    /health is served publicly through nginx, so the spend figures are gated
    behind RF_METRICS_TOKEN — publishing them would also tell anyone how close
    the daily cap is to exhausted. `metrics` is None when the caller didn't
    present the token, or when no token is configured at all (fail closed)."""

    status: str
    circuit_open: bool
    metrics: SpendMetrics | None = None
