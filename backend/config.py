"""Environment-driven configuration for the Restless Forge API.

Every knob is an env var so the systemd unit's EnvironmentFile
(/etc/restless-forge/api.env) is the single place ops values live.
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

    db_path: str = field(default_factory=lambda: os.getenv("RF_DB_PATH", "/var/lib/restless-forge/api.db"))

    # Rate limiting windows
    url_window_sec: int = 12 * 3600  # 1 generation per iCal URL per 12 h
    ip_window_sec: int = 3600
    ip_max_per_window: int = 3

    # Circuit breaker: N consecutive Claude API errors -> cooldown
    circuit_error_threshold: int = 3
    circuit_cooldown_sec: int = 15 * 60
