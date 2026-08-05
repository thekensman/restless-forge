/* localStorage wrapper for preferences and the cached song. */

import type { Song } from "./engine";

export interface RiseAndRhymePrefs {
  icalUrl: string;
  alarmTime: string; // "06:30"
  alarmDays: number[]; // 0=Sun … 6=Sat
  genTime: string; // when to generate, evening before (default "22:00")
  preferredGenre: string; // "any" | mood tag
  volume: number; // 0-100
  snoozeMinutes: number;
  ttsVoice: string; // SpeechSynthesis voice name ("" = browser default)
  enabled: boolean;
}

export const DEFAULT_PREFS: RiseAndRhymePrefs = {
  icalUrl: "",
  alarmTime: "06:30",
  alarmDays: [1, 2, 3, 4, 5],
  genTime: "22:00",
  preferredGenre: "any",
  volume: 80,
  snoozeMinutes: 9,
  ttsVoice: "",
  enabled: false,
};

const PREFS_KEY = "rar:prefs:v1";
const SONG_KEY = "rar:song:v1";
const FIRED_KEY = "rar:fired:v1";

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / privacy mode — degrade silently */
  }
}

export function loadPrefs(): RiseAndRhymePrefs {
  const stored = read(PREFS_KEY);
  if (typeof stored !== "object" || stored === null) return { ...DEFAULT_PREFS };
  const s = stored as Partial<RiseAndRhymePrefs>;
  return {
    ...DEFAULT_PREFS,
    ...s,
    alarmDays: Array.isArray(s.alarmDays)
      ? s.alarmDays.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6)
      : DEFAULT_PREFS.alarmDays,
    volume: clamp(numberOr(s.volume, DEFAULT_PREFS.volume), 0, 100),
    snoozeMinutes: clamp(numberOr(s.snoozeMinutes, DEFAULT_PREFS.snoozeMinutes), 1, 60),
  };
}

export function savePrefs(prefs: RiseAndRhymePrefs): void {
  write(PREFS_KEY, prefs);
}

export interface CachedSong extends Song {
  /** The alarm date this song was generated for ("YYYY-MM-DD"). */
  targetDate: string;
  /** Job still rendering on the GPU, if any. Persisted rather than held in
      memory because generation runs at ~22:00 unattended: a reload, a browser
      restart, or a suspended tab must not orphan the song. */
  songJobId?: string;
  /** URL of the finished MP3. When absent the alarm uses the v1 path —
      backing track plus browser speech — which always works. */
  songUrl?: string;
  /** Set when a sung song was expected but won't arrive, so the UI can say
      what happened instead of silently degrading. */
  songFailed?: string;
}

export function saveCachedSong(song: CachedSong): void {
  write(SONG_KEY, song);
}

/** The cached song, or null when absent/expired/malformed. */
export function loadCachedSong(now: Date = new Date()): CachedSong | null {
  const stored = read(SONG_KEY);
  if (typeof stored !== "object" || stored === null) return null;
  const s = stored as CachedSong;
  if (!Array.isArray(s.lyrics) || typeof s.trackId !== "string" || typeof s.targetDate !== "string") {
    return null;
  }
  if (s.cacheUntil) {
    const until = new Date(s.cacheUntil);
    if (!isNaN(until.getTime()) && now.getTime() > until.getTime()) return null;
  }
  return s;
}

export function clearCachedSong(): void {
  try {
    localStorage.removeItem(SONG_KEY);
  } catch {
    /* ignore */
  }
}

// ── Fired markers ──
// Which alarm/generation occurrences have already been handled. Persisted
// rather than held in memory so a reload doesn't re-fire an alarm that
// already went off, and so a tab that was throttled or suspended can still
// act on an occurrence it slept through without double-firing.

interface FiredMarkers {
  alarm?: string;
  generation?: string;
}

function loadFired(): FiredMarkers {
  const stored = read(FIRED_KEY);
  return typeof stored === "object" && stored !== null ? (stored as FiredMarkers) : {};
}

export function wasFired(kind: keyof FiredMarkers, key: string): boolean {
  return loadFired()[kind] === key;
}

export function markFired(kind: keyof FiredMarkers, key: string): void {
  write(FIRED_KEY, { ...loadFired(), [kind]: key });
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && isFinite(v) ? v : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
