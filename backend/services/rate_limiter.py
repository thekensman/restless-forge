"""Cost controls: per-URL / per-IP rate limits, global daily caps, spend
tracking, circuit breaker, and alert notifications.

Two properties this module is responsible for, both learned the hard way:

1. **Reservation is atomic.** Checking the limits and claiming the slot happen
   inside one BEGIN IMMEDIATE transaction. Sync endpoints run in FastAPI's
   threadpool, so a check-then-record pair would let two concurrent requests
   for the same calendar both pass and both pay for a generation.

2. **Every billed attempt is accounted for.** Spend and the per-IP counter are
   recorded even when the generation ultimately fails (a refusal, or malformed
   model output), because those calls still cost money. Only the 12-hour
   per-calendar lock is released on failure, so a user isn't punished for a
   server-side problem.
"""

from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import httpx

from config import Settings
from db import Db

log = logging.getLogger("rf.rate_limiter")


@dataclass
class Denial:
    kind: str  # "rate_limited" | "capacity"
    message: str
    retry_after: int = 0


def _today(now: float) -> str:
    return datetime.fromtimestamp(now, tz=timezone.utc).strftime("%Y-%m-%d")


def hash_ip(ip: str) -> str:
    """Store a hash rather than the raw address.

    Rate limiting only needs equality, so the raw IP never has to touch the
    disk. Pruned after the 1-hour window by a trigger (see db.py)."""
    return hashlib.sha256(ip.encode()).hexdigest()


