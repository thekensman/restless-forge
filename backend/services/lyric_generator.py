"""Claude API lyric generation with structured JSON output.

Model notes (claude-opus-5): thinking is on by default and counts toward
max_tokens; sampling params (temperature/top_p/top_k) are rejected; a safety
decline returns HTTP 200 with stop_reason == "refusal" — branch on it, don't
expect an exception. Spend is computed from response usage, never estimated.

The returned outcome ALWAYS carries the cost, including when the lyrics are
unusable. A refusal or malformed response still consumed billed tokens, so
the caller must be able to charge it against the daily cap; an earlier version
returned None and silently dropped that spend.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import date

import anthropic

from config import Settings
from services.ical_parser import Event, format_clock
from services.mood_mapper import MOODS

log = logging.getLogger("rf.lyrics")

MAX_TOKENS = 2000

# Sections ACE-Step understands. Anything outside this set is dropped rather
# than passed through, so a hallucinated tag can't end up being sung.
SECTIONS = ("verse", "chorus", "bridge", "outro")

PROMPT_TEMPLATE = """You are a morning alarm clock songwriter. Given a list of calendar events for tomorrow, write a short song that summarizes the day in a fun, upbeat, slightly cheesy style.

Structure the song into sections. A good default is verse, chorus, verse, chorus — but a short day may only need one verse and one chorus. Total 6-12 lines across all sections.

Rules:
- Rhyming couplets (AABB) within each section
- Conversational, not formal
- The first verse opens with a greeting naming the day and date
- Verses summarize 2-4 key events with specific details (times, names, places)
- The chorus is the hook: short, repeatable, motivational. It is sung more than once, so it must NOT mention specific events or times
- The last section signs off with encouragement
- If no events: write about having a free day
- If 6+ events: pick the top 4 by time, mention "plus N more"
- Keep it positive. Nobody wants negativity at 6 AM.
- Slightly cheesy humor is encouraged
- Do NOT use profanity or controversial references
- These lines will be SUNG. Keep them short and singable — roughly 6-10 words per line, no parentheticals, no stage directions

Also return a mood tag from: energetic, warm, groovy, smooth, cheerful, playful, bold

Calendar events for {date} (times are the listener's local time):
{events_formatted}"""

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "sections": {
            "type": "array",
            "description": "The song, in order, split into 2-4 sections",
            "items": {
                "type": "object",
                "properties": {
                    "tag": {"type": "string", "enum": list(SECTIONS)},
                    "lines": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["tag", "lines"],
                "additionalProperties": False,
            },
        },
        "mood": {"type": "string", "enum": list(MOODS)},
    },
    "required": ["sections", "mood"],
    "additionalProperties": False,
}


class LyricApiError(Exception):
    """Claude API failure (timeout / 5xx / rate limit) — feeds the circuit breaker."""


@dataclass
class Section:
    """One structural block of the song, e.g. a verse or the chorus."""

    tag: str
    lines: list[str]


@dataclass
class LyricOutcome:
    """Result of one Claude call. `cost` is always meaningful, even when the
    lyrics are unusable, so failures still count against the spend cap."""

    sections: list[Section] | None
    mood: str | None
    cost: float

    @property
    def ok(self) -> bool:
        return self.sections is not None and self.mood is not None

    @property
    def lyrics(self) -> list[str]:
        """Every line in order, with no section tags.

        This is what the UI displays and what browser TTS reads in the v1
        fallback path. Derived rather than returned separately by the model, so
        the sung song and the on-screen words cannot disagree.
        """
        if not self.sections:
            return []
        return [line for section in self.sections for line in section.lines]

    def tagged(self) -> str:
        """The lyrics as ACE-Step wants them: a [tag] line above each section.

        Without these markers the model has no structure to follow and the
        result wanders — no discernible chorus, no shape.
        """
        if not self.sections:
            return ""
        blocks = [f"[{s.tag}]\n" + "\n".join(s.lines) for s in self.sections]
        return "\n\n".join(blocks)


def format_events(events: list[Event]) -> str:
    """Render events for the prompt. Starts are already in the listener's zone
    (see ical_parser.events_for_date), so these are the times they will see."""
    if not events:
        return "(no events — a completely free day)"
    return "\n".join(
        f"- {'all day' if e.all_day else format_clock(e.start)}: {e.summary}" for e in events
    )


def build_prompt(events: list[Event], target: date) -> str:
    pretty_date = target.strftime("%A, %B %d, %Y")
    return PROMPT_TEMPLATE.format(date=pretty_date, events_formatted=format_events(events))


def generate_lyrics(
    events: list[Event],
    target: date,
    settings: Settings,
    client: anthropic.Anthropic | None = None,
) -> LyricOutcome:
    """One Claude call.

    Returns a LyricOutcome; `ok` is False on refusal or malformed output (the
    caller serves the fallback) but `cost` is populated either way. Raises
    LyricApiError on API failures so the caller can trip the circuit breaker.
    """
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
        return LyricOutcome(None, None, cost)

    text = _first_text_block(response)
    if text is None:
        return LyricOutcome(None, None, cost)
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        log.warning("Claude returned non-JSON lyric output")
        return LyricOutcome(None, None, cost)

    raw_sections = data.get("sections") if isinstance(data, dict) else None
    mood = data.get("mood") if isinstance(data, dict) else None
    sections = _parse_sections(raw_sections)
    if sections is None or mood not in MOODS:
        log.warning("Claude returned malformed lyric JSON")
        return LyricOutcome(None, None, cost)
    return LyricOutcome(sections, mood, cost)


def _parse_sections(raw: object) -> list[Section] | None:
    """Validate the model's section list. Returns None when unusable.

    Total lines are bounded because they become both an alarm screen and a
    sung song of fixed length: past ~16 lines ACE-Step runs out of seconds and
    truncates mid-word.
    """
    if not isinstance(raw, list) or not (1 <= len(raw) <= 6):
        return None
    sections: list[Section] = []
    total = 0
    for item in raw:
        if not isinstance(item, dict):
            return None
        tag = item.get("tag")
        lines = item.get("lines")
        if tag not in SECTIONS or not isinstance(lines, list) or not lines:
            return None
        clean = [line.strip() for line in lines if isinstance(line, str) and line.strip()]
        if not clean:
            return None
        total += len(clean)
        sections.append(Section(tag, clean))
    if not (1 <= total <= 16):
        return None
    return sections


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
