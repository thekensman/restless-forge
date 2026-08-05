"""Sung-song generation: the v2 job flow, and every way it falls back to v1.

The through-line of this file is that a failure to sing must never cost
someone their alarm. Each failure mode here is checked for two things: the
lyrics survive, and the caller is told what happened.
"""

import time

import httpx
import pytest
from fastapi.testclient import TestClient

import main as main_module
from db import Db
from services import ical_parser, lyric_generator, runpod_client, song_cache, song_jobs
from services.lyric_generator import LyricOutcome, Section

GOOGLE = "https://calendar.google.com/calendar/ical/abc123/basic.ics"

FEED = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:1
SUMMARY:Standup
DTSTART:20260730T120000Z
END:VEVENT
END:VCALENDAR
"""

SECTIONS = [
    Section("verse", ["line one", "line two"]),
    Section("chorus", ["line three", "line four"]),
]

# A minimal but genuinely MP3-shaped payload: the frame-sync bytes the client
# checks for. A test fixture of b"not audio" would pass a weaker check and hide
# the very failure that check exists to catch.
FAKE_MP3 = b"\xff\xfb\x90\x00" + b"\x00" * 512


def body(target="2026-07-30"):
    return {
        "ical_url": GOOGLE,
        "target_date": target,
        "preferred_genre": "any",
        "timezone": "America/Chicago",
    }


@pytest.fixture
def client(song_settings, monkeypatch):
    monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)
    monkeypatch.setattr(
        lyric_generator,
        "generate_lyrics",
        lambda events, target, s, client=None: LyricOutcome(SECTIONS, "cheerful", 0.01),
    )
    return TestClient(main_module.create_app(song_settings))


# ── Submission ──


def test_generate_returns_pending_and_the_full_v1_payload(client, monkeypatch):
    """The pending response must stand alone as a working alarm.

    If it only carried a job id, a browser that never managed to poll would
    have nothing to ring with."""
    monkeypatch.setattr(runpod_client, "submit", lambda *a, **k: "runpod-1")

    r = client.post("/api/v1/rise-and-rhyme/generate", json=body())
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "pending"
    assert data["job_id"]
    assert data["lyrics"] == ["line one", "line two", "line three", "line four"]
    assert data["track_id"]
    assert data["mood"] == "cheerful"
    assert data["cache_until"]


def test_submit_receives_tagged_lyrics_and_a_style_prompt(client, monkeypatch):
    """prompt and lyrics are separate ACE-Step fields.

    Merging them makes the model sing the genre tags aloud, and untagged
    lyrics produce a song with no discernible structure."""
    captured = {}

    def fake_submit(lyrics, style, settings, **kw):
        captured["lyrics"] = lyrics
        captured["style"] = style
        return "runpod-1"

    monkeypatch.setattr(runpod_client, "submit", fake_submit)
    client.post("/api/v1/rise-and-rhyme/generate", json=body())

    assert "[verse]" in captured["lyrics"]
    assert "[chorus]" in captured["lyrics"]
    assert "line one" in captured["lyrics"]
    # The style describes music only — none of the sung words leak into it.
    assert "line one" not in captured["style"]
    assert "bpm" in captured["style"]


def test_submit_failure_falls_back_to_lyrics_with_an_explanation(client, monkeypatch):
    """A GPU that can't be reached must not cost the lyrics Claude was paid for."""

    def boom(*a, **k):
        raise runpod_client.RunPodError("endpoint unreachable")

    monkeypatch.setattr(runpod_client, "submit", boom)

    data = client.post("/api/v1/rise-and-rhyme/generate", json=body()).json()
    assert data["status"] == "ok"
    assert data["lyrics"] == ["line one", "line two", "line three", "line four"]
    assert data["song"] == "unavailable"
    # The downgrade is stated, not silent.
    assert data["song_message"]


def test_flag_off_serves_v1_and_says_nothing_about_songs(settings, monkeypatch):
    """RunPod unset is a supported state, not a degraded one."""
    monkeypatch.setattr(ical_parser, "fetch_feed", lambda url: FEED)
    monkeypatch.setattr(
        lyric_generator,
        "generate_lyrics",
        lambda events, target, s, client=None: LyricOutcome(SECTIONS, "cheerful", 0.01),
    )
    c = TestClient(main_module.create_app(settings))

    data = c.post("/api/v1/rise-and-rhyme/generate", json=body()).json()
    assert data["status"] == "ok"
    assert data["song"] == "off"
    assert data["song_message"] == ""


# ── Polling ──


def _start_job(client, monkeypatch) -> str:
    monkeypatch.setattr(runpod_client, "submit", lambda *a, **k: "runpod-1")
    return client.post("/api/v1/rise-and-rhyme/generate", json=body()).json()["job_id"]