class RateLimiter:
    def __init__(self, db: Db, settings: Settings):
        self.db = db
        self.s = settings

    # ── Reservation ──

    def reserve(self, url_hash: str, ip: str, now: Optional[float] = None) -> Optional[Denial]:
        """Atomically check every limit and claim a generation slot.

        Returns None when the caller may proceed (the slot is now claimed), or
        a Denial explaining which limit stopped it. Callers that fail after
        reserving should call release_url() so the calendar isn't locked out
        for 12 hours because of a server-side failure.
        """
        now = time.time() if now is None else now
        ip_hash = hash_ip(ip)
        with self.db.connect(immediate=True) as conn:
            # Per-URL: 1 generation per 12 h
            row = conn.execute("SELECT last_ts FROM rate_url WHERE url_hash = ?", (url_hash,)).fetchone()
            if row is not None:
                elapsed = now - row["last_ts"]
                if elapsed < self.s.url_window_sec:
                    return Denial(
                        "rate_limited",
                        "Song already generated for this calendar today.",
                        retry_after=int(self.s.url_window_sec - elapsed),
                    )

            # Per-IP: N per rolling hour
            cutoff = now - self.s.ip_window_sec
            ip_count = conn.execute(
                "SELECT COUNT(*) AS c FROM rate_ip WHERE ip_hash = ? AND ts >= ?", (ip_hash, cutoff)
            ).fetchone()["c"]
            if ip_count >= self.s.ip_max_per_window:
                return Denial(
                    "rate_limited",
                    "Too many requests from this address. Try again in an hour.",
                    retry_after=self.s.ip_window_sec,
                )

            # Global daily caps (count + spend)
            stats = conn.execute(
                "SELECT count, spend FROM daily_stats WHERE date = ?", (_today(now),)
            ).fetchone()
            if stats is not None:
                if stats["count"] >= self.s.daily_gen_cap or stats["spend"] >= self.s.daily_spend_cap:
                    return Denial("capacity", "The forge is busy today. Try again tomorrow.")

            # Claim the slot inside the same transaction.
            conn.execute(
                "INSERT INTO rate_url (url_hash, last_ts) VALUES (?, ?) "
                "ON CONFLICT(url_hash) DO UPDATE SET last_ts = excluded.last_ts",
                (url_hash, now),
            )
            conn.execute("INSERT INTO rate_ip (ip_hash, ts) VALUES (?, ?)", (ip_hash, now))
        return None

    def reserve_preview(self, ip: str, now: Optional[float] = None) -> Optional[Denial]:
        """Claim a preview slot from the preview-only bucket.

        Preview calls no model, so it must not consume the generate allowance
        (three previews would otherwise lock you out of the song you were
        previewing) and must not touch the daily caps. It still needs *a*
        limit: it makes the server fetch an external URL on demand.
        """
        now = time.time() if now is None else now
        ip_hash = hash_ip(ip)
        with self.db.connect(immediate=True) as conn:
            cutoff = now - self.s.preview_window_sec
            used = conn.execute(
                "SELECT COUNT(*) AS c FROM rate_preview_ip WHERE ip_hash = ? AND ts >= ?",
                (ip_hash, cutoff),
            ).fetchone()["c"]
            if used >= self.s.preview_max_per_window:
                return Denial(
                    "rate_limited",
                    "Too many calendar previews from this address. Try again in an hour.",
                    retry_after=self.s.preview_window_sec,
                )
            conn.execute("INSERT INTO rate_preview_ip (ip_hash, ts) VALUES (?, ?)", (ip_hash, now))
        return None

    def release_url(self, url_hash: str) -> None:
        """Undo the per-calendar lock after a failed generation.

        The per-IP counter and the recorded spend deliberately stay: the call
        was made and it cost money, so it must keep counting against the caps.
        """
        with self.db.connect() as conn:
            conn.execute("DELETE FROM rate_url WHERE url_hash = ?", (url_hash,))

    # ── Recording ──

    def record_attempt(
        self,
        url_hash: str,
        cost: float,
        track_id: str,
        mood: str,
        event_count: int,
        succeeded: bool,
        now: Optional[float] = None,
    ) -> None:
        """Log a generation attempt and its cost. Called for billed failures too."""
        now = time.time() if now is None else now
        today = _today(now)
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO generations (ts, url_hash, cost, track_id, mood, event_count, succeeded) "
                "VALUES (?,?,?,?,?,?,?)",
                (now, url_hash, cost, track_id, mood, event_count, 1 if succeeded else 0),
            )
            conn.execute(
                "INSERT INTO daily_stats (date, count, spend) VALUES (?, 1, ?) "
                "ON CONFLICT(date) DO UPDATE SET count = count + 1, spend = spend + excluded.spend",
                (today, cost),
            )
            spend = conn.execute(
                "SELECT spend FROM daily_stats WHERE date = ?", (today,)
            ).fetchone()["spend"]
        self._maybe_alert(spend, cost)

    def today_stats(self, now: Optional[float] = None) -> tuple[int, float]:
        now = time.time() if now is None else now
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT count, spend FROM daily_stats WHERE date = ?", (_today(now),)
            ).fetchone()
        return (row["count"], row["spend"]) if row is not None else (0, 0.0)

    # ── Circuit breaker ──

    def circuit_open(self, now: Optional[float] = None) -> bool:
        now = time.time() if now is None else now
        with self.db.connect() as conn:
            row = conn.execute("SELECT open_until FROM circuit WHERE id = 1").fetchone()
        return row is not None and row["open_until"] > now

    def record_api_error(self, now: Optional[float] = None) -> None:
        now = time.time() if now is None else now
        with self.db.connect(immediate=True) as conn:
            errors = conn.execute(
                "SELECT consecutive_errors FROM circuit WHERE id = 1"
            ).fetchone()["consecutive_errors"] + 1
            open_until = 0.0
            if errors >= self.s.circuit_error_threshold:
                open_until = now + self.s.circuit_cooldown_sec
            conn.execute(
                "UPDATE circuit SET consecutive_errors = ?, open_until = ? WHERE id = 1",
                (errors, open_until),
            )
        if open_until:
            self._notify(
                f"Circuit breaker OPEN for {self.s.circuit_cooldown_sec // 60} min "
                f"after {errors} consecutive Claude API errors"
            )

    def record_api_success(self) -> None:
        with self.db.connect() as conn:
            conn.execute("UPDATE circuit SET consecutive_errors = 0, open_until = 0 WHERE id = 1")

    # ── Alerts ──

    def _maybe_alert(self, spend_total: float, last_cost: float) -> None:
        """Fire when the daily spend crosses 80% or 100% of the cap."""
        for fraction, label in ((1.0, "100%"), (0.8, "80%")):
            threshold = self.s.daily_spend_cap * fraction
            if spend_total >= threshold > spend_total - last_cost:
                self._notify(
                    f"Daily Claude spend crossed {label} of cap: "
                    f"${spend_total:.2f} / ${self.s.daily_spend_cap:.2f}"
                )
                break

    def _notify(self, message: str) -> None:
        log.warning("ALERT: %s", message)
        if not self.s.alert_webhook_url:
            return
        try:
            httpx.post(self.s.alert_webhook_url, json={"text": f"[restless-forge api] {message}"}, timeout=5)
        except Exception:  # alerting must never break the request path
            log.exception("alert webhook failed")
