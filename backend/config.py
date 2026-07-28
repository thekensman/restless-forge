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
