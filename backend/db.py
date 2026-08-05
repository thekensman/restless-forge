"""SQLite persistence for rate limiting, spend tracking, and generation logs.

This store holds ONLY cost-control state — no calendar contents, no lyrics,
no raw URLs. See docs/backend.md § Data retention for the full inventory.

Every table is self-pruning: AFTER INSERT/UPDATE triggers delete rows once
they are past the window that gives them a purpose, so the file cannot grow
without bound (and expired personal data doesn't linger). Triggers rather
than a cron job because they fire on every write path, including ones added
later, and survive process restarts.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from contextlib import contextmanager
from typing import Iterator

TABLES = """
CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    url_hash TEXT NOT NULL,
    cost REAL NOT NULL,
    track_id TEXT NOT NULL,
    mood TEXT NOT NULL,
    event_count INTEGER NOT NULL,
    succeeded INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_generations_ts ON generations (ts);
CREATE TABLE IF NOT EXISTS rate_url (
    url_hash TEXT PRIMARY KEY,
    last_ts REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_ip (
    ip_hash TEXT NOT NULL,
    ts REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_ip ON rate_ip (ip_hash, ts);
-- Preview is a separate, looser bucket on purpose: it costs no Claude
-- tokens, and sharing the generate bucket would mean a few previews locked
-- you out of the song you were previewing.
CREATE TABLE IF NOT EXISTS rate_preview_ip (
    ip_hash TEXT NOT NULL,
    ts REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_preview_ip ON rate_preview_ip (ip_hash, ts);
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
-- One row per sung-song job (RunPod/ACE-Step). `job_id` is an unguessable
-- token that doubles as the MP3 filename, so nothing here is derived from the
-- calendar URL: these files are served without auth and sing the listener's
-- schedule aloud. No lyrics or event data is stored — only what is needed to
-- poll the job and expire the audio.
CREATE TABLE IF NOT EXISTS song_jobs (
    job_id TEXT PRIMARY KEY,
    runpod_id TEXT NOT NULL,
    state TEXT NOT NULL,               -- pending | ready | failed
    message TEXT NOT NULL DEFAULT '',
    duration_seconds REAL NOT NULL DEFAULT 0,
    billed INTEGER NOT NULL DEFAULT 0, -- GPU cost charged once, on first terminal poll
    created_ts REAL NOT NULL,
    updated_ts REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_song_jobs_created ON song_jobs (created_ts);
"""

# Retention defaults (seconds / days). Rate-limit rows are useless the moment
# their window closes; the generation log is kept long enough to audit a
# surprising Anthropic bill; daily_stats is one tiny row per day.
DEFAULT_URL_WINDOW_SEC = 12 * 3600
DEFAULT_IP_WINDOW_SEC = 3600
DEFAULT_PREVIEW_WINDOW_SEC = 3600
DEFAULT_GENERATION_LOG_DAYS = 30
DEFAULT_DAILY_STATS_DAYS = 400
# Job rows are kept twice as long as the audio, so a client polling a swept
# song gets "expired" rather than an unexplained miss.
DEFAULT_SONG_JOB_RETENTION_SEC = 72 * 3600


def _prune_triggers(
    url_window_sec: int,
    ip_window_sec: int,
    generation_log_days: int,
    daily_stats_days: int,
    preview_window_sec: int,
    song_job_retention_sec: int,
) -> str:
    """Retention triggers, rebuilt on every init so config changes take effect.

    `strftime('%s','now')` is wall-clock UTC epoch, matching the REAL
    timestamps written by the application. SQLite does not fire triggers
    recursively by default, so the DELETEs here cannot cascade.
    """
    now = "CAST(strftime('%s','now') AS REAL)"
    generation_sec = generation_log_days * 86400
    return f"""
DROP TRIGGER IF EXISTS prune_rate_ip;
CREATE TRIGGER prune_rate_ip AFTER INSERT ON rate_ip BEGIN
    DELETE FROM rate_ip WHERE ts < {now} - {ip_window_sec};
END;

DROP TRIGGER IF EXISTS prune_rate_preview_ip;
CREATE TRIGGER prune_rate_preview_ip AFTER INSERT ON rate_preview_ip BEGIN
    DELETE FROM rate_preview_ip WHERE ts < {now} - {preview_window_sec};
END;

-- rate_url is written with an upsert, so both paths need a trigger.
DROP TRIGGER IF EXISTS prune_rate_url_insert;
CREATE TRIGGER prune_rate_url_insert AFTER INSERT ON rate_url BEGIN
    DELETE FROM rate_url WHERE last_ts < {now} - {url_window_sec};
END;
DROP TRIGGER IF EXISTS prune_rate_url_update;
CREATE TRIGGER prune_rate_url_update AFTER UPDATE ON rate_url BEGIN
    DELETE FROM rate_url WHERE last_ts < {now} - {url_window_sec};
END;

DROP TRIGGER IF EXISTS prune_generations;
CREATE TRIGGER prune_generations AFTER INSERT ON generations BEGIN
    DELETE FROM generations WHERE ts < {now} - {generation_sec};
END;

DROP TRIGGER IF EXISTS prune_daily_stats_insert;
CREATE TRIGGER prune_daily_stats_insert AFTER INSERT ON daily_stats BEGIN
    DELETE FROM daily_stats WHERE date < date('now', '-{daily_stats_days} days');
END;

-- Job rows outlive their audio by design: a client still polling a job whose
-- MP3 has been swept should be told "expired", not handed a 404 with no
-- explanation. The row is pruned a window later than the file.
DROP TRIGGER IF EXISTS prune_song_jobs;
CREATE TRIGGER prune_song_jobs AFTER INSERT ON song_jobs BEGIN
    DELETE FROM song_jobs WHERE created_ts < {now} - {song_job_retention_sec};
END;
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

    def __init__(
        self,
        path: str,
        *,
        url_window_sec: int = DEFAULT_URL_WINDOW_SEC,
        ip_window_sec: int = DEFAULT_IP_WINDOW_SEC,
        generation_log_days: int = DEFAULT_GENERATION_LOG_DAYS,
        daily_stats_days: int = DEFAULT_DAILY_STATS_DAYS,
        preview_window_sec: int = DEFAULT_PREVIEW_WINDOW_SEC,
        song_job_retention_sec: int = DEFAULT_SONG_JOB_RETENTION_SEC,
    ):
        self.path = path
        self._retention = (
            url_window_sec,
            ip_window_sec,
            generation_log_days,
            daily_stats_days,
            preview_window_sec,
            song_job_retention_sec,
        )
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
                conn.executescript(TABLES)
                conn.executescript(_prune_triggers(*self._retention))
                conn.execute("INSERT OR IGNORE INTO circuit (id) VALUES (1)")
                conn.commit()
            finally:
                conn.close()
            self._initialized = True

    @contextmanager
    def connect(self, *, immediate: bool = False) -> Iterator[sqlite3.Connection]:
        """Open a transaction.

        `immediate=True` takes SQLite's write lock up front (BEGIN IMMEDIATE),
        which is what makes check-then-reserve atomic across the threadpool:
        two concurrent requests for the same calendar cannot both pass the
        rate-limit check and both pay for a generation.
        """
        self._ensure_initialized()
        conn = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA busy_timeout=5000")
            conn.execute("BEGIN IMMEDIATE" if immediate else "BEGIN")
            yield conn
            conn.execute("COMMIT")
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise
        finally:
            conn.close()
