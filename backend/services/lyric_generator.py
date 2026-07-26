"""Claude API lyric generation with structured JSON output.

Model notes (claude-opus-5): thinking is on by default and counts toward
max_tokens; sampling params (temperature/top_p/top_k) are rejected; a safety
decline returns HTTP 200 with stop_reason == "refusal" — branch on it, don't
expect an exception. Spend is computed from response usage, never estimated.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import date

import anthropic

from config import Settings
from services.ical_parser import Event
from services.mood_mapper import MOODS

log = logging.getLogger("rf.lyrics")

MAX_TOKENS = 2000

PROMPT_TEMPLATE = """You are a morning alarm clock songwriter. Given a list of calendar events for tomorrow, write 6-10 lines of lyrics that summarize the day in a fun, upbeat, slightly cheesy style.

Rules:
- Rhyming couplets (AABB)
- Conversational, not formal
- First line: greeting with the person's day and date
- Middle lines: summarize 2-4 key events with specific details (times, names, places)
- Last 2 lines: motivational sign-off
- If no events: write about having a free day
- If 6+ events: pick the top 4 by time, mention "plus N more"
- Keep it positive. Nobody wants negativity at 6 AM.
- Slightly cheesy humor is encouraged
- Do NOT use profanity or controversial references

Also return a mood tag from: energetic, warm, groovy, smooth, cheerful, playful, bold

Calendar events for {date}:
{events_formatted}"""

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "lyrics": {
            "type": "array",
            "items": {"type": "string"},
            "description": "6-10 lines of rhyming lyrics",
        },
        "mood": {"type": "string", "enum": list(MOODS)},
    },
    "required": ["lyrics", "mood"],
    "additionalProperties": False,
}


class LyricApiError(Exception):
    """Claude API failure (timeout / 5xx / rate limit) — feeds the circuit breaker."""


@dataclass
class LyricResult:
    lyrics: list[str]
    mood: str
    cost: float


def format_events(events: list[Event]) -> str:
    if not events:
        return "(no events — a completely free day)"
    lines = []
    for e in events:
        when = "all day" if e.all_day else e.start.strftime("%H:%M")
        lines.append(f"- {when}: {e.summary}")
    return "\n".join(lines)


def build_prompt(events: list[Event], target: date) -> str:
    pretty_date = target.strftime("%A, %B %d, %Y")
    return PROMPT_TEMPLATE.format(date=pretty_date, events_formatted=format_events(events))


def generate_lyrics(
    events: list[Event],
    target: date,
    settings: Settings,
    client: anthropic.Anthropic | None = None,
) -> LyricResult | None:
    """One Claude call. Returns None on refusal or malformed output (caller
    serves the fallback); raises LyricApiError on API failures (caller feeds
    the circuit breaker)."""
    client = client or anthropic.Anthropic(api_key=settings.anthropic_api_key)
    try:
        response = client.messages.create(
            model=settings.claude_model,
            max_tokens=MAX_TOKENS,
            output_config={
                "effort": "low",
                "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA},
            },
            messages=[{"role": "user", "content": build_prompt(events, target)}],
        )
    except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.InternalServerError) as exc:
        raise LyricApiError(str(exc)) from exc
    except anthropic.APIStatusError as exc:
        raise LyricApiError(str(exc)) from exc

    cost = _cost_from_usage(response, settings)

    if getattr(response, "stop_reason", None) == "refusal":
        log.warning("Claude declined a lyric request (stop_reason=refusal)")
        return None

    text = _first_text_block(response)
    if text is None:
        return None
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        log.warning("Claude returned non-JSON lyric output")
        return None

    lyrics = data.get("lyrics") if isinstance(data, dict) else None
    mood = data.get("mood") if isinstance(data, dict) else None
    if (
        not isinstance(lyrics, list)
        or not (1 <= len(lyrics) <= 12)
        or not all(isinstance(l, str) and l.strip() for l in lyrics)
        or mood not in MOODS
    ):
        log.warning("Claude returned malformed lyric JSON")
        return None
    return LyricResult(lyrics=[l.strip() for l in lyrics], mood=mood, cost=cost)


def _first_text_block(response: object) -> str | None:
    for block in getattr(response, "content", []) or []:
        if getattr(block, "type", None) == "text":
            return getattr(block, "text", None)
    return None


def _cost_from_usage(response: object, settings: Settings) -> float:
    usage = getattr(response, "usage", None)
    if usage is None:
        return 0.0
    input_tokens = getattr(usage, "input_tokens", 0) or 0
    output_tokens = getattr(usage, "output_tokens", 0) or 0
    return (
        input_tokens / 1_000_000 * settings.input_cost_per_mtok
        + output_tokens / 1_000_000 * settings.output_cost_per_mtok
    )
