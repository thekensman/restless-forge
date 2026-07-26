"""Calendar → mood mapping and track selection.

Mirrors the frontend heuristic in tools/rise-and-rhyme/frontend/src/engine.ts
so previews and fallbacks agree with the server. The track manifest mirrors
src/tracks.ts — same ids, same moods.
"""

from __future__ import annotations

import random
import re
from typing import Sequence

MOODS = ("energetic", "warm", "groovy", "smooth", "cheerful", "playful", "bold")

TRACKS: dict[str, list[str]] = {
    "energetic": ["energetic-01", "energetic-02"],
    "warm": ["warm-01", "warm-02"],
    "groovy": ["groovy-01", "groovy-02"],
    "smooth": ["smooth-01", "smooth-02"],
    "cheerful": ["cheerful-01", "cheerful-02"],
    "playful": ["playful-01", "playful-02"],
    "bold": ["bold-01", "bold-02"],
}

_KEYWORDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(beach|vacation|holiday|day off|pto|picnic|park)\b", re.I), "warm"),
    (re.compile(r"\b(party|birthday|concert|game night|festival)\b", re.I), "playful"),
    (re.compile(r"\b(gym|run|workout|race|training)\b", re.I), "energetic"),
    (re.compile(r"\b(interview|presentation|launch|deadline|exam)\b", re.I), "bold"),
    (re.compile(r"\b(dinner|date|brunch|coffee with)\b", re.I), "smooth"),
]


def mood_for_events(summaries: Sequence[str], preferred_genre: str = "any") -> str:
    """Density heuristic with keyword overrides; an explicit preference wins."""
    if preferred_genre != "any" and preferred_genre in MOODS:
        return preferred_genre
    for summary in summaries:
        for pattern, mood in _KEYWORDS:
            if pattern.search(summary):
                return mood
    n = len(summaries)
    if n == 0:
        return "warm"
    if n <= 3:
        return "cheerful"
    if n <= 7:
        return "energetic"
    return "bold"


def pick_track(mood: str, rng: random.Random | None = None) -> str:
    """A track id for the mood, e.g. 'cheerful-02'."""
    ids = TRACKS.get(mood) or TRACKS["cheerful"]
    return (rng or random).choice(ids)
