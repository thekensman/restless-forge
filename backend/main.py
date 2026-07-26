"""Restless Forge API — shared FastAPI app for cloud-assisted tools.

Run locally:  cd backend && uvicorn main:app --reload --port 8000
Production:   systemd unit restless-forge-api.service (single worker on
              127.0.0.1:8000, proxied by nginx at /api/).
"""

from __future__ import annotations

import logging

from fastapi import FastAPI

from config import Settings
from db import Db
from routes.rise_and_rhyme import router as rise_and_rhyme_router
from services.rate_limiter import RateLimiter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title="Restless Forge API", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    app.state.db = Db(
        settings.db_path,
        url_window_sec=settings.url_window_sec,
        ip_window_sec=settings.ip_window_sec,
        generation_log_days=settings.generation_log_days,
        daily_stats_days=settings.daily_stats_days,
    )
    app.state.limiter = RateLimiter(app.state.db, settings)
    app.include_router(rise_and_rhyme_router)
    return app


app = create_app()
