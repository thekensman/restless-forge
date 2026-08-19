import random

from services.mood_mapper import MOODS, TRACKS, mood_for_events, pick_track


def test_density_mapping():
    assert mood_for_events([]) == "warm"
    assert mood_for_events(["A", "B"]) == "cheerful"
    assert mood_for_events(["A", "B", "C", "D", "E"]) == "energetic"
    assert mood_for_events([f"E{i}" for i in range(9)]) == "bold"


def test_keyword_override():
    assert mood_for_events(["Beach day"]) == "warm"
    assert mood_for_events(["Final exam", "B", "C"]) == "bold"
    assert mood_for_events(["Team workout"]) == "energetic"


def test_genre_preference_wins():
    assert mood_for_events(["Beach day"], preferred_genre="playful") == "playful"
    assert mood_for_events([], preferred_genre="nonsense") == "warm"


def test_pick_track_valid():
    rng = random.Random(42)
    for mood in MOODS:
        assert pick_track(mood, rng) in TRACKS[mood]
    # unknown mood falls back safely
    assert pick_track("unknown", rng) in TRACKS["cheerful"]
