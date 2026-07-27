import { describe, it, expect } from "vitest";
import { localDateString, localTimeZone, validateSongResponse } from "../engine";

describe("localDateString", () => {
  it("formats with zero padding", () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("uses local calendar fields, not UTC", () => {
    // 2026-07-30 23:30 local is already the next day in UTC for western
    // zones; the local date is what the server needs.
    const d = new Date(2026, 6, 30, 23, 30);
    expect(localDateString(d)).toBe("2026-07-30");
  });
});

describe("localTimeZone", () => {
  it("returns a usable IANA zone", () => {
    const tz = localTimeZone();
    expect(typeof tz).toBe("string");
    expect(tz.length).toBeGreaterThan(0);
    // Must be resolvable, since the server rejects unknown zones.
    expect(() => new Intl.DateTimeFormat("en-US", { timeZone: tz })).not.toThrow();
  });
});

describe("validateSongResponse", () => {
  const good = {
    status: "ok",
    lyrics: ["Good morning Ken, it's Thursday", "coffee first, then the highway"],
    track_id: "cheerful-02",
    mood: "cheerful",
    event_count: 3,
    generated_at: "2026-07-29T22:01:14Z",
    cache_until: "2026-07-31T04:59:59Z",
  };

  it("accepts a valid payload", () => {
    const song = validateSongResponse(good);
    expect(song).not.toBeNull();
    expect(song!.trackId).toBe("cheerful-02");
    expect(song!.mood).toBe("cheerful");
    expect(song!.lyrics).toHaveLength(2);
    expect(song!.cacheUntil).toBe("2026-07-31T04:59:59Z");
  });

  it("rejects malformed payloads", () => {
    expect(validateSongResponse(null)).toBeNull();
    expect(validateSongResponse({ ...good, lyrics: [] })).toBeNull();
    expect(validateSongResponse({ ...good, lyrics: [42] })).toBeNull();
    expect(validateSongResponse({ ...good, mood: "angry" })).toBeNull();
    expect(validateSongResponse({ ...good, track_id: "../../etc/passwd" })).toBeNull();
    expect(validateSongResponse({ ...good, lyrics: Array(20).fill("line") })).toBeNull();
  });

  it("rejects a track id outside the shipped manifest", () => {
    expect(validateSongResponse({ ...good, track_id: "cheerful-99" })).toBeNull();
  });
});
