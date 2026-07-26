"""SQLite persistence for rate limiting, spend tracking, and generation logs.

stdlib sqlite3, WAL mode, one short-lived connection per operation — plenty
for a single-worker uvicorn on a 1 GB droplet.
"""

from __future__ import annotations

import os
import sqlite3
import threading
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
    """Lazily-initialized SQLite store.

    Construction is deliberately side-effect free: the directory and schema
    are created on FIRST USE, not at import/construction time. Creating them
    in __init__ made `import main` (which builds the app at module scope)
    touch the production data directory, so the test suite could only be
    collected by a process allowed to write /var/lib/restless-forge — it
    passed as root and failed everywhere else.
    """

    def __init__(self, path: str):
        self.path = path
        self._initialized = False
        # Sync endpoints run in FastAPI's threadpool, so first-use
        # initialization can be raced by concurrent requests.
        self._init_lock = threading.Lock()

    def _ensure_initialized(self) -> None:
        if self._initialized:
            return
        with self._init_lock:
            if self._initialized:  # another thread won the race
                return
            if self.path != ":memory:":
                os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
            conn = sqlite3.connect(self.path, timeout=10)
            try:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.executescript(SCHEMA)
                conn.execute("INSERT OR IGNORE INTO circuit (id) VALUES (1)")
                conn.commit()
            finally:
                conn.close()
            self._initialized = True

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        self._ensure_initialized()
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