def test_poll_pending_then_ready_writes_the_audio(client, song_settings, monkeypatch):
    job_id = _start_job(client, monkeypatch)

    monkeypatch.setattr(runpod_client, "poll", lambda *a, **k: runpod_client.SongResult("pending"))
    r = client.get(f"/api/v1/rise-and-rhyme/song-status/{job_id}")
    assert r.json()["status"] == "pending"
    assert r.json()["poll_after"] > 0

    monkeypatch.setattr(
        runpod_client,
        "poll",
        lambda *a, **k: runpod_client.SongResult(
            "ready", audio=FAKE_MP3, sample_rate=48000, duration_seconds=45.0, execution_ms=30000
        ),
    )
    data = client.get(f"/api/v1/rise-and-rhyme/song-status/{job_id}").json()
    assert data["status"] == "ready"
    assert data["song_url"] == f"/api/v1/rise-and-rhyme/song/{job_id}.mp3"
    assert song_cache.exists(job_id, song_settings.song_cache_dir)

    audio = client.get(data["song_url"])
    assert audio.status_code == 200
    assert audio.content == FAKE_MP3
    assert audio.headers["content-type"] == "audio/mpeg"


def test_worker_error_is_a_failed_song_not_a_failed_service(client, monkeypatch):
    """The client should stop polling and use its lyrics — not see a 5xx."""
    job_id = _start_job(client, monkeypatch)
    monkeypatch.setattr(
        runpod_client,
        "poll",
        lambda *a, **k: runpod_client.SongResult("failed", message="CUDA out of memory"),
    )

    r = client.get(f"/api/v1/rise-and-rhyme/song-status/{job_id}")
    assert r.status_code == 200
    assert r.json()["status"] == "failed"
    assert "CUDA" in r.json()["message"]


def test_poll_network_error_stays_pending(client, monkeypatch):
    """A dropped poll says nothing about the job.

    Declaring the song dead here would throw away a generation that is very
    probably still running; the timeout is what ends it."""
    job_id = _start_job(client, monkeypatch)

    def boom(*a, **k):
        raise runpod_client.RunPodError("connection reset")

    monkeypatch.setattr(runpod_client, "poll", boom)
    assert client.get(f"/api/v1/rise-and-rhyme/song-status/{job_id}").json()["status"] == "pending"


def test_job_times_out(client, song_settings, monkeypatch):
    job_id = _start_job(client, monkeypatch)
    # Age the job past the deadline rather than sleeping through it.
    with Db(song_settings.db_path).connect() as conn:
        conn.execute(
            "UPDATE song_jobs SET created_ts = ? WHERE job_id = ?",
            (time.time() - song_settings.song_job_timeout_sec - 10, job_id),
        )

    monkeypatch.setattr(runpod_client, "poll", lambda *a, **k: runpod_client.SongResult("pending"))
    data = client.get(f"/api/v1/rise-and-rhyme/song-status/{job_id}").json()
    assert data["status"] == "failed"
    assert "timed out" in data["message"].lower()


def test_unknown_and_malformed_job_ids_404(client):
    assert client.get("/api/v1/rise-and-rhyme/song-status/nope").status_code == 404
    # Path traversal via the token, which is also the filename.
    assert client.get("/api/v1/rise-and-rhyme/song-status/..%2F..%2Fetc").status_code == 404


def test_expired_audio_reports_expired_rather_than_a_bare_404(client, song_settings, monkeypatch):
    """The job row outlives the file on purpose.

    A song swept overnight should say so at 6:30am, not fail namelessly."""
    job_id = _start_job(client, monkeypatch)
    monkeypatch.setattr(
        runpod_client,
        "poll",
        lambda *a, **k: runpod_client.SongResult("ready", audio=FAKE_MP3, duration_seconds=45.0),
    )
    client.get(f"/api/v1/rise-and-rhyme/song-status/{job_id}")

    song_cache.delete(job_id, song_settings.song_cache_dir)
    r = client.get(f"/api/v1/rise-and-rhyme/song-status/{job_id}")
    assert r.status_code == 404
    assert "expired" in r.json()["message"].lower()


# ── Spend ──


def test_gpu_time_is_charged_once_however_often_it_is_polled(client, song_settings, monkeypatch):
    """Polling is a loop; billing must not be.

    Charging per poll would let one song add cents on every 5-second tick and
    trip the daily cap on its own."""
    job_id = _start_job(client, monkeypatch)
    monkeypatch.setattr(
        runpod_client,
        "poll",
        lambda *a, **k: runpod_client.SongResult(
            "ready", audio=FAKE_MP3, duration_seconds=45.0, execution_ms=40000
        ),
    )

    for _ in range(4):
        assert client.get(f"/api/v1/rise-and-rhyme/song-status/{job_id}").json()["status"] == "ready"

    metrics = client.get(
        "/api/v1/rise-and-rhyme/health", headers={"X-Metrics-Token": "test-metrics-token"}
    ).json()["metrics"]
    expected_gpu = 40.0 * song_settings.runpod_cost_per_sec
    # 0.01 from the Claude call, plus exactly one job's worth of GPU time.
    assert metrics["spend_today"] == pytest.approx(0.01 + expected_gpu, abs=1e-6)
    # And the song counts as one generation, not two.
    assert metrics["generations_today"] == 1


