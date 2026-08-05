"""Environment-driven configuration for the Restless Forge API.

Every knob is an env var so the systemd unit (which sets RF_DB_PATH) and its
EnvironmentFile (/etc/restless-forge/api.env, which holds the secrets) are the
single place ops values live.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, "") or default)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


# Dev-safe default: a file beside the code, NOT the production path. The
# production location is set explicitly by the systemd unit, so nothing can
# accidentally read or write real cost-control state from a laptop or a CI box.
DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".data", "api.db")


@dataclass
class Settings:
    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    claude_model: str = field(default_factory=lambda: os.getenv("CLAUDE_MODEL", "claude-opus-5"))
    # Pricing used for spend tracking (USD per million tokens). Defaults match
    # claude-opus-5; override alongside CLAUDE_MODEL if the model changes.
    input_cost_per_mtok: float = field(default_factory=lambda: _env_float("CLAUDE_INPUT_COST_PER_MTOK", 5.0))
    output_cost_per_mtok: float = field(default_factory=lambda: _env_float("CLAUDE_OUTPUT_COST_PER_MTOK", 25.0))

    daily_gen_cap: int = field(default_factory=lambda: _env_int("DAILY_GEN_CAP", 500))
    daily_spend_cap: float = field(default_factory=lambda: _env_float("DAILY_SPEND_CAP", 10.0))
    alert_webhook_url: str = field(default_factory=lambda: os.getenv("ALERT_WEBHOOK_URL", ""))
    # Shared secret required to read the spend figures from /health. /health is
    # public through nginx, and publishing what you've spent also tells anyone
    # how close the daily cap is to exhausted. Unset = the numbers are omitted
    # entirely (fail closed), never accidentally public.
    metrics_token: str = field(default_factory=lambda: os.getenv("RF_METRICS_TOKEN", ""))

    db_path: str = field(default_factory=lambda: os.getenv("RF_DB_PATH", DEFAULT_DB_PATH))

    # ── Sung songs (RunPod / ACE-Step) ──
    # Both must be set for v2 to activate; see `song_generation_enabled`. Unset
    # is the supported production state, not a misconfiguration — the service
    # then behaves exactly as v1 did (lyrics + backing track + browser TTS).
    runpod_api_key: str = field(default_factory=lambda: os.getenv("RUNPOD_API_KEY", ""))
    runpod_endpoint_id: str = field(default_factory=lambda: os.getenv("RUNPOD_ENDPOINT_ID", ""))
    # Length of the generated song. Drives GPU seconds, which is the bill, and
    # a tight 45s song with a real chorus beats 90s of filler.
    song_duration_sec: float = field(default_factory=lambda: _env_float("SONG_DURATION_SEC", 45.0))
    # Wall-clock budget for one song before the client gives up and takes the
    # TTS fallback. Generous: this is a background job at 22:00, not a page load.
    song_job_timeout_sec: int = field(default_factory=lambda: _env_int("SONG_JOB_TIMEOUT_SEC", 300))
    # Billed GPU rate, USD per second, for spend accounting. RunPod reports
    # executionTime per job; multiplying gives a figure good enough to keep GPU
    # spend under the same daily cap as Claude. Default is the 24 GB tier.
    runpod_cost_per_sec: float = field(default_factory=lambda: _env_float("RUNPOD_COST_PER_SEC", 0.0004))

    # Where generated MP3s live. NOT under the deploy root: that path is
    # rsync --delete'd on every deploy, and the systemd unit's ProtectSystem
    # =strict only grants write access to /var/lib/restless-forge.
    song_cache_dir: str = field(
        default_factory=lambda: os.getenv(
            "RF_SONG_CACHE_DIR",
            os.path.join(os.path.dirname(os.path.abspath(__file__)), ".data", "song-cache"),
        )
    )
    # Songs are written the evening before and played the next morning, so the
    # retention floor is "overnight plus the whole target day".
    song_retention_hours: int = field(default_factory=lambda: _env_int("SONG_RETENTION_HOURS", 36))

    @property
    def song_generation_enabled(self) -> bool:
        """v2 is on only when both RunPod values are present.

        This is the feature flag and the rollback switch: clearing either
        variable and restarting returns the service to v1 behaviour with no
        code change."""
        return bool(self.runpod_api_key and self.runpod_endpoint_id)

    # Rate limiting windows
    url_window_sec: int = 12 * 3600  # 1 generation per iCal URL per 12 h
    ip_window_sec: int = 3600
    ip_max_per_window: int = 3
    # Preview reads a calendar but calls no model, so it gets its own looser
    # bucket rather than eating into the generate allowance.
    preview_window_sec: int = 3600
    preview_max_per_window: int = field(default_factory=lambda: _env_int("PREVIEW_MAX_PER_HOUR", 10))

    # Circuit breaker: N consecutive Claude API errors -> cooldown
    circuit_error_threshold: int = 3
    circuit_cooldown_sec: int = 15 * 60

    # Retention (see docs/backend.md § Data retention). Rate-limit rows are
    # pruned as soon as their window closes; these cover the audit tables.
    generation_log_days: int = field(default_factory=lambda: _env_int("GENERATION_LOG_RETENTION_DAYS", 30))
    daily_stats_days: int = field(default_factory=lambda: _env_int("DAILY_STATS_RETENTION_DAYS", 400))
