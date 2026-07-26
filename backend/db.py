"""SQLite persistence for rate limiting, spend tracking, and generation logs.

stdlib sqlite3, WAL mode, one short-lived connection per operation — plenty
for a single-worker uvicorn on a 1 GB droplet.
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    url_hash TEXT NOT NULL,
    cost REAL NOT NULL,
    track_id TEXT NOT NULL,
    mood TEXT NOT NULL,
    event_count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_url (
    url_hash TEXT PRIMARY KEY,
    last_ts REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_ip (
    ip TEXT NOT NULL,
    ts REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_ip ON rate_ip (ip, ts);
CREATE TABLE IF NOT EXISTS daily_stats (
    date TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    spend REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS circuit (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    consecutive_errors INTEGER NOT NULL DEFAULT 0,
    open_until REAL NOT NULL DEFAULT 0
);
"""


class Db:
    def __init__(self, path: str):
        self.path = path
        if path != ":memory:":
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with self.connect() as conn:
            conn.executescript(SCHEMA)
            conn.execute("INSERT OR IGNORE INTO circuit (id) VALUES (1)")

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=5000")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
