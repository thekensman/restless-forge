/* Backing track manifest — the single source of truth for moods, files,
   and loop points.

   The shipped audio files are PROGRAMMATICALLY GENERATED PLACEHOLDERS
   (see scripts/maintenance/gen-rar-tracks.mjs). Before launch they are
   replaced 1:1 with real produced tracks using the SAME filenames; only
   TRACK_EXT changes if the real files are mp3s. */

export const MOODS = [
  "energetic",
  "warm",
  "groovy",
  "smooth",
  "cheerful",
  "playful",
  "bold",
] as const;

export type Mood = (typeof MOODS)[number];

/** Swap to ".mp3" when the real produced tracks land. */
export const TRACK_EXT = ".wav";

/** Where playback loops back to for the extended outro (doc: 0:45–1:00). */
export const LOOP_START_SEC = 45;

export const TRACK_BASE = "/tools/rise-and-rhyme/tracks/";

export interface MoodTracks {
  /** Track ids (filename without extension); two per mood. */
  ids: string[];
  bpm: number;
}

export const TRACKS: Record<Mood, MoodTracks> = {
  energetic: { ids: ["energetic-01", "energetic-02"], bpm: 125 },
  warm: { ids: ["warm-01", "warm-02"], bpm: 105 },
  groovy: { ids: ["groovy-01", "groovy-02"], bpm: 110 },
  smooth: { ids: ["smooth-01", "smooth-02"], bpm: 100 },
  cheerful: { ids: ["cheerful-01", "cheerful-02"], bpm: 120 },
  playful: { ids: ["playful-01", "playful-02"], bpm: 135 },
  bold: { ids: ["bold-01", "bold-02"], bpm: 115 },
};

export const FALLBACK_JINGLE_ID = "fallback-jingle";

export function isMood(v: unknown): v is Mood {
  return typeof v === "string" && (MOODS as readonly string[]).includes(v);
}

/** URL for a track id, e.g. "cheerful-02" -> "/tools/rise-and-rhyme/tracks/cheerful-02.wav". */
export function trackUrl(trackId: string): string {
  return TRACK_BASE + trackId + TRACK_EXT;
}

/** True when the id belongs to the manifest (or is the fallback jingle). */
export function isKnownTrackId(trackId: string): boolean {
  if (trackId === FALLBACK_JINGLE_ID) return true;
  return MOODS.some((m) => TRACKS[m].ids.includes(trackId));
}

/** Deterministic-enough local pick when the server didn't choose a track. */
export function pickTrackId(mood: Mood, seed = Date.now()): string {
  const ids = TRACKS[mood].ids;
  return ids[Math.abs(seed) % ids.length];
}
