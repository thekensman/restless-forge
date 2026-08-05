import sys
from pathlib import Path

import pytest

# Make `import config`, `from services import ...` etc. work whether pytest
# runs from backend/ or the repo root (CI does `pytest backend/tests`).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import Settings  # noqa: E402
from db import Db  # noqa: E402


@pytest.fixture
def settings(tmp_path):
    s = Settings()
    s.db_path = str(tmp_path / "test.db")
    s.anthropic_api_key = "test-key"
    s.metrics_token = "test-metrics-token"
    # Scoped to the test's tmp dir so a suite run never writes real song audio.
    # RunPod stays UNSET here: v1 is the default everywhere, and the tests that
    # exercise sung songs opt in explicitly (see song_settings).
    s.song_cache_dir = str(tmp_path / "song-cache")
    return s


@pytest.fixture
def song_settings(settings):
    """Settings with sung songs switched on — the v2 feature flag."""
    settings.runpod_api_key = "test-runpod-key"
    settings.runpod_endpoint_id = "test-endpoint"
    return settings


@pytest.fixture
def db(settings):
    return Db(settings.db_path)
