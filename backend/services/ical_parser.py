"""Fetch and parse public iCal feeds.

Security posture: the ical_url is attacker-controlled input that the server
fetches, so this module is the SSRF boundary — https-only, a strict hostname
allowlist of known calendar providers, no blind redirects, resolved-IP
screening, and a size cap enforced WHILE streaming (a cap applied after the
body is buffered would still let a huge feed occupy memory first).

Timezone: a calendar day only means something in a timezone. Callers pass the
user's IANA zone; the day window and every returned timestamp are expressed in
it, so an 8pm local event belongs to the local day the user actually meant.
"""

from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
import icalendar
import recurring_ical_events

MAX_FEED_BYTES = 1_000_000
FETCH_TIMEOUT_SEC = 10
# Leading window searched for BEGIN:VCALENDAR. Bounded so the check costs the
# same on a 1 MB feed as on a small one.
FEED_SNIFF_BYTES = 4096

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

# Hosts that serve BOTH iCal feeds and ordinary HTML calendar pages, with the
# feed confined to a known path prefix. Google's "Public URL to this calendar"
# (/calendar/embed?src=…) is the classic trap: allowlisted host, HTTP 200, and
# a web page for a body — so without this it sails through validation and dies
# deep in the parser with an unhelpful "could not be parsed".
#
# Only list a host here when its feed prefix is known exactly. Providers whose
# feed URLs carry no extension (iCloud's /published/<token>) must NOT be listed
# — the body sniff in fetch_feed is the general safety net for those.
FEED_PATHS: dict[str, tuple[tuple[str, ...], str]] = {
    "calendar.google.com": (
        ("/calendar/ical/",),
        'In Google Calendar: Settings → your calendar → "Integrate calendar" '
        '→ copy "Secret address in iCal format" (the link ending in .ics).',
    ),
}


def format_clock(dt: datetime) -> str:
    """12-hour local time, e.g. '9:05 AM'.

    Used both for the lyric prompt and the calendar preview, so what the user
    sees in the preview is exactly what the songwriter is told. Built by hand
    because %-I / %l are platform-specific.
    """
    hour = dt.hour % 12 or 12
    meridiem = "AM" if dt.hour < 12 else "PM"
    return f"{hour}:{dt.minute:02d} {meridiem}"


class CalendarError(Exception):
    """User-visible calendar failure (bad URL, unreachable feed, bad data)."""


@dataclass
class Event:
    summary: str
    start: datetime
    end: datetime | None
    all_day: bool


def resolve_timezone(name: str) -> ZoneInfo:
    """Look up an IANA zone. Raises CalendarError for anything unknown."""
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, KeyError) as exc:
        raise CalendarError(f"Unknown timezone: {name}") from exc


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
    feed = FEED_PATHS.get(host)
    if feed is not None and not parsed.path.startswith(feed[0]):
        raise CalendarError(
            f"That link is a calendar web page, not a feed. {feed[1]}"
        )
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


def _read_capped(client: httpx.Client, url: str) -> tuple[int, str, str]:
    """Stream one response, aborting as soon as the size cap is exceeded.

    Returns (status_code, location_header, body_text). The body is accumulated
    chunk by chunk so an oversized feed is dropped mid-flight instead of being
    fully resident before the check.
    """
    chunks: list[bytes] = []
    total = 0
    with client.stream("GET", url, headers={"User-Agent": "restless-forge-api/1.0"}) as resp:
        if resp.status_code != 200:
            return resp.status_code, resp.headers.get("location", ""), ""
        for chunk in resp.iter_bytes():
            total += len(chunk)
            if total > MAX_FEED_BYTES:
                raise CalendarError("Calendar feed is too large.")
            chunks.append(chunk)
    return 200, "", b"".join(chunks).decode("utf-8", errors="replace")


def fetch_feed(url: str) -> str:
    """Fetch an allowlisted feed. Raises CalendarError on any failure.
    Callers must have passed the URL through validate_ical_url first."""
    _reject_private_addresses(urlparse(url).hostname or "")
    try:
        with httpx.Client(timeout=FETCH_TIMEOUT_SEC, follow_redirects=False) as client:
            status, location, body = _read_capped(client, url)
            if status in (301, 302, 307, 308):
                # A same-provider redirect is common; follow at most one hop,
                # and only after re-validating and re-screening the target.
                target = validate_ical_url(location)
                _reject_private_addresses(urlparse(target).hostname or "")
                status, _, body = _read_capped(client, target)
            if status != 200:
                raise CalendarError(f"Calendar feed returned HTTP {status}.")
    except httpx.HTTPError as exc:
        raise CalendarError("Could not fetch calendar feed.") from exc

    # A 200 that isn't a calendar is almost always a web page the user copied
    # instead of the feed (or a provider's login/error page rendered at 200).
    # Say so here: reaching the parser with HTML only ever produced
    # "Calendar feed could not be parsed", which tells the user nothing about
    # what to do next. Every RFC 5545 stream opens with BEGIN:VCALENDAR, so a
    # leading window is enough — and no HTML page contains it.
    if "BEGIN:VCALENDAR" not in body[:FEED_SNIFF_BYTES].upper():
        raise CalendarError(
            "That URL returned a web page, not a calendar feed. Copy the "
            "iCal/ICS link — usually the one ending in .ics — rather than "
            "the calendar's public web page."
        )
    return body


def events_for_date(ics_text: str, target: date, tz: ZoneInfo) -> list[Event]:
    """Expand the feed (including recurrences) to the target *local* day.

    The window is the user's calendar day in `tz`, and every returned start/end
    is converted into `tz`, so downstream formatting reports the times the user
    actually sees in their calendar.
    """
    try:
        cal = icalendar.Calendar.from_ical(ics_text)
    except Exception as exc:
        raise CalendarError("Calendar feed could not be parsed.") from exc

    day_start = datetime.combine(target, time.min, tzinfo=tz)
    day_end = day_start + timedelta(days=1)

    try:
        occurrences = recurring_ical_events.of(cal).between(day_start, day_end)
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
        start = _to_zone(start, tz, all_day)
        dtend = occ.get("DTEND")
        end = _to_zone(dtend.dt, tz, not isinstance(dtend.dt, datetime)) if dtend is not None else None
        events.append(Event(summary=summary, start=start, end=end, all_day=all_day))

    events.sort(key=lambda e: e.start)
    return events


def _to_zone(value, tz: ZoneInfo, all_day: bool) -> datetime:
    """Normalize an iCal date/datetime into an aware datetime in `tz`.

    All-day values carry no time; they are pinned to local midnight rather than
    converted, so a whole-day event doesn't drift into the neighbouring day.
    """
    if all_day or not isinstance(value, datetime):
        return datetime(value.year, value.month, value.day, tzinfo=tz)
    if value.tzinfo is None:
        # Floating time: per RFC 5545 it means "local wherever you are".
        return value.replace(tzinfo=tz)
    return value.astimezone(tz)
