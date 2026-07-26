import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main as main_module
from services import ical_parser, lyric_generator
from services.lyric_generator import LyricResult

GOOGLE = "https://calendar.google.com/calendar/ical/abc123/basic.ics"

FEED = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:1
SUMMARY:Standup
DTSTART:20260730T090000Z
END:VEVENT
END:VCALENDAR
"""

LYRICS = ["line one", "line two", "line three", "line four", "line five", "line six"]


@pytest.fixture
def client(settings, monkeypatch):
    monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)
    monkeypatch.setattr(
        lyric_generator,
        "generate_lyrics",
        lambda events, target, s, client=None: LyricResult(lyrics=LYRICS, mood="cheerful", cost=0.01),
    )
    # Route module imported these names at module level? No — it calls through
    # the module, so monkeypatching the module attributes above is enough.
    app = main_module.create_app(settings)
    return TestClient(app)


def body(url=GOOGLE):
    return {"ical_url": url, "target_date": "2026-07-30", "preferred_genre": "any"}


def test_generate_ok(client):
    res = client.post("/api/v1/rise-and-rhyme/generate", json=body())
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["lyrics"] == LYRICS
    assert data["mood"] == "cheerful"
    assert data["track_id"].startswith("cheerful-")
    assert data["event_count"] == 1
    assert data["cache_until"] == "2026-07-30T12:00:00Z"


def test_second_request_rate_limited(client):
    assert client.post("/api/v1/rise-and-rhyme/generate", json=body()).status_code == 200
    res = client.post("/api/v1/rise-and-rhyme/generate", json=body())
    assert res.status_code == 429
    data = res.json()
    assert data["status"] == "rate_limited"
    assert data["retry_after"] > 0


def test_genre_preference_overrides_mood(client):
    res = client.post(
        "/api/v1/rise-and-rhyme/generate",
        json={"ical_url": GOOGLE, "target_date": "2026-07-30", "preferred_genre": "bold"},
    )
    assert res.json()["mood"] == "bold"
    assert res.json()["track_id"].startswith("bold-")


def test_ssrf_rejected(client):
    res = client.post("/api/v1/rise-and-rhyme/generate", json=body("https://evil.example.com/x.ics"))
    assert res.status_code == 400
    assert res.json()["status"] == "error"


def test_metadata_endpoint_rejected(client):
    res = client.post(
        "/api/v1/rise-and-rhyme/generate", json=body("https://169.254.169.254/latest/meta-data/")
    )
    assert res.status_code == 400


def test_claude_failure_returns_fallback_error(settings, monkeypatch):
    monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)

    def boom(events, target, s, client=None):
        raise lyric_generator.LyricApiError("api down")

    monkeypatch.setattr(lyric_generator, "generate_lyrics", boom)
    app = main_module.create_app(settings)
    tc = TestClient(app)
    res = tc.post("/api/v1/rise-and-rhyme/generate", json=body())
    assert res.status_code == 502
    assert "fallback" in res.json()["message"].lower()


def test_circuit_breaker_opens_after_repeated_failures(settings, monkeypatch):
    monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)

    def boom(events, target, s, client=None):
        raise lyric_generator.LyricApiError("api down")

    monkeypatch.setattr(lyric_generator, "generate_lyrics", boom)
    app = main_module.create_app(settings)
    tc = TestClient(app)
    # Distinct URLs/IPs so only the circuit trips, not the rate limits.
    for i in range(settings.circuit_error_threshold):
        tc.post(
            "/api/v1/rise-and-rhyme/generate",
            json=body(f"https://calendar.google.com/calendar/ical/u{i}/basic.ics"),
            headers={"CF-Connecting-IP": f"203.0.113.{i + 1}"},
        )
    res = tc.post(
        "/api/v1/rise-and-rhyme/generate",
        json=body("https://calendar.google.com/calendar/ical/next/basic.ics"),
        headers={"CF-Connecting-IP": "203.0.113.99"},
    )
    assert res.status_code == 503
    assert res.json()["status"] == "capacity"


def test_refusal_returns_error_not_crash(settings, monkeypatch):
    monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)
    monkeypatch.setattr(
        lyric_generator, "generate_lyrics", lambda events, target, s, client=None: None
    )
    app = main_module.create_app(settings)
    tc = TestClient(app)
    res = tc.post("/api/v1/rise-and-rhyme/generate", json=body())
    assert res.status_code == 502
    assert res.json()["status"] == "error"


def test_health(client):
    res = client.get("/api/v1/rise-and-rhyme/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["circuit_open"] is False
    assert data["generations_today"] == 0


def test_health_counts_generations(client):
    client.post("/api/v1/rise-and-rhyme/generate", json=body())
    data = client.get("/api/v1/rise-and-rhyme/health").json()
    assert data["generations_today"] == 1
    assert data["spend_today"] == pytest.approx(0.01)
