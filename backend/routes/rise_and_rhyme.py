"""/api/v1/rise-and-rhyme — song generation + health."""

from __future__ import annotations

import hashlib
import logging
import random
from datetime import datetime, time, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from models.schemas import (
    GenerateCapacity,
    GenerateError,
    GenerateOk,
    GenerateRateLimited,
    GenerateRequest,
    Health,
)
from services import ical_parser, lyric_generator, mood_mapper

log = logging.getLogger("rf.rise_and_rhyme")

router = APIRouter(prefix="/api/v1/rise-and-rhyme")

FALLBACK_MESSAGE = "Song generation failed. Your alarm will use the fallback jingle."


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
        response = JSONResponse(
            GenerateOk(
                lyrics=outcome.lyrics or [],
                track_id=track_id,
                mood=mood,
                event_count=len(events),
                generated_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                cache_until=cache_until.strftime("%Y-%m-%dT%H:%M:%SZ"),
            ).model_dump()
        )
        succeeded = True
        return response
    finally:
        if not succeeded:
            limiter.release_url(url_hash)


@router.get("/health")
def health(request: Request) -> Health:
    limiter = request.app.state.limiter
    count, spend = limiter.today_stats()
    return Health(
        status="ok",
        generations_today=count,
        spend_today=round(spend, 4),
        circuit_open=limiter.circuit_open(),
    )
