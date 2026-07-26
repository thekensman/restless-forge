from datetime import date

import pytest

from services import ical_parser
from services.ical_parser import CalendarError, events_for_date, validate_ical_url

GOOGLE = "https://calendar.google.com/calendar/ical/abc123/basic.ics"

FEED = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:1
SUMMARY:Standup
DTSTART:20260730T090000Z
DTEND:20260730T091500Z
END:VEVENT
BEGIN:VEVENT
UID:2
SUMMARY:Café résumé review ☕
DTSTART:20260730T140000Z
END:VEVENT
BEGIN:VEVENT
UID:3
SUMMARY:Company holiday
DTSTART;VALUE=DATE:20260731
DTEND;VALUE=DATE:20260801
END:VEVENT
BEGIN:VEVENT
UID:4
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


class TestEventExpansion:
    def test_events_for_target_date(self):
        events = events_for_date(FEED, date(2026, 7, 30))
        summaries = [e.summary for e in events]
        assert "Standup" in summaries
        assert "Café résumé review ☕" in summaries  # UTF-8 survives
        assert "Company holiday" not in summaries  # next day

    def test_all_day_event(self):
        events = events_for_date(FEED, date(2026, 7, 31))
        assert len(events) == 1
        assert events[0].all_day is True

    def test_recurring_event_expanded(self):
        # July 29 2026 is a Wednesday — the weekly RRULE lands on it.
        events = events_for_date(FEED, date(2026, 7, 29))
        assert [e.summary for e in events] == ["Weekly sync"]

    def test_empty_calendar(self):
        empty = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//T//EN\nEND:VCALENDAR\n"
        assert events_for_date(empty, date(2026, 7, 30)) == []

    def test_malformed_feed_raises_calendar_error(self):
        with pytest.raises(CalendarError):
            events_for_date("this is not an ics file", date(2026, 7, 30))
