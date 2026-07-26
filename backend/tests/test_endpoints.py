import pytest
from fastapi.testclient import TestClient

import main as main_module
from services import ical_parser, lyric_generator
from services.lyric_generator import LyricOutcome

GOOGLE = "https://calendar.google.com/calendar/ical/abc123/basic.ics"

FEED = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:1
SUMMARY:Standup
DTSTART:20260730T120000Z
END:VEVENT
END:VCALENDAR
"""

LYRICS = ["line one", "line two", "line three", "line four", "line five", "line six"]


def ok_outcome(events, target, settings, client=None):
    return LyricOutcome(lyrics=LYRICS, mood="cheerful", cost=0.01)


@pytest.fixture
def client(settings, monkeypatch):
    monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)
    monkeypatch.setattr(lyric_generator, "generate_lyrics", ok_outcome)
    return TestClient(main_module.create_app(settings))


def body(url=GOOGLE, tz="America/Chicago", genre="any", target="2026-07-30"):
    return {"ical_url": url, "target_date": target, "preferred_genre": genre, "timezone": tz}


def test_generate_ok(client):
    res = client.post("/api/v1/rise-and-rhyme/generate", json=body())
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["lyrics"] == LYRICS
    assert data["mood"] == "cheerful"
    assert data["track_id"].startswith("cheerful-")
    assert data["event_count"] == 1


def test_cache_until_outlasts_a_local_morning_alarm(client):
    """A fixed 12:00Z expiry meant every US Pacific user's song was already
    stale when the alarm fired. It must now last the whole local day."""
    data = client.post("/api/v1/rise-and-rhyme/generate", json=body(tz="America/Los_Angeles")).json()
    # 23:59:59 on 07-30 in PDT is 06:59:59Z on 07-31 — comfortably past any
    # morning alarm in that zone.
    assert data["cache_until"] == "2026-07-31T06:59:59Z"


def test_cache_until_respects_each_zone(client):
    chicago = client.post("/api/v1/rise-and-rhyme/generate", json=body(tz="America/Chicago")).json()
    assert chicago["cache_until"] == "2026-07-31T04:59:59Z"


def test_unknown_timezone_rejected(client):
    res = client.post("/api/v1/rise-and-rhyme/generate", json=body(tz="Mars/Olympus_Mons"))
    assert res.status_code == 400
    assert res.json()["status"] == "error"


def test_second_request_rate_limited(client):
    assert client.post("/api/v1/rise-and-rhyme/generate", json=body()).status_code == 200
    res = client.post("/api/v1/rise-and-rhyme/generate", json=body())
    assert res.status_code == 429
    data = res.json()
    assert data["status"] == "rate_limited"
    assert data["retry_after"] > 0


def test_genre_preference_overrides_mood(client):
    res = client.post("/api/v1/rise-and-rhyme/generate", json=body(genre="bold"))
    assert res.json()["mood"] == "bold"
    assert res.json()["track_id"].startswith("bold-")


def test_track_varies_by_day_for_the_same_calendar(client, settings):
    """Two tracks ship per mood; a seed of url_hash alone pinned each calendar
    to one of them forever."""
    seen = set()
    for day in range(1, 15):
        app = main_module.create_app(settings)  # fresh limits, same calendar
        settings.db_path = settings.db_path + "x"
        res = TestClient(app).post(
            "/api/v1/rise-and-rhyme/generate", json=body(target=f"2026-08-{day:02d}")
        )
        seen.add(res.json()["track_id"])
    assert len(seen) > 1


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
    tc = TestClient(main_module.create_app(settings))
    res = tc.post("/api/v1/rise-and-rhyme/generate", json=body())
    assert res.status_code == 502
    assert "fallback" in res.json()["message"].lower()


def test_api_failure_frees_the_calendar_for_retry(settings, monkeypatch):
    """A server-side failure must not cost the user their 12-hour slot."""
    monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)
    calls = {"n": 0}

    def flaky(events, target, s, client=None):
        calls["n"] += 1
        if calls["n"] == 1:
            raise lyric_generator.LyricApiError("api down")
        return LyricOutcome(lyrics=LYRICS, mood="cheerful", cost=0.01)

    monkeypatch.setattr(lyric_generator, "generate_lyrics", flaky)
    tc = TestClient(main_module.create_app(settings))
    assert tc.post("/api/v1/rise-and-rhyme/generate", json=body()).status_code == 502
    assert tc.post("/api/v1/rise-and-rhyme/generate", json=body()).status_code == 200


def test_refusal_is_billed_and_reported(settings, monkeypatch):
    """A refusal still consumed tokens: the spend must reach the daily cap."""
    monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)
    monkeypatch.setattr(
        lyric_generator,
        "generate_lyrics",
        lambda events, target, s, client=None: LyricOutcome(None, None, 0.02),
    )
    app = main_module.create_app(settings)
    tc = TestClient(app)
    res = tc.post("/api/v1/rise-and-rhyme/generate", json=body())
    assert res.status_code == 502
    assert res.json()["status"] == "error"

    health = tc.get("/api/v1/rise-and-rhyme/health").json()
    assert health["generations_today"] == 1
    assert health["spend_today"] == pytest.approx(0.02)
    assert health["circuit_open"] is False  # a refusal is not a service failure


def test_circuit_breaker_opens_after_repeated_failures(settings, monkeypatch):
    monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)

    def boom(events, target, s, client=None):
        raise lyric_generator.LyricApiError("api down")

    monkeypatch.setattr(lyric_generator, "generate_lyrics", boom)
    tc = TestClient(main_module.create_app(settings))
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


def test_app_construction_touches_no_filesystem(tmp_path):
    """Regression guard for the CI-only failure this suite once had.

    Db used to create its directory in __init__, so building the app (which
    main.py does at module scope) wrote to the *production* data path just by
    being imported. That succeeded as root and raised PermissionError on any
    unprivileged runner, breaking collection before a single test ran. App
    construction must stay side-effect free; the store initializes on first use.
    """
    from config import Settings

    unwritable = tmp_path / "never" / "created" / "api.db"
    s = Settings()
    s.db_path = str(unwritable)

    app = main_module.create_app(s)  # must not raise, must not create anything
    assert not unwritable.parent.exists()

    # ...and the store still initializes itself the moment it is used.
    TestClient(app).get("/api/v1/rise-and-rhyme/health")
    assert unwritable.exists()


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
