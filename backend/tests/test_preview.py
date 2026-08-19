"""Calendar preview: a zero-cost read that must stay isolated from the
generate path's budget."""

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
BEGIN:VEVENT
UID:2
SUMMARY:Late dinner
DTSTART:20260731T010000Z
END:VEVENT
BEGIN:VEVENT
UID:3
SUMMARY:Company holiday
DTSTART;VALUE=DATE:20260730
END:VEVENT
END:VCALENDAR
"""


def busy_feed(n: int) -> str:
    events = "".join(
        f"BEGIN:VEVENT\nUID:{i}\nSUMMARY:Meeting {i}\nDTSTART:20260730T{9 + i % 12:02d}0000Z\nEND:VEVENT\n"
        for i in range(n)
    )
    return f"BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//T//EN\n{events}END:VCALENDAR\n"


@pytest.fixture
def client(settings, monkeypatch):
    monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)
    # If preview ever reaches the model, this blows up loudly.
    def forbidden(*a, **k):
        raise AssertionError("preview must not call the lyric generator")

    monkeypatch.setattr(lyric_generator, "generate_lyrics", forbidden)
    return TestClient(main_module.create_app(settings))


def body(url=GOOGLE, tz="America/Chicago", target="2026-07-30", genre="any"):
    return {"ical_url": url, "target_date": target, "timezone": tz, "preferred_genre": genre}


class TestPreviewContent:
    def test_lists_the_local_day_with_formatted_times(self, client):
        res = client.post("/api/v1/rise-and-rhyme/preview", json=body())
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert data["target_date"] == "2026-07-30"
        assert data["timezone"] == "America/Chicago"
        assert data["truncated"] is False

        rows = {e["summary"]: e for e in data["events"]}
        assert rows["Standup"]["time"] == "7:00 AM"       # 12:00Z in CDT
        assert rows["Late dinner"]["time"] == "8:00 PM"   # 01:00Z next day, still local Thursday
        assert rows["Company holiday"]["all_day"] is True
        assert rows["Company holiday"]["time"] == "all day"
        assert data["event_count"] == 3

    def test_reflects_the_requested_timezone(self, client):
        """The point of echoing the zone back: a wrong one is visible."""
        data = client.post("/api/v1/rise-and-rhyme/preview", json=body(tz="UTC")).json()
        assert data["timezone"] == "UTC"
        summaries = [e["summary"] for e in data["events"]]
        assert "Late dinner" not in summaries  # 01:00Z belongs to the next UTC day

    def test_empty_calendar_is_a_free_day(self, settings, monkeypatch):
        monkeypatch.setattr(
            ical_parser, "fetch_feed",
            lambda url: "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//T//EN\nEND:VCALENDAR\n",
        )
        tc = TestClient(main_module.create_app(settings))
        data = tc.post("/api/v1/rise-and-rhyme/preview", json=body()).json()
        assert data["event_count"] == 0
        assert data["events"] == []
        assert data["mood"] == "warm"

    def test_mood_matches_what_the_song_would_use(self, client, settings, monkeypatch):
        # Keyword rules beat the density heuristic, and the preview must show
        # the same answer the generator would reach: "Company holiday" -> warm.
        data = client.post("/api/v1/rise-and-rhyme/preview", json=body()).json()
        assert data["mood"] == "warm"

        # Without any keyword hit, density decides: 3 events -> cheerful.
        plain = FEED.replace("Company holiday", "Team review").replace("Late dinner", "Late sync")
        monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: plain)
        tc = TestClient(main_module.create_app(settings))
        assert tc.post("/api/v1/rise-and-rhyme/preview", json=body()).json()["mood"] == "cheerful"

    def test_genre_preference_is_reflected(self, client):
        data = client.post("/api/v1/rise-and-rhyme/preview", json=body(genre="bold")).json()
        assert data["mood"] == "bold"

    def test_long_calendars_are_truncated(self, settings, monkeypatch):
        monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: busy_feed(30))
        tc = TestClient(main_module.create_app(settings))
        data = tc.post("/api/v1/rise-and-rhyme/preview", json=body()).json()
        assert data["event_count"] == 30
        assert len(data["events"]) == 12
        assert data["truncated"] is True

    def test_summaries_are_length_capped(self, settings, monkeypatch):
        long_title = "L" * 500
        monkeypatch.setattr(
            ical_parser, "fetch_feed",
            lambda url: (
                "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//T//EN\nBEGIN:VEVENT\nUID:1\n"
                f"SUMMARY:{long_title}\nDTSTART:20260730T120000Z\nEND:VEVENT\nEND:VCALENDAR\n"
            ),
        )
        tc = TestClient(main_module.create_app(settings))
        data = tc.post("/api/v1/rise-and-rhyme/preview", json=body()).json()
        assert len(data["events"][0]["summary"]) == 200


class TestPreviewIsolation:
    """Preview must not spend anything or consume the generate allowance."""

    def test_preview_costs_nothing(self, client):
        client.post("/api/v1/rise-and-rhyme/preview", json=body())
        health = client.get(
            "/api/v1/rise-and-rhyme/health", headers={"X-Metrics-Token": "test-metrics-token"}
        ).json()
        assert health["metrics"]["generations_today"] == 0
        assert health["metrics"]["spend_today"] == 0.0

    def test_preview_does_not_lock_the_calendar(self, settings, monkeypatch):
        """Previewing then generating the same calendar must work."""
        monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)
        monkeypatch.setattr(
            lyric_generator, "generate_lyrics",
            lambda events, target, s, client=None: LyricOutcome(["a", "b"], "cheerful", 0.01),
        )
        tc = TestClient(main_module.create_app(settings))
        assert tc.post("/api/v1/rise-and-rhyme/preview", json=body()).status_code == 200
        assert tc.post("/api/v1/rise-and-rhyme/generate", json=body()).status_code == 200

    def test_previews_do_not_exhaust_the_generate_ip_budget(self, settings, monkeypatch):
        """The bug this separate bucket exists to prevent: a handful of
        previews must not lock you out of the song you were previewing."""
        monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)
        monkeypatch.setattr(
            lyric_generator, "generate_lyrics",
            lambda events, target, s, client=None: LyricOutcome(["a", "b"], "cheerful", 0.01),
        )
        tc = TestClient(main_module.create_app(settings))
        for _ in range(settings.ip_max_per_window + 2):
            assert tc.post("/api/v1/rise-and-rhyme/preview", json=body()).status_code == 200
        assert tc.post("/api/v1/rise-and-rhyme/generate", json=body()).status_code == 200


class TestPreviewLimits:
    def test_own_hourly_limit(self, client, settings):
        for _ in range(settings.preview_max_per_window):
            assert client.post("/api/v1/rise-and-rhyme/preview", json=body()).status_code == 200
        res = client.post("/api/v1/rise-and-rhyme/preview", json=body())
        assert res.status_code == 429
        assert res.json()["status"] == "rate_limited"
        assert res.json()["retry_after"] > 0

    def test_ssrf_rejected(self, client):
        res = client.post("/api/v1/rise-and-rhyme/preview", json=body("https://evil.example.com/x.ics"))
        assert res.status_code == 400

    def test_metadata_endpoint_rejected(self, client):
        res = client.post(
            "/api/v1/rise-and-rhyme/preview",
            json=body("https://169.254.169.254/latest/meta-data/"),
        )
        assert res.status_code == 400

    def test_unknown_timezone_rejected(self, client):
        res = client.post("/api/v1/rise-and-rhyme/preview", json=body(tz="Mars/Olympus_Mons"))
        assert res.status_code == 400

    def test_unreachable_calendar_reports_the_reason(self, settings, monkeypatch):
        def boom(url):
            raise ical_parser.CalendarError("Calendar feed returned HTTP 404.")

        monkeypatch.setattr(ical_parser, "fetch_feed", boom)
        tc = TestClient(main_module.create_app(settings))
        res = tc.post("/api/v1/rise-and-rhyme/preview", json=body())
        assert res.status_code == 400
        assert "404" in res.json()["message"]


def test_preview_rate_rows_are_pruned(settings, monkeypatch):
    import time

    monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)
    app = main_module.create_app(settings)
    db = app.state.db
    stale = time.time() - settings.preview_window_sec - 60
    with db.connect() as conn:
        conn.execute("INSERT INTO rate_preview_ip (ip_hash, ts) VALUES ('stale', ?)", (stale,))
    TestClient(app).post("/api/v1/rise-and-rhyme/preview", json=body())
    with db.connect() as conn:
        remaining = [r["ip_hash"] for r in conn.execute("SELECT ip_hash FROM rate_preview_ip")]
    assert "stale" not in remaining
