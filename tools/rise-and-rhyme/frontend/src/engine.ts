/* Pure helpers shared across the app: local-date formatting and validation
   of the server's response.

   NOTE: this module used to carry a full client-side iCal parser for a
   "preview tomorrow's events" feature. It was deleted rather than wired up:
   Google Calendar's iCal endpoint sends no CORS headers, so the browser can
   never fetch the feed directly — the parser was unreachable by construction,
   and its passing tests were giving false confidence. If the preview comes
   back, it needs a backend endpoint, not a browser-side parser. */

import { isMood, isKnownTrackId, type Mood } from "./tracks";

/** "YYYY-MM-DD" for the given date, in the browser's local timezone. */
export function localDateString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The IANA zone the browser is in, e.g. "America/Chicago".
    Sent with every generate request: a calendar day is meaningless without
    one, and the server uses it for the day window, the times it puts in the
    lyrics, and how long the song stays valid. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export interface Song {
  lyrics: string[];
  trackId: string;
  mood: Mood;
  eventCount: number;
  generatedAt: string;
  cacheUntil: string;
}

/** Validate the /generate "ok" payload. Returns null when malformed. */
export function validateSongResponse(data: unknown): Song | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.lyrics) || d.lyrics.length === 0 || d.lyrics.length > 16) return null;
  if (!d.lyrics.every((l) => typeof l === "string" && l.trim().length > 0)) return null;
  if (!isMood(d.mood)) return null;
  if (typeof d.track_id !== "string" || !isKnownTrackId(d.track_id)) return null;
  return {
    lyrics: d.lyrics as string[],
    trackId: d.track_id,
    mood: d.mood,
    eventCount: typeof d.event_count === "number" ? d.event_count : 0,
    generatedAt: typeof d.generated_at === "string" ? d.generated_at : new Date().toISOString(),
    cacheUntil: typeof d.cache_until === "string" ? d.cache_until : "",
  };
}
