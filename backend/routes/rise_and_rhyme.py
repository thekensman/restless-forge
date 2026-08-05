"""/api/v1/rise-and-rhyme — song generation + health."""

from __future__ import annotations

import hashlib
import logging
import random
import secrets
import time as time_mod
from datetime import datetime, time, timezone

from fastapi import APIRouter, Header, Request, Response
from fastapi.responses import FileResponse, JSONResponse

from models.schemas import (
    GenerateCapacity,
    GenerateError,
    GenerateOk,
    GeneratePending,
    GenerateRateLimited,
    GenerateRequest,
    Health,
    PreviewEvent,
    PreviewOk,
    PreviewRequest,
    SongFailed,
    SongPending,
    SongReady,
    SpendMetrics,
)
from services import (
    ical_parser,
    lyric_generator,
    mood_mapper,
    runpod_client,
    song_cache,
    song_jobs,
)

log = logging.getLogger("rf.rise_and_rhyme")

router = APIRouter(prefix="/api/v1/rise-and-rhyme")

FALLBACK_MESSAGE = "Song generation failed. Your alarm will use the fallback jingle."

# How often the client should come back while a song is on the GPU. Short
# enough to feel responsive, long enough that a 5-minute job is ~60 requests
# and not 300.
POLL_INTERVAL_SEC = 5
# Shown as a progress hint only. A warm worker finishes in well under this; a
# cold one takes longer. Never used as a deadline — song_job_timeout_sec is.
ESTIMATED_SECONDS = 75


def _client_ip(request: Request) -> str:
    # Cloudflare fronts the droplet; nginx forwards its CF-Connecting-IP.
    cf = request.headers.get("CF-Connecting-IP")
    if cf:
        return cf
    return request.client.host if request.client else "unknown"


