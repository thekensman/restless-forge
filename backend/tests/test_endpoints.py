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

from services.lyric_generator import Section

SECTIONS = [
    Section("verse", ["line one", "line two", "line three", "line four"]),
    Section("chorus", ["line five", "line six"]),
]
LYRICS = ["line one", "line two", "line three", "line four", "line five", "line six"]

# Matches settings.metrics_token in the fixture; /health only reports money to
# a caller who presents it.
METRICS_HEADER = {"X-Metrics-Token": "test-metrics-token"}


def ok_outcome(events, target, settings, client=None):
    return LyricOutcome(sections=SECTIONS, mood="cheerful", cost=0.01)


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
        return LyricOutcome(sections=SECTIONS, mood="cheerful", cost=0.01)

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

    health = tc.get("/api/v1/rise-and-rhyme/health", headers=METRICS_HEADER).json()
    assert health["metrics"]["generations_today"] == 1
    assert health["metrics"]["spend_today"] == pytest.approx(0.02)
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


def test_health_counts_generations(client):
    client.post("/api/v1/rise-and-rhyme/generate", json=body())
    data = client.get("/api/v1/rise-and-rhyme/health", headers=METRICS_HEADER).json()
    assert data["metrics"]["generations_today"] == 1
    assert data["metrics"]["spend_today"] == pytest.approx(0.01)


class TestHealthMetricsGating:
    """/health is public through nginx. Liveness is fine to publish; the spend
    figures are not — they'd tell anyone how close the daily cap is to spent."""

    def test_public_caller_sees_liveness_but_no_money(self, client):
        client.post("/api/v1/rise-and-rhyme/generate", json=body())
        data = client.get("/api/v1/rise-and-rhyme/health").json()
        assert data["status"] == "ok"
        assert data["circuit_open"] is False
        assert data["metrics"] is None

    def test_wrong_token_is_treated_as_no_token(self, client):
        data = client.get(
            "/api/v1/rise-and-rhyme/health", headers={"X-Metrics-Token": "nope"}
        ).json()
        assert data["metrics"] is None

    def test_unconfigured_token_fails_closed(self, settings, monkeypatch):
        """An empty RF_METRICS_TOKEN must not make an empty header match."""
        monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)
        monkeypatch.setattr(lyric_generator, "generate_lyrics", ok_outcome)
        settings.metrics_token = ""
        tc = TestClient(main_module.create_app(settings))
        assert tc.get("/api/v1/rise-and-rhyme/health").json()["metrics"] is None
        assert (
            tc.get("/api/v1/rise-and-rhyme/health", headers={"X-Metrics-Token": ""})
            .json()["metrics"]
            is None
        )

    def test_rolling_windows_and_projection(self, client, settings):
        """The numbers the uptime monitor alerts on."""
        client.post("/api/v1/rise-and-rhyme/generate", json=body())
        m = client.get("/api/v1/rise-and-rhyme/health", headers=METRICS_HEADER).json()["metrics"]
        assert m["daily_spend_cap"] == settings.daily_spend_cap
        assert m["spend_7d"] == pytest.approx(0.01)
        assert m["spend_30d"] == pytest.approx(0.01)
        assert m["generations_30d"] == 1
        # 0.01 over the trailing week, annualized to a month.
        assert m["projected_monthly"] == pytest.approx(round(0.01 / 7 * 30, 2))

    def test_older_days_roll_out_of_the_windows(self, client, settings):
        """A 40-day-old row must not inflate the 30-day figure."""
        from datetime import datetime, timedelta, timezone

        old = (datetime.now(timezone.utc) - timedelta(days=40)).strftime("%Y-%m-%d")
        db = main_module.create_app(settings).state.db
        with db.connect() as conn:
            conn.execute(
                "INSERT INTO daily_stats (date, count, spend) VALUES (?, 5, 9.0)", (old,)
            )
        m = client.get("/api/v1/rise-and-rhyme/health", headers=METRICS_HEADER).json()["metrics"]
        assert m["spend_30d"] == 0.0
        assert m["generations_30d"] == 0
