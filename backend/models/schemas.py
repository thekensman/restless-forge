"""Pydantic request/response models for /api/v1/rise-and-rhyme."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    ical_url: str = Field(min_length=12, max_length=2048)
    target_date: date
    preferred_genre: str = "any"


class GenerateOk(BaseModel):
    status: Literal["ok"] = "ok"
    lyrics: list[str]
    track_id: str
    mood: str
    event_count: int
    generated_at: str
    cache_until: str


class GenerateRateLimited(BaseModel):
    status: Literal["rate_limited"] = "rate_limited"
    message: str
    retry_after: int


class GenerateCapacity(BaseModel):
    status: Literal["capacity"] = "capacity"
    message: str
    fallback: bool = True


class GenerateError(BaseModel):
    status: Literal["error"] = "error"
    message: str


class Health(BaseModel):
    status: str
    generations_today: int
    spend_today: float
    circuit_open: bool
