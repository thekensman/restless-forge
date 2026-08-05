"""On-disk store for generated MP3s.

Files live in `settings.song_cache_dir` — under /var/lib/restless-forge, NOT
under the deploy root. Two independent reasons, both of which broke an earlier
draft of this feature:

1. The Deploy workflow rsyncs `dist/` to /var/www/restless-forge with
   `--delete`, so anything cached there is destroyed on the next deploy.
2. The systemd unit runs `ProtectSystem=strict` with
   `ReadWritePaths=/var/lib/restless-forge`, so the service cannot write
   anywhere else at all.

Filenames are unguessable tokens, never derived from the calendar URL. These
files are served by nginx without authentication and they *sing the listener's
schedule aloud*, so a name anyone could compute would publish it.
"""

from __future__ import annotations

import logging
import os
import secrets
import time

log = logging.getLogger("rf.song_cache")

# 32 bytes of entropy. The filename is the only thing protecting the audio.
TOKEN_BYTES = 32

# Mirrors the character class the nginx location allows; anything outside it
# cannot round-trip through the URL.
_ALLOWED = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")


def new_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def is_valid_token(token: str) -> bool:
    """Reject anything that could escape the cache directory.

    The URL path is the filename, so this is the path-traversal boundary even
    though nginx serves these in production: the API must never be the weaker
    of the two checks.
    """
    return bool(token) and len(token) <= 128 and all(c in _ALLOWED for c in token)


def path_for(token: str, cache_dir: str) -> str:
    if not is_valid_token(token):
        raise ValueError("invalid song token")
    return os.path.join(cache_dir, f"{token}.mp3")


def store(audio: bytes, cache_dir: str, token: str) -> str:
    """Write an MP3 under `token` and return it.

    The caller supplies the token because the job already has one and it is
    equally unguessable — one identifier in play instead of two.

    Written to a temp name and renamed, because the file is readable over HTTP
    the moment its token is known: a listener must never get a partial song.
    """
    os.makedirs(cache_dir, exist_ok=True)
    final = path_for(token, cache_dir)
    tmp = f"{final}.part"
    with open(tmp, "wb") as fh:
        fh.write(audio)
    os.replace(tmp, final)
    return token


def exists(token: str, cache_dir: str) -> bool:
    try:
        return os.path.isfile(path_for(token, cache_dir))
    except ValueError:
        return False


def delete(token: str, cache_dir: str) -> None:
    try:
        os.remove(path_for(token, cache_dir))
    except (OSError, ValueError):
        pass


def sweep(cache_dir: str, retention_hours: int, now: float | None = None) -> int:
    """Delete songs past their retention window. Returns how many went.

    Called on the write path rather than from cron, matching how the database
    prunes itself (db.py): a sweep that only runs when something is being
    written cannot drift out of sync with the thing it is cleaning up, and it
    survives restarts without a timer unit to install.

    A song is generated at ~22:00 for the *next* morning, so the retention
    floor is overnight plus the whole target day — hence a default of 36 hours
    rather than the 24 an "expire daily" reading would suggest.
    """
    now = time.time() if now is None else now
    cutoff = now - retention_hours * 3600
    removed = 0
    try:
        entries = os.scandir(cache_dir)
    except OSError:
        return 0
    with entries:
        for entry in entries:
            if not entry.is_file():
                continue
            if not (entry.name.endswith(".mp3") or entry.name.endswith(".part")):
                continue
            try:
                if entry.stat().st_mtime < cutoff:
                    os.remove(entry.path)
                    removed += 1
            except OSError:
                continue
    if removed:
        log.info("song cache sweep removed %d file(s)", removed)
    return removed