@router.post("/generate")
def generate(body: GenerateRequest, request: Request) -> JSONResponse:
    settings = request.app.state.settings
    limiter = request.app.state.limiter

    # 1. SSRF boundary + timezone: only known providers, https, real IANA zone.
    try:
        url = ical_parser.validate_ical_url(body.ical_url)
        tz = ical_parser.resolve_timezone(body.timezone)
    except ical_parser.CalendarError as exc:
        return JSONResponse(GenerateError(message=str(exc)).model_dump(), status_code=400)

    url_hash = hashlib.sha256(url.encode()).hexdigest()
    ip = _client_ip(request)

    # 2. Circuit breaker (checked before reserving so a cooldown doesn't burn
    #    the caller's 12-hour slot).
    if limiter.circuit_open():
        return JSONResponse(
            GenerateCapacity(message="Song generation is cooling down. Try again soon.").model_dump(),
            status_code=503,
        )

    # 3. Atomically check every limit and claim the slot. Anything that fails
    #    after this point must release_url() so the caller can retry.
    denial = limiter.reserve(url_hash, ip)
    if denial is not None:
        if denial.kind == "rate_limited":
            return JSONResponse(
                GenerateRateLimited(message=denial.message, retry_after=denial.retry_after).model_dump(),
                status_code=429,
            )
        return JSONResponse(GenerateCapacity(message=denial.message).model_dump(), status_code=503)

    # The reservation is held ONLY for a generation that actually succeeded.
    # Every other exit — bad feed, API error, refusal, unexpected crash —
    # releases it in the `finally`, so a server-side problem never costs the
    # caller their 12-hour slot. (Abuse is still bounded: the per-IP counter
    # and any spend incurred are recorded regardless and are not released.)
    succeeded = False
    try:
        # 4. Fetch + expand the calendar in the caller's timezone.
        try:
            feed = ical_parser.fetch_feed(url)
            events = ical_parser.events_for_date(feed, body.target_date, tz)
        except ical_parser.CalendarError as exc:
            return JSONResponse(GenerateError(message=str(exc)).model_dump(), status_code=400)

        # 5. Lyrics from Claude.
        try:
            outcome = lyric_generator.generate_lyrics(events, body.target_date, settings)
        except lyric_generator.LyricApiError:
            limiter.record_api_error()
            log.exception("Claude API error")
            return JSONResponse(GenerateError(message=FALLBACK_MESSAGE).model_dump(), status_code=502)
        limiter.record_api_success()

        # 6. Track selection: Claude's mood wins; an explicit genre pref overrides.
        #    Seeded per calendar AND per day so retries are idempotent but the
        #    same calendar doesn't hear one identical track forever.
        mood = outcome.mood or mood_mapper.mood_for_events([e.summary for e in events])
        if body.preferred_genre != "any" and body.preferred_genre in mood_mapper.MOODS:
            mood = body.preferred_genre
        track_id = mood_mapper.pick_track(mood, random.Random(f"{url_hash}:{body.target_date}"))

        # 7. Record the attempt — including billed failures, which still cost
        #    money and must count against the daily spend cap.
        limiter.record_attempt(
            url_hash, outcome.cost, track_id, mood, len(events), succeeded=outcome.ok
        )

        if not outcome.ok:
            # Refusal or malformed output: not a service failure, so the
            # circuit breaker stays closed (the calendar is freed below).
            return JSONResponse(
                GenerateError(
                    message="Couldn't write a song for this calendar. Your alarm will use the fallback jingle."
                ).model_dump(),
                status_code=502,
            )

        # 8. Cache until the END OF THE TARGET DAY in the caller's timezone. A
        #    fixed UTC hour expired before the alarm for every zone west of it.
        now = datetime.now(timezone.utc)
        cache_until = datetime.combine(body.target_date, time.max, tzinfo=tz).astimezone(timezone.utc)
        common = {
            "lyrics": outcome.lyrics,
            "track_id": track_id,
            "mood": mood,
            "event_count": len(events),
            "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "cache_until": cache_until.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        # 9. Hand the lyrics to the GPU, if sung songs are switched on. The
        #    lyrics are already usable on their own, so every failure here
        #    degrades to the v1 response rather than losing the generation.
        if settings.song_generation_enabled:
            job_id = _start_song(request, outcome, mood)
            if job_id is not None:
                succeeded = True
                return JSONResponse(
                    GeneratePending(
                        job_id=job_id,
                        estimated_seconds=ESTIMATED_SECONDS,
                        poll_after=POLL_INTERVAL_SEC,
                        **common,
                    ).model_dump()
                )
            # Submission failed. The caller still gets their lyrics — and is
            # told the song is missing, rather than silently receiving a
            # quieter product than the one advertised.
            succeeded = True
            return JSONResponse(
                GenerateOk(
                    song="unavailable",
                    song_message="Couldn't reach the song studio, so this one plays as lyrics over a backing track.",
                    **common,
                ).model_dump()
            )

        succeeded = True
        return JSONResponse(GenerateOk(**common).model_dump())
    finally:
        if not succeeded:
            limiter.release_url(url_hash)


def _start_song(request: Request, outcome: lyric_generator.LyricOutcome, mood: str) -> str | None:
    """Queue the sung song. Returns the client's job token, or None on failure.

    Never raises: a GPU that cannot be reached must not cost the caller the
    lyrics Claude was already paid to write.
    """
    settings = request.app.state.settings
    db = request.app.state.db

    # Expire old audio on the write path — same reasoning as the database's
    # prune triggers (db.py): a sweep tied to writes cannot drift out of sync
    # with what it cleans, and needs no timer unit installed on the box.
    try:
        song_cache.sweep(settings.song_cache_dir, settings.song_retention_hours)
    except OSError:
        log.exception("song cache sweep failed")

    try:
        runpod_id = runpod_client.submit(
            outcome.tagged(), mood_mapper.style_for_mood(mood), settings
        )
    except runpod_client.RunPodError:
        log.exception("RunPod submit failed; falling back to the lyrics-only response")
        return None

    job_id = song_cache.new_token()
    try:
        song_jobs.create(db, job_id, runpod_id)
    except Exception:
        log.exception("could not record song job %s", runpod_id)
        return None
    return job_id


# Path is "/song-status/{id}", NOT "/song/{id}/status": in production nginx
# serves /song/ straight off disk (it does Range requests, which Safari needs
# for audio), so that prefix cannot also contain a proxied endpoint.
@router.get("/song-status/{job_id}")
def song_status(job_id: str, request: Request) -> JSONResponse:
    """Poll one song job. Cheap, and never waits on the GPU.

    The client polls this rather than the backend blocking on RunPod: a single
    uvicorn worker held for 40 seconds stops answering everything else,
    including health checks, and nginx would cut the response at 60s anyway.

    The job token is the only credential — it is unguessable, and it is also
    the audio's filename.
    """
    settings = request.app.state.settings
    limiter = request.app.state.limiter
    db = request.app.state.db

    if not song_cache.is_valid_token(job_id):
        return JSONResponse(SongFailed(message="Unknown song.").model_dump(), status_code=404)

    job = song_jobs.get(db, job_id)
    if job is None:
        return JSONResponse(
            SongFailed(message="That song has expired.").model_dump(), status_code=404
        )

    now = time_mod.time()
    if job.state == "ready":
        # The row outlives the audio, so a song swept overnight reports as
        # expired instead of handing back a URL that 404s at 6:30am.
        if not song_cache.exists(job_id, settings.song_cache_dir):
            return JSONResponse(
                SongFailed(message="That song has expired.").model_dump(), status_code=404
            )
        return JSONResponse(
            SongReady(
                song_url=f"/api/v1/rise-and-rhyme/song/{job_id}.mp3",
                duration_seconds=job.duration_seconds,
            ).model_dump()
        )
    if job.state == "failed":
        return JSONResponse(SongFailed(message=job.message or FALLBACK_MESSAGE).model_dump())

    elapsed = int(now - job.created_ts)
    if elapsed > settings.song_job_timeout_sec:
        song_jobs.finish(db, job_id, "failed", message="Song generation timed out.")
        return JSONResponse(SongFailed(message="Song generation timed out.").model_dump())

    try:
        result = runpod_client.poll(job.runpod_id, settings)
    except runpod_client.RunPodError:
        # A failed poll is not a failed song — the GPU may be fine and the
        # network briefly not. Stay pending and let the client try again;
        # song_job_timeout_sec is what eventually ends this.
        log.warning("RunPod status check failed for %s", job.runpod_id, exc_info=True)
        return JSONResponse(
            SongPending(elapsed_seconds=elapsed, poll_after=POLL_INTERVAL_SEC).model_dump()
        )

    if not result.terminal:
        return JSONResponse(
            SongPending(elapsed_seconds=elapsed, poll_after=POLL_INTERVAL_SEC).model_dump()
        )

    # Terminal: charge the GPU time once, whatever the outcome — a job that
    # failed after 40 seconds on the card still costs 40 seconds.
    if song_jobs.claim_billing(db, job_id):
        limiter.record_song_cost(runpod_client.cost_for(result.execution_ms, settings))

    if result.state == "failed" or result.audio is None:
        song_jobs.finish(db, job_id, "failed", message=result.message or FALLBACK_MESSAGE)
        return JSONResponse(SongFailed(message=result.message or FALLBACK_MESSAGE).model_dump())

    try:
        song_cache.store(result.audio, settings.song_cache_dir, job_id)
    except OSError:
        log.exception("could not write song audio")
        song_jobs.finish(db, job_id, "failed", message=FALLBACK_MESSAGE)
        return JSONResponse(SongFailed(message=FALLBACK_MESSAGE).model_dump())

    song_jobs.finish(db, job_id, "ready", duration_seconds=result.duration_seconds)
    return JSONResponse(
        SongReady(
            song_url=f"/api/v1/rise-and-rhyme/song/{job_id}.mp3",
            duration_seconds=result.duration_seconds,
        ).model_dump()
    )


# response_model=None: the return is a union of two response classes, and
# FastAPI would otherwise try to derive a Pydantic model from it and fail.
@router.get("/song/{filename}.mp3", response_model=None)
def song_audio(filename: str, request: Request) -> Response:
    """Serve a generated song.

    In production nginx serves these directly (it handles Range requests, which
    Safari needs for audio); this route is the dev-server equivalent and the
    backstop if that location is ever removed.
    """
    settings = request.app.state.settings
    if not song_cache.is_valid_token(filename):
        return JSONResponse(SongFailed(message="Unknown song.").model_dump(), status_code=404)
    path = song_cache.path_for(filename, settings.song_cache_dir)
    if not song_cache.exists(filename, settings.song_cache_dir):
        return JSONResponse(SongFailed(message="That song has expired.").model_dump(), status_code=404)
    return FileResponse(path, media_type="audio/mpeg")


MAX_PREVIEW_EVENTS = 12
MAX_SUMMARY_CHARS = 200


@router.post("/preview")
def preview(body: PreviewRequest, request: Request) -> JSONResponse:
    """Show what tomorrow's song will be about, without writing it.

    Deliberately stops before Claude: this is a calendar read plus the same
    mood heuristic the generator uses, so it costs nothing and must not
    consume the caller's one generation for the day. It has its own rate
    bucket (see RateLimiter.reserve_preview) because it does still make the
    server fetch an external URL on demand.
    """
    limiter = request.app.state.limiter

    try:
        url = ical_parser.validate_ical_url(body.ical_url)
        tz = ical_parser.resolve_timezone(body.timezone)
    except ical_parser.CalendarError as exc:
        return JSONResponse(GenerateError(message=str(exc)).model_dump(), status_code=400)

    denial = limiter.reserve_preview(_client_ip(request))
    if denial is not None:
        return JSONResponse(
            GenerateRateLimited(message=denial.message, retry_after=denial.retry_after).model_dump(),
            status_code=429,
        )

    try:
        feed = ical_parser.fetch_feed(url)
        events = ical_parser.events_for_date(feed, body.target_date, tz)
    except ical_parser.CalendarError as exc:
        return JSONResponse(GenerateError(message=str(exc)).model_dump(), status_code=400)

    mood = mood_mapper.mood_for_events([e.summary for e in events], body.preferred_genre)
    shown = events[:MAX_PREVIEW_EVENTS]
    return JSONResponse(
        PreviewOk(
            target_date=body.target_date.isoformat(),
            timezone=body.timezone,
            event_count=len(events),
            truncated=len(events) > len(shown),
            mood=mood,
            events=[
                PreviewEvent(
                    time="all day" if e.all_day else ical_parser.format_clock(e.start),
                    summary=e.summary[:MAX_SUMMARY_CHARS],
                    all_day=e.all_day,
                )
                for e in shown
            ],
        ).model_dump()
    )


@router.get("/health")
def health(
    request: Request,
    x_metrics_token: str | None = Header(default=None, alias="X-Metrics-Token"),
) -> Health:
    """Liveness for anyone; spend figures only for a caller with the token.

    The uptime monitor passes RF_METRICS_TOKEN so it can alert on the bill;
    everyone else gets status + circuit state, which is all a public health
    check needs.
    """
    settings = request.app.state.settings
    limiter = request.app.state.limiter

    authorized = bool(settings.metrics_token) and secrets.compare_digest(
        x_metrics_token or "", settings.metrics_token
    )
    return Health(
        status="ok",
        circuit_open=limiter.circuit_open(),
        metrics=SpendMetrics(**limiter.spend_summary()) if authorized else None,
    )
