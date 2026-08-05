"""Persistence for sung-song jobs.

Deliberately thin. The interesting state (has the GPU finished?) lives at
RunPod; this table only remembers which RunPod job a client token maps to,
whether the audio has been fetched yet, and whether the GPU time has already
been charged against the daily spend cap.

Nothing here records calendar data, lyrics, or the iCal URL. The `job_id` is a
random token, never derived from the calendar — it is also the MP3 filename,
and those files are served without authentication.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Optional

from db import Db


@dataclass
class SongJob:
    job_id: str
    runpod_id: str
    state: str  # pending | ready | failed
    message: str
    duration_seconds: float
    billed: bool
    created_ts: float
    updated_ts: float


def create(db: Db, job_id: str, runpod_id: str, now: Optional[float] = None) -> None:
    now = time.time() if now is None else now
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO song_jobs (job_id, runpod_id, state, created_ts, updated_ts) "
            "VALUES (?, ?, 'pending', ?, ?)",
            (job_id, runpod_id, now, now),
        )


def get(db: Db, job_id: str) -> SongJob | None:
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM song_jobs WHERE job_id = ?", (job_id,)).fetchone()
    if row is None:
        return None
    return SongJob(
        job_id=row["job_id"],
        runpod_id=row["runpod_id"],
        state=row["state"],
        message=row["message"],
        duration_seconds=row["duration_seconds"],
        billed=bool(row["billed"]),
        created_ts=row["created_ts"],
        updated_ts=row["updated_ts"],
    )


def finish(
    db: Db,
    job_id: str,
    state: str,
    *,
    message: str = "",
    duration_seconds: float = 0.0,
    now: Optional[float] = None,
) -> None:
    now = time.time() if now is None else now
    with db.connect() as conn:
        conn.execute(
            "UPDATE song_jobs SET state = ?, message = ?, duration_seconds = ?, updated_ts = ? "
            "WHERE job_id = ?",
            (state, message, duration_seconds, now, job_id),
        )


def claim_billing(db: Db, job_id: str) -> bool:
    """Mark the GPU time as charged, returning True only for the first caller.

    Polling is a loop: without this, every poll after the job completes would
    add another few cents of imaginary GPU time to the daily spend and could
    trip the cap on a single song. The UPDATE is guarded in SQL rather than
    read-then-write so two concurrent polls cannot both win.
    """
    with db.connect(immediate=True) as conn:
        cur = conn.execute("UPDATE song_jobs SET billed = 1 WHERE job_id = ? AND billed = 0", (job_id,))
        return cur.rowcount > 0
