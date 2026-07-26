import { beforeEach, describe, it, expect } from "vitest";
import {
  DEFAULT_PREFS,
  clearCachedSong,
  loadCachedSong,
  loadPrefs,
  saveCachedSong,
  savePrefs,
  type CachedSong,
} from "../storage";

const SONG: CachedSong = {
  lyrics: ["line one", "line two"],
  trackId: "warm-01",
  mood: "warm",
  eventCount: 2,
  generatedAt: "2026-07-29T22:00:00Z",
  cacheUntil: "2026-07-30T12:00:00Z",
  targetDate: "2026-07-30",
};

beforeEach(() => {
  localStorage.clear();
});

describe("prefs", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("round-trips saved prefs", () => {
    const p = { ...DEFAULT_PREFS, icalUrl: "https://calendar.google.com/x.ics", volume: 55, enabled: true };
    savePrefs(p);
    expect(loadPrefs()).toEqual(p);
  });

  it("recovers from corrupted JSON", () => {
    localStorage.setItem("rar:prefs:v1", "{not json");
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("sanitizes out-of-range values", () => {
    localStorage.setItem(
      "rar:prefs:v1",
      JSON.stringify({ volume: 900, snoozeMinutes: -5, alarmDays: [1, 99, "x", 6] }),
    );
    const p = loadPrefs();
    expect(p.volume).toBe(100);
    expect(p.snoozeMinutes).toBe(1);
    expect(p.alarmDays).toEqual([1, 6]);
  });
});

describe("cached song", () => {
  it("round-trips a song", () => {
    saveCachedSong(SONG);
    expect(loadCachedSong(new Date("2026-07-30T06:30:00Z"))).toEqual(SONG);
  });

  it("expires past cacheUntil", () => {
    saveCachedSong(SONG);
    expect(loadCachedSong(new Date("2026-07-30T13:00:00Z"))).toBeNull();
  });

  it("returns null for malformed stored songs", () => {
    localStorage.setItem("rar:song:v1", JSON.stringify({ lyrics: "nope" }));
    expect(loadCachedSong()).toBeNull();
  });

  it("clears", () => {
    saveCachedSong(SONG);
    clearCachedSong();
    expect(loadCachedSong(new Date("2026-07-30T06:30:00Z"))).toBeNull();
  });
});
