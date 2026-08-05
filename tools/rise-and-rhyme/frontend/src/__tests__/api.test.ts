/**
 * Backend API client — the v2 sung-song contract.
 *
 * The theme here is that the client must never turn a recoverable situation
 * into a lost alarm. A pending generation still carries a complete playable
 * song; a failed poll is not a failed song.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchSongStatus, generateSong } from "../api";

function mockFetch(payload: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ status, json: async () => payload }) as unknown as Response),
  );
}

function failFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("network down");
    }),
  );
}

const OK_SONG = {
  lyrics: ["line one", "line two"],
  track_id: "cheerful-01",
  mood: "cheerful",
  event_count: 2,
  generated_at: "2026-07-30T22:00:00Z",
  cache_until: "2026-07-31T04:59:59Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("generateSong — pending", () => {
  it("returns the job id AND a complete, playable song", async () => {
    // The redundancy is the whole fallback design: a browser that never
    // manages to poll must still have something to ring with.
    mockFetch({ status: "pending", job_id: "job-abc", estimated_seconds: 75, poll_after: 5, ...OK_SONG });

    const result = await generateSong("https://cal", "2026-07-30", "any", "UTC");
    expect(result.status).toBe("pending");
    if (result.status !== "pending") return;
    expect(result.jobId).toBe("job-abc");
    expect(result.song.lyrics).toEqual(["line one", "line two"]);
    expect(result.song.trackId).toBe("cheerful-01");
    expect(result.estimatedSeconds).toBe(75);
  });

  it("falls back to sane poll timings when the server omits them", async () => {
    mockFetch({ status: "pending", job_id: "job-abc", ...OK_SONG });
    const result = await generateSong("https://cal", "2026-07-30", "any", "UTC");
    if (result.status !== "pending") throw new Error("expected pending");
    expect(result.pollAfter).toBeGreaterThan(0);
    expect(result.estimatedSeconds).toBeGreaterThan(0);
  });

  it("treats a pending response with no job id as a plain ok", async () => {
    // Nothing to poll — better to play the lyrics than to poll a job that
    // does not exist.
    mockFetch({ status: "pending", ...OK_SONG });
    const result = await generateSong("https://cal", "2026-07-30", "any", "UTC");
    expect(result.status).toBe("ok");
  });
});

describe("generateSong — ok", () => {
  it("surfaces the downgrade message when a song was expected but failed", async () => {
    mockFetch({ status: "ok", song: "unavailable", song_message: "Couldn't reach the studio.", ...OK_SONG });
    const result = await generateSong("https://cal", "2026-07-30", "any", "UTC");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.songMessage).toBe("Couldn't reach the studio.");
  });

  it("says nothing when sung songs are simply switched off", async () => {
    mockFetch({ status: "ok", song: "off", song_message: "", ...OK_SONG });
    const result = await generateSong("https://cal", "2026-07-30", "any", "UTC");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.songMessage).toBe("");
  });
});

describe("fetchSongStatus", () => {
  it("reports a finished song", async () => {
    mockFetch({ status: "ready", song_url: "/api/v1/rise-and-rhyme/song/tok.mp3", duration_seconds: 45 });
    const result = await fetchSongStatus("job-abc");
    expect(result).toEqual({
      status: "ready",
      songUrl: "/api/v1/rise-and-rhyme/song/tok.mp3",
      durationSeconds: 45,
    });
  });

  it("reports a failure so the caller can stop polling", async () => {
    mockFetch({ status: "failed", message: "GPU said no" });
    const result = await fetchSongStatus("job-abc");
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.message).toBe("GPU said no");
  });

  it("treats a network error as pending, not failed", async () => {
    // A dropped poll says nothing about the job. Declaring it dead here would
    // throw away a song that is very probably still rendering.
    failFetch();
    expect((await fetchSongStatus("job-abc")).status).toBe("pending");
  });

  it("treats an unparseable body as pending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 502,
        json: async () => {
          throw new SyntaxError("not json");
        },
      }) as unknown as Response),
    );
    expect((await fetchSongStatus("job-abc")).status).toBe("pending");
  });

  it("treats an unrecognised status as failed", async () => {
    // Unlike a transport problem, a well-formed response we do not understand
    // means the contract moved; polling forever would hide that.
    mockFetch({ status: "who-knows" });
    expect((await fetchSongStatus("job-abc")).status).toBe("failed");
  });

  it("encodes the job id into the URL", async () => {
    mockFetch({ status: "pending", elapsed_seconds: 10, poll_after: 5 });
    await fetchSongStatus("job/../etc");
    const call = (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock.calls[0];
    expect(call[0]).toBe("/api/v1/rise-and-rhyme/song-status/job%2F..%2Fetc");
  });
});
