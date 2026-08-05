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


# ── ACE-Step style prompts ──
# The music description handed to the song model. Kept here, deterministic and
# per-mood, rather than asked of Claude: this is the single biggest lever on
# whether the output sounds good, and it wants tuning by ear against real
# generations, not re-invention on every request.
#
# Every prompt names a genre, a tempo feel, an instrument, and a vocal, because
# ACE-Step drifts toward generic backing music when any of those is missing.
STYLE_PROMPTS: dict[str, str] = {
    "energetic": "upbeat indie pop rock, driving drums, bright electric guitar, energetic male vocal, 125 bpm",
    "warm": "warm acoustic folk pop, gentle fingerpicked guitar, soft female vocal, relaxed 105 bpm",
    "groovy": "funk pop groove, syncopated bass, rhythm guitar, soulful vocal, 110 bpm",
    "smooth": "smooth jazzy soul, electric piano, brushed drums, mellow vocal, laid back 100 bpm",
    "cheerful": "cheerful bright pop, hand claps, ukulele and piano, sunny female vocal, 120 bpm",
    "playful": "playful indie pop, bouncy synth, whistling hook, fun male vocal, 135 bpm",
    "bold": "bold cinematic pop anthem, big drums, confident vocal, triumphant, 115 bpm",
}

# Morning-alarm framing appended to every style. The listener is half asleep:
# a clean mix and an intelligible vocal matter more than production ambition,
# and ACE-Step will happily bury the words under a wall of synths otherwise.
STYLE_SUFFIX = "clear intelligible vocals, clean mix, morning wake up song"


def style_for_mood(mood: str) -> str:
    """The `prompt` field sent to ACE-Step — the music, never the words."""
    base = STYLE_PROMPTS.get(mood) or STYLE_PROMPTS["cheerful"]
    return f"{base}, {STYLE_SUFFIX}"
