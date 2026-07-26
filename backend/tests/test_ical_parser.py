from datetime import date
from zoneinfo import ZoneInfo

import pytest

from services import ical_parser
from services.ical_parser import (
    CalendarError,
    events_for_date,
    resolve_timezone,
    validate_ical_url,
)

GOOGLE = "https://calendar.google.com/calendar/ical/abc123/basic.ics"
CHICAGO = ZoneInfo("America/Chicago")
UTC = ZoneInfo("UTC")

FEED = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:1
SUMMARY:Standup
DTSTART:20260730T120000Z
DTEND:20260730T121500Z
END:VEVENT
BEGIN:VEVENT
UID:2
SUMMARY:Café résumé review ☕
DTSTART:20260730T190000Z
END:VEVENT
BEGIN:VEVENT
UID:3
SUMMARY:Late dinner
DTSTART:20260731T010000Z
END:VEVENT
BEGIN:VEVENT
UID:4
SUMMARY:Company holiday
DTSTART;VALUE=DATE:20260731
DTEND;VALUE=DATE:20260801
END:VEVENT
BEGIN:VEVENT
UID:5
SUMMARY:Weekly sync
DTSTART:20260701T160000Z
DTEND:20260701T163000Z
RRULE:FREQ=WEEKLY;BYDAY=WE
END:VEVENT
END:VCALENDAR
"""


class TestUrlValidation:
    def test_google_allowed(self):
        assert validate_ical_url(GOOGLE) == GOOGLE

    def test_webcal_scheme_upgraded(self):
        url = validate_ical_url("webcal://calendar.google.com/calendar/ical/x/basic.ics")
        assert url.startswith("https://calendar.google.com/")

    def test_outlook_and_icloud_allowed(self):
        validate_ical_url("https://outlook.office365.com/owa/calendar/x/calendar.ics")
        validate_ical_url("https://p42-caldav.icloud.com/published/2/xyz")

    def test_http_rejected(self):
        with pytest.raises(CalendarError):
            validate_ical_url("http://calendar.google.com/calendar/ical/x/basic.ics")

    def test_arbitrary_host_rejected(self):
        with pytest.raises(CalendarError):
            validate_ical_url("https://evil.example.com/feed.ics")

    def test_internal_targets_rejected(self):
        for url in (
            "https://169.254.169.254/latest/meta-data/",
            "https://localhost/feed.ics",
            "https://127.0.0.1/feed.ics",
        ):
            with pytest.raises(CalendarError):
                validate_ical_url(url)

    def test_host_suffix_spoof_rejected(self):
        with pytest.raises(CalendarError):
            validate_ical_url("https://calendar.google.com.evil.example/feed.ics")

    def test_private_resolution_rejected_at_fetch(self, monkeypatch):
        # DNS-rebinding defense: an allowlisted hostname resolving to a
        # private address must be refused before any request is made.
        monkeypatch.setattr(
            ical_parser.socket,
            "getaddrinfo",
            lambda *a, **k: [(2, 1, 6, "", ("10.0.0.5", 443))],
        )
        with pytest.raises(CalendarError):
            ical_parser.fetch_feed(GOOGLE)


class TestTimezoneResolution:
    def test_valid_zone(self):
        assert resolve_timezone("America/Chicago") is not None

    def test_unknown_zone_rejected(self):
        with pytest.raises(CalendarError):
            resolve_timezone("Mars/Olympus_Mons")


class TestEventExpansion:
    def test_day_window_follows_the_users_timezone(self):
        """The regression this whole contract exists for: a 8pm-local event
        lives in the NEXT UTC day and used to vanish from the user's song."""
        summaries = [e.summary for e in events_for_date(FEED, date(2026, 7, 30), CHICAGO)]
        assert "Standup" in summaries              # 07:00 local
        assert "Café résumé review ☕" in summaries  # 14:00 local
        assert "Late dinner" in summaries          # 20:00 local, 01:00Z next day
        assert "Company holiday" not in summaries  # genuinely the next day

    def test_utc_window_differs_from_local_window(self):
        utc_summaries = [e.summary for e in events_for_date(FEED, date(2026, 7, 30), UTC)]
        assert "Late dinner" not in utc_summaries  # falls in 07-31 UTC

    def test_times_are_returned_in_the_users_timezone(self):
        events = {e.summary: e for e in events_for_date(FEED, date(2026, 7, 30), CHICAGO)}
        assert events["Standup"].start.hour == 7      # 12:00Z -> 07:00 CDT
        assert events["Late dinner"].start.hour == 20  # 01:00Z next day -> 20:00 CDT

    def test_all_day_event_does_not_drift(self):
        events = events_for_date(FEED, date(2026, 7, 31), CHICAGO)
        holiday = [e for e in events if e.summary == "Company holiday"]
        assert len(holiday) == 1
        assert holiday[0].all_day is True
        assert holiday[0].start.hour == 0

    def test_recurring_event_expanded(self):
        # July 29 2026 is a Wednesday — the weekly RRULE lands on it.
        events = events_for_date(FEED, date(2026, 7, 29), CHICAGO)
        assert [e.summary for e in events] == ["Weekly sync"]

    def test_events_are_sorted_by_start(self):
        events = events_for_date(FEED, date(2026, 7, 30), CHICAGO)
        assert [e.start for e in events] == sorted(e.start for e in events)

    def test_empty_calendar(self):
        empty = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//T//EN\nEND:VCALENDAR\n"
        assert events_for_date(empty, date(2026, 7, 30), CHICAGO) == []

    def test_malformed_feed_raises_calendar_error(self):
        with pytest.raises(CalendarError):
            events_for_date("this is not an ics file", date(2026, 7, 30), CHICAGO)


class TestSizeCap:
    def test_oversized_feed_is_aborted_mid_stream(self, monkeypatch):
        """The cap must stop the download, not judge it after the fact."""
        delivered = {"bytes": 0}
        chunk = b"x" * 64_000

        class FakeStream:
            status_code = 200
            headers: dict[str, str] = {}

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def iter_bytes(self):
                while True:  # an endless feed; the cap must break out
                    delivered["bytes"] += len(chunk)
                    yield chunk

        class FakeClient:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def stream(self, *a, **k):
                return FakeStream()

        monkeypatch.setattr(ical_parser.socket, "getaddrinfo",
                            lambda *a, **k: [(2, 1, 6, "", ("142.250.1.1", 443))])
        monkeypatch.setattr(ical_parser.httpx, "Client", lambda **k: FakeClient())

        with pytest.raises(CalendarError, match="too large"):
            ical_parser.fetch_feed(GOOGLE)

        # Bounded by the cap (plus at most one chunk), not unbounded.
        assert delivered["bytes"] <= ical_parser.MAX_FEED_BYTES + len(chunk)
