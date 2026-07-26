"""Fetch and parse public iCal feeds.

Security posture: the ical_url is attacker-controlled input that the server
fetches, so this module is the SSRF boundary — https-only, a strict hostname
allowlist of known calendar providers, no redirects, resolved-IP screening,
and a response size cap.
"""

from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from urllib.parse import urlparse

import httpx
import icalendar
import recurring_ical_events

MAX_FEED_BYTES = 1_000_000
FETCH_TIMEOUT_SEC = 10

# Known calendar-feed providers. Exact hostnames, plus suffixes for
# providers that shard across subdomains (iCloud's pNN-caldav hosts).
ALLOWED_HOSTS = {
    "calendar.google.com",
    "outlook.office365.com",
    "outlook.live.com",
    "api.icloud.com",
    "calendar.yahoo.com",
    "calendar.proton.me",
}
ALLOWED_SUFFIXES = (".icloud.com", ".calendar.yahoo.com")


class CalendarError(Exception):
    """User-visible calendar failure (bad URL, unreachable feed, bad data)."""


@dataclass
class Event:
    summary: str
    start: datetime
    end: datetime | None
    all_day: bool


def validate_ical_url(url: str) -> str:
    """Normalize + allowlist-check a calendar URL (pure — no network).
    Raises CalendarError."""
    url = url.strip()
    if url.lower().startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise CalendarError("Calendar URL must be https.")
    host = (parsed.hostname or "").lower()
    if host not in ALLOWED_HOSTS and not host.endswith(ALLOWED_SUFFIXES):
        raise CalendarError("Unsupported calendar provider.")
    return url

def _reject_private_addresses(host: str) -> None:
    """Defense in depth against DNS games: every resolved address must be public."""
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except OSError as exc:
        raise CalendarError("Could not resolve calendar host.") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise CalendarError("Unsupported calendar provider.")


def fetch_feed(url: str) -> str:
    """Fetch an allowlisted feed. Raises CalendarError on any failure.
    Callers must have passed the URL through validate_ical_url first."""
    _reject_private_addresses(urlparse(url).hostname or "")
    try:
        with httpx.Client(timeout=FETCH_TIMEOUT_SEC, follow_redirects=False) as client:
            resp = client.get(url, headers={"User-Agent": "restless-forge-api/1.0"})
    except httpx.HTTPError as exc:
        raise CalendarError("Could not fetch calendar feed.") from exc
    if resp.status_code in (301, 302, 307, 308):
        # A same-provider redirect is common (Google adds trailing data);
        # follow at most one hop and only after re-validating the target.
        target = resp.headers.get("location", "")
        target = validate_ical_url(target)
        _reject_private_addresses(urlparse(target).hostname or "")
        try:
            with httpx.Client(timeout=FETCH_TIMEOUT_SEC, follow_redirects=False) as client:
                resp = client.get(target, headers={"User-Agent": "restless-forge-api/1.0"})
        except httpx.HTTPError as exc:
            raise CalendarError("Could not fetch calendar feed.") from exc
    if resp.status_code != 200:
        raise CalendarError(f"Calendar feed returned HTTP {resp.status_code}.")
    if len(resp.content) > MAX_FEED_BYTES:
        raise CalendarError("Calendar feed is too large.")
    return resp.text


def events_for_date(ics_text: str, target: date) -> list[Event]:
    """Expand the feed (including recurrences) to the target date's events."""
    try:
        cal = icalendar.Calendar.from_ical(ics_text)
    except Exception as exc:
        raise CalendarError("Calendar feed could not be parsed.") from exc

    try:
        occurrences = recurring_ical_events.of(cal).between(target, target + timedelta(days=1))
    except Exception as exc:
        raise CalendarError("Calendar feed could not be expanded.") from exc

    events: list[Event] = []
    for occ in occurrences:
        summary = str(occ.get("SUMMARY", "")).strip() or "(untitled)"
        dtstart = occ.get("DTSTART")
        if dtstart is None:
            continue
        start = dtstart.dt
        all_day = not isinstance(start, datetime)
        if all_day:
            start = datetime(start.year, start.month, start.day)
        dtend = occ.get("DTEND")
        end: datetime | None = None
        if dtend is not None:
            end = dtend.dt
            if not isinstance(end, datetime):
                end = datetime(end.year, end.month, end.day)
        events.append(Event(summary=summary, start=start, end=end, all_day=all_day))

    events.sort(key=lambda e: e.start.replace(tzinfo=None) if e.start.tzinfo else e.start)
    return events
