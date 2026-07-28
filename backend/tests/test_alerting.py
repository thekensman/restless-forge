"""Alerting: the two channels that watch the Anthropic bill, and the rule that
neither of them may carry anyone's calendar.

The webhook is the real-time half (daily cap crossings, circuit breaker); the
health-check workflow polls /health for the slow half. Both are covered here
for content as much as for delivery — an alert that quotes an event title would
push private calendar data into a chat room and a log file.
"""

import logging

import pytest
from fastapi.testclient import TestClient

import main as main_module
from services import ical_parser, lyric_generator
from services.lyric_generator import LyricOutcome
from services.rate_limiter import RateLimiter

T0 = 1_800_000_000.0
HASH = "b" * 64
IP = "203.0.113.9"


@pytest.fixture
def posted(monkeypatch):
    """Capture every webhook POST instead of making one."""
    calls = []

    def fake_post(url, **kwargs):
        calls.append((url, kwargs.get("json")))

        class R:
            status_code = 200

        return R()

    monkeypatch.setattr("services.rate_limiter.httpx.post", fake_post)
    return calls


def spend(rl, amount, n, now=T0):
    """n billed generations of `amount` each, from distinct calendars."""
    for i in range(n):
        rl.record_attempt(f"{i:064d}", amount, "cheerful-01", "cheerful", 3, succeeded=True, now=now)


class TestSpendAlerts:
    # Costs here are exact binary fractions on purpose — see
    # test_a_threshold_alert_can_lag_one_generation for why.

    def test_crossing_80_percent_fires_once(self, db, settings, posted):
        settings.alert_webhook_url = "https://hooks.example.com/rf"
        settings.daily_spend_cap = 1.0
        rl = RateLimiter(db, settings)

        spend(rl, 0.125, 6)  # $0.750 — below the $0.80 line
        assert posted == []

        spend(rl, 0.125, 1)  # $0.875 — crosses
        assert len(posted) == 1
        assert "80%" in posted[0][1]["text"]

        spend(rl, 0.125, 1)  # $1.000 — see below; the cap line is its own alert
        assert len(posted) == 2
        assert "100%" in posted[1][1]["text"]

    def test_crossing_the_cap_fires_again(self, db, settings, posted):
        settings.alert_webhook_url = "https://hooks.example.com/rf"
        settings.daily_spend_cap = 1.0
        rl = RateLimiter(db, settings)
        spend(rl, 0.5, 2)  # $1.00 — one step over both lines
        # A single jump past both thresholds reports the worse one, once.
        assert len(posted) == 1
        assert "100%" in posted[0][1]["text"]

    def test_a_threshold_alert_can_lag_one_generation(self, db, settings, posted):
        """Documented imprecision, not a bug worth chasing.

        Spend accumulates as a SQLite REAL, so eight $0.10 charges total
        $0.7999999999999999 — one ULP under the $0.80 line. The alert fires on
        the *next* generation instead. The lag is bounded at one generation
        (~$0.01), and the cap itself is enforced by the same comparison, so the
        worst case is one extra song, never an unbounded overrun. The
        authoritative backstop is the Anthropic Console spend limit.
        """
        settings.alert_webhook_url = "https://hooks.example.com/rf"
        settings.daily_spend_cap = 1.0
        rl = RateLimiter(db, settings)

        spend(rl, 0.1, 8)  # nominally $0.80, actually a hair under
        assert posted == []
        spend(rl, 0.1, 1)  # $0.90 — fires here, one generation late
        assert len(posted) == 1
        assert "80%" in posted[0][1]["text"]

    def test_alert_names_the_service_and_the_numbers(self, db, settings, posted):
        settings.alert_webhook_url = "https://hooks.example.com/rf"
        settings.daily_spend_cap = 1.0
        rl = RateLimiter(db, settings)
        spend(rl, 1.0, 1)
        url, payload = posted[0]
        assert url == "https://hooks.example.com/rf"
        assert payload["text"].startswith("[restless-forge api]")
        assert "$1.00" in payload["text"]

    def test_no_webhook_configured_is_silent_not_broken(self, db, settings, posted):
        settings.alert_webhook_url = ""
        settings.daily_spend_cap = 1.0
        rl = RateLimiter(db, settings)
        spend(rl, 1.0, 1)  # must still record, just not POST
        assert posted == []
        assert rl.today_stats(now=T0)[1] == pytest.approx(1.0)

    def test_a_broken_webhook_never_breaks_a_request(self, db, settings, monkeypatch):
        def explode(*a, **k):
            raise RuntimeError("hook host down")

        monkeypatch.setattr("services.rate_limiter.httpx.post", explode)
        settings.alert_webhook_url = "https://hooks.example.com/rf"
        settings.daily_spend_cap = 1.0
        rl = RateLimiter(db, settings)
        spend(rl, 1.0, 1)  # must not raise
        assert rl.today_stats(now=T0)[1] == pytest.approx(1.0)