def test_failed_jobs_still_pay_for_the_gpu_time_they_used(client, song_settings, monkeypatch):
    """A job that died after 30s on the card still cost 30s."""
    job_id = _start_job(client, monkeypatch)
    monkeypatch.setattr(
        runpod_client,
        "poll",
        lambda *a, **k: runpod_client.SongResult("failed", message="boom", execution_ms=30000),
    )
    client.get(f"/api/v1/rise-and-rhyme/song-status/{job_id}")

    metrics = client.get(
        "/api/v1/rise-and-rhyme/health", headers={"X-Metrics-Token": "test-metrics-token"}
    ).json()["metrics"]
    assert metrics["spend_today"] > 0.01


# ── RunPod client parsing ──


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("boom", request=None, response=None)

    def json(self):
        return self._payload


class FakeHttp:
    def __init__(self, payload, status=200):
        self.response = FakeResponse(payload, status)
        self.last = None

    def post(self, url, **kw):
        self.last = (url, kw)
        return self.response

    def get(self, url, **kw):
        self.last = (url, kw)
        return self.response


def test_submit_returns_the_job_id(song_settings):
    http = FakeHttp({"id": "abc", "status": "IN_QUEUE"})
    assert runpod_client.submit("[verse]\nhi", "pop", song_settings, client=http) == "abc"
    url, kw = http.last
    assert song_settings.runpod_endpoint_id in url
    assert kw["json"]["input"]["lyrics"] == "[verse]\nhi"
    assert kw["json"]["input"]["prompt"] == "pop"


def test_submit_without_an_id_is_an_error(song_settings):
    with pytest.raises(runpod_client.RunPodError):
        runpod_client.submit("x", "y", song_settings, client=FakeHttp({"error": "nope"}))


def test_poll_rejects_audio_that_is_not_an_mp3(song_settings):
    """An ffmpeg failure in the worker would otherwise reach a browser as
    audio/mpeg and be diagnosed as 'the alarm played silence'."""
    import base64

    payload = {
        "status": "COMPLETED",
        "executionTime": 1000,
        "output": {"status": "ok", "audio_base64": base64.b64encode(b"not audio").decode()},
    }
    result = runpod_client.poll("j", song_settings, client=FakeHttp(payload))
    assert result.state == "failed"
    assert "non-MP3" in result.message


def test_poll_maps_runpod_states(song_settings):
    import base64

    ok = {
        "status": "COMPLETED",
        "executionTime": 2500,
        "output": {
            "status": "ok",
            "audio_base64": base64.b64encode(FAKE_MP3).decode(),
            "sample_rate": 48000,
            "duration_seconds": 45.0,
        },
    }
    result = runpod_client.poll("j", song_settings, client=FakeHttp(ok))
    assert result.state == "ready" and result.audio == FAKE_MP3
    assert result.sample_rate == 48000 and result.execution_ms == 2500

    assert runpod_client.poll("j", song_settings, client=FakeHttp({"status": "IN_QUEUE"})).state == "pending"
    assert runpod_client.poll("j", song_settings, client=FakeHttp({"status": "IN_PROGRESS"})).state == "pending"
    assert runpod_client.poll("j", song_settings, client=FakeHttp({"status": "FAILED"})).state == "failed"
    assert runpod_client.poll("j", song_settings, client=FakeHttp({"status": "TIMED_OUT"})).state == "failed"


# ── Cache ──


def test_tokens_reject_traversal(tmp_path):
    assert song_cache.is_valid_token("abc-123_XYZ")
    for bad in ("../etc/passwd", "a/b", "a.b", "", "x" * 200):
        assert not song_cache.is_valid_token(bad)
        with pytest.raises(ValueError):
            song_cache.path_for(bad, str(tmp_path))


def test_sweep_removes_only_expired_audio(tmp_path):
    cache = str(tmp_path / "songs")
    fresh = song_cache.store(FAKE_MP3, cache, song_cache.new_token())
    stale = song_cache.store(FAKE_MP3, cache, song_cache.new_token())

    import os

    old = time.time() - 40 * 3600
    os.utime(song_cache.path_for(stale, cache), (old, old))

    assert song_cache.sweep(cache, retention_hours=36) == 1
    assert song_cache.exists(fresh, cache)
    assert not song_cache.exists(stale, cache)


def test_store_is_atomic(tmp_path):
    """The file is readable the moment its token is known, so a partial write
    must never be visible under the final name."""
    cache = str(tmp_path / "songs")
    token = song_cache.new_token()
    song_cache.store(FAKE_MP3, cache, token)
    import os

    assert not any(f.endswith(".part") for f in os.listdir(cache))


def test_billing_can_only_be_claimed_once(db):
    song_jobs.create(db, "job-1", "runpod-1")
    assert song_jobs.claim_billing(db, "job-1") is True
    assert song_jobs.claim_billing(db, "job-1") is False
