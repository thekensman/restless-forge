import json
from datetime import date, datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import anthropic
import httpx
import pytest

from services.ical_parser import Event
from services.lyric_generator import (
    LyricApiError,
    build_prompt,
    format_events,
    generate_lyrics,
)

TARGET = date(2026, 7, 30)
CHICAGO = ZoneInfo("America/Chicago")

EVENTS = [
    Event(summary="Standup", start=datetime(2026, 7, 30, 9, 0, tzinfo=CHICAGO), end=None, all_day=False),
    Event(summary="Dentist", start=datetime(2026, 7, 30, 14, 0, tzinfo=CHICAGO), end=None, all_day=False),
]


def fake_response(text=None, stop_reason="end_turn", input_tokens=500, output_tokens=300):
    content = [] if text is None else [SimpleNamespace(type="text", text=text)]
    return SimpleNamespace(
        content=content,
        stop_reason=stop_reason,
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens),
    )


class FakeClient:
    def __init__(self, response=None, error=None):
        self._response = response
        self._error = error
        self.last_kwargs = None
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        self.last_kwargs = kwargs
        if self._error is not None:
            raise self._error
        return self._response


GOOD_JSON = json.dumps({
    "lyrics": [
        "Good morning Ken, it's Thursday the thirtieth",
        "two things on the books, nothing too serious",
        "standup at nine, the usual crew",
        "dentist at two, don't forget that's new",
        "that's your Thursday, light and bright",
        "grab your coffee, you've got this, alright",
    ],
    "mood": "cheerful",
})

EXPECTED_COST = 500 / 1e6 * 5 + 300 / 1e6 * 25


def test_prompt_includes_events_and_date():
    prompt = build_prompt(EVENTS, TARGET)
    assert "Thursday, July 30, 2026" in prompt
    assert "9:00 AM: Standup" in prompt
    assert "2:00 PM: Dentist" in prompt
    assert "rhyming couplets" in prompt.lower()


def test_prompt_states_times_are_local():
    assert "local time" in build_prompt(EVENTS, TARGET)


def test_format_events_empty():
    assert "free day" in format_events([])


def test_format_events_all_day():
    e = Event(summary="Holiday", start=datetime(2026, 7, 30, tzinfo=CHICAGO), end=None, all_day=True)
    assert "all day: Holiday" in format_events([e])


def test_format_events_uses_twelve_hour_clock():
    e = Event(summary="Midnight run", start=datetime(2026, 7, 30, 0, 5, tzinfo=CHICAGO), end=None, all_day=False)
    assert "12:05 AM" in format_events([e])


def test_successful_generation(settings):
    client = FakeClient(response=fake_response(GOOD_JSON))
    outcome = generate_lyrics(EVENTS, TARGET, settings, client=client)
    assert outcome.ok
    assert len(outcome.lyrics) == 6
    assert outcome.mood == "cheerful"
    assert outcome.cost == pytest.approx(EXPECTED_COST)
    # Request shape: structured output + low effort, no sampling params.
    kwargs = client.last_kwargs
    assert kwargs["model"] == settings.claude_model
    assert kwargs["output_config"]["effort"] == "low"
    assert kwargs["output_config"]["format"]["type"] == "json_schema"
    assert "temperature" not in kwargs


def test_refusal_reports_not_ok_but_still_reports_cost(settings):
    """A refusal consumed billed tokens; dropping the cost hid real spend."""
    client = FakeClient(response=fake_response(text=None, stop_reason="refusal"))
    outcome = generate_lyrics(EVENTS, TARGET, settings, client=client)
    assert not outcome.ok
    assert outcome.cost == pytest.approx(EXPECTED_COST)


def test_malformed_json_reports_cost(settings):
    client = FakeClient(response=fake_response("this is not json"))
    outcome = generate_lyrics(EVENTS, TARGET, settings, client=client)
    assert not outcome.ok
    assert outcome.cost == pytest.approx(EXPECTED_COST)


def test_bad_shape_reports_not_ok(settings):
    client = FakeClient(response=fake_response(json.dumps({"lyrics": [], "mood": "cheerful"})))
    assert not generate_lyrics(EVENTS, TARGET, settings, client=client).ok
    client = FakeClient(response=fake_response(json.dumps({"lyrics": ["a"], "mood": "furious"})))
    assert not generate_lyrics(EVENTS, TARGET, settings, client=client).ok


def test_api_error_raises_lyric_api_error(settings):
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    err = anthropic.APIConnectionError(request=request)
    client = FakeClient(error=err)
    with pytest.raises(LyricApiError):
        generate_lyrics(EVENTS, TARGET, settings, client=client)