class TestCircuitAlert:
    def test_opening_the_breaker_pages(self, db, settings, posted):
        settings.alert_webhook_url = "https://hooks.example.com/rf"
        rl = RateLimiter(db, settings)
        for _ in range(settings.circuit_error_threshold):
            rl.record_api_error(now=T0)
        assert len(posted) == 1
        text = posted[0][1]["text"]
        assert "Circuit breaker OPEN" in text
        assert str(settings.circuit_cooldown_sec // 60) in text

    def test_errors_below_the_threshold_stay_quiet(self, db, settings, posted):
        settings.alert_webhook_url = "https://hooks.example.com/rf"
        rl = RateLimiter(db, settings)
        for _ in range(settings.circuit_error_threshold - 1):
            rl.record_api_error(now=T0)
        assert posted == []


PRIVATE_FEED = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:1
SUMMARY:Oncology follow-up with Dr Halvorsen
DTSTART:20260730T120000Z
END:VEVENT
BEGIN:VEVENT
UID:2
SUMMARY:Divorce mediation
DTSTART:20260730T150000Z
END:VEVENT
END:VCALENDAR
"""

SECRET_URL = "https://calendar.google.com/calendar/ical/private-token-9f3a2b/basic.ics"

# Anything that would identify the person or their day.
PRIVATE_STRINGS = [
    "Oncology follow-up",
    "Dr Halvorsen",
    "Divorce mediation",
    "private-token-9f3a2b",
    SECRET_URL,
    "203.0.113.44",
]


class TestAlertsCarryNoCalendarData:
    """The hard constraint on this whole feature: monitoring watches money and
    liveness, never anyone's schedule."""

    def _run(self, settings, monkeypatch, caplog, generate_lyrics):
        monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: PRIVATE_FEED)
        monkeypatch.setattr(lyric_generator, "generate_lyrics", generate_lyrics)
        settings.alert_webhook_url = "https://hooks.example.com/rf"
        settings.daily_spend_cap = 0.005  # every call trips the cap alert
        tc = TestClient(main_module.create_app(settings))
        with caplog.at_level(logging.DEBUG):
            tc.post(
                "/api/v1/rise-and-rhyme/generate",
                headers={"CF-Connecting-IP": "203.0.113.44"},
                json={
                    "ical_url": SECRET_URL,
                    "target_date": "2026-07-30",
                    "timezone": "America/Chicago",
                    "preferred_genre": "any",
                },
            )
        return tc

    def _assert_clean(self, blob: str, where: str):
        for secret in PRIVATE_STRINGS:
            assert secret not in blob, f"{where} leaked {secret!r}"

    def test_success_path_leaks_nothing_to_webhook_or_logs(
        self, settings, monkeypatch, caplog, posted
    ):
        self._run(
            settings, monkeypatch, caplog,
            lambda events, target, s, client=None: LyricOutcome(["a", "b"], "cheerful", 0.01),
        )
        assert posted, "the spend alert should have fired"
        self._assert_clean(repr(posted), "webhook payload")
        self._assert_clean(caplog.text, "log output")

    def test_api_failure_path_leaks_nothing(self, settings, monkeypatch, caplog, posted):
        def boom(events, target, s, client=None):
            raise lyric_generator.LyricApiError(f"upstream rejected: {SECRET_URL}")

        self._run(settings, monkeypatch, caplog, boom)
        # log.exception() prints the traceback; the message must not be the
        # place a calendar URL ends up, so the generator never puts one there.
        self._assert_clean(repr(posted), "webhook payload")
        assert "Claude API error" in caplog.text
        for secret in ("Oncology follow-up", "Dr Halvorsen", "Divorce mediation", "203.0.113.44"):
            assert secret not in caplog.text

    def test_health_metrics_expose_only_aggregates(self, settings, monkeypatch, caplog, posted):
        tc = self._run(
            settings, monkeypatch, caplog,
            lambda events, target, s, client=None: LyricOutcome(["a", "b"], "cheerful", 0.01),
        )
        res = tc.get(
            "/api/v1/rise-and-rhyme/health", headers={"X-Metrics-Token": "test-metrics-token"}
        )
        self._assert_clean(res.text, "health response")
        metrics = res.json()["metrics"]
        # Counts and dollars only — no identifiers of any kind.
        assert set(metrics) == {
            "generations_today", "spend_today", "daily_spend_cap",
            "spend_7d", "spend_30d", "generations_30d", "projected_monthly",
        }
        assert all(isinstance(v, (int, float)) for v in metrics.values())
