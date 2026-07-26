"""Cost controls: per-URL / per-IP rate limits, global daily caps, spend
tracking, circuit breaker, and alert notifications."""

from __future__ import annotations

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


class RateLimiter:
    def __init__(self, db: Db, settings: Settings):
        self.db = db
        self.s = settings

    # ── Request gating ──

    def check(self, url_hash: str, ip: str, now: Optional[float] = None) -> Optional[Denial]:
        now = time.time() if now is None else now
        with self.db.connect() as conn:
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
            conn.execute("DELETE FROM rate_ip WHERE ts < ?", (cutoff,))
            ip_count = conn.execute(
                "SELECT COUNT(*) AS c FROM rate_ip WHERE ip = ? AND ts >= ?", (ip, cutoff)
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
                if stats["count"] >= self.s.daily_gen_cap:
                    return Denial("capacity", "The forge is busy today. Try again tomorrow.")
                if stats["spend"] >= self.s.daily_spend_cap:
                    return Denial("capacity", "The forge is busy today. Try again tomorrow.")
        return None

    # ── Recording ──

    def record_generation(
        self,
        url_hash: str,
        ip: str,
        cost: float,
        track_id: str,
        mood: str,
        event_count: int,
        now: Optional[float] = None,
    ) -> None:
        now = time.time() if now is None else now
        today = _today(now)
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO generations (ts, url_hash, cost, track_id, mood, event_count) VALUES (?,?,?,?,?,?)",
                (now, url_hash, cost, track_id, mood, event_count),
            )
            conn.execute(
                "INSERT INTO rate_url (url_hash, last_ts) VALUES (?, ?) "
                "ON CONFLICT(url_hash) DO UPDATE SET last_ts = excluded.last_ts",
                (url_hash, now),
            )
            conn.execute("INSERT INTO rate_ip (ip, ts) VALUES (?, ?)", (ip, now))
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
        with self.db.connect() as conn:
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
            self._notify(f"Circuit breaker OPEN for {self.s.circuit_cooldown_sec // 60} min after {errors} consecutive Claude API errors")

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
                    f"Daily Claude spend crossed {label} of cap: ${spend_total:.2f} / ${self.s.daily_spend_cap:.2f}"
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
