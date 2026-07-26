"""/api/v1/rise-and-rhyme — song generation + health."""

from __future__ import annotations

import hashlib
import logging
import random
from datetime import datetime, timezone

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

    # 1. SSRF boundary: only known calendar providers, https only.
    try:
        url = ical_parser.validate_ical_url(body.ical_url)
    except ical_parser.CalendarError as exc:
        return JSONResponse(GenerateError(message=str(exc)).model_dump(), status_code=400)

    url_hash = hashlib.sha256(url.encode()).hexdigest()
    ip = _client_ip(request)

    # 2. Rate limits + daily caps.
    denial = limiter.check(url_hash, ip)
    if denial is not None:
        if denial.kind == "rate_limited":
            return JSONResponse(
                GenerateRateLimited(message=denial.message, retry_after=denial.retry_after).model_dump(),
                status_code=429,
            )
        return JSONResponse(GenerateCapacity(message=denial.message).model_dump(), status_code=503)

    # 3. Circuit breaker.
    if limiter.circuit_open():
        return JSONResponse(
            GenerateCapacity(message="Song generation is cooling down. Try again soon.").model_dump(),
            status_code=503,
        )

    # 4. Fetch + expand the calendar.
    try:
        feed = ical_parser.fetch_feed(url)
        events = ical_parser.events_for_date(feed, body.target_date)
    except ical_parser.CalendarError as exc:
        return JSONResponse(GenerateError(message=str(exc)).model_dump(), status_code=400)

    # 5. Lyrics from Claude.
    try:
        result = lyric_generator.generate_lyrics(events, body.target_date, settings)
    except lyric_generator.LyricApiError:
        limiter.record_api_error()
        log.exception("Claude API error")
        return JSONResponse(
            GenerateError(message="Song generation failed. Your alarm will use the fallback jingle.").model_dump(),
            status_code=502,
        )
    limiter.record_api_success()

    if result is None:
        # Refusal or malformed output — not a service failure.
        return JSONResponse(
            GenerateError(message="Couldn't write a song for this calendar. Your alarm will use the fallback jingle.").model_dump(),
            status_code=502,
        )

    # 6. Track selection: Claude's mood wins; an explicit genre pref overrides.
    mood = result.mood
    if body.preferred_genre != "any" and body.preferred_genre in mood_mapper.MOODS:
        mood = body.preferred_genre
    track_id = mood_mapper.pick_track(mood, random.Random(url_hash))

    # 7. Log the generation (hashed URL only) + spend.
    limiter.record_generation(
        url_hash, ip, result.cost, track_id, mood, len(events)
    )

    now = datetime.now(timezone.utc)
    cache_until = datetime(
        body.target_date.year, body.target_date.month, body.target_date.day,
        12, 0, 0, tzinfo=timezone.utc,
    )
    return JSONResponse(
        GenerateOk(
            lyrics=result.lyrics,
            track_id=track_id,
            mood=mood,
            event_count=len(events),
            generated_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            cache_until=cache_until.strftime("%Y-%m-%dT%H:%M:%SZ"),
        ).model_dump()
    )


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
