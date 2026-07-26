/* Pure logic: iCal parsing (client-side preview only — the backend does the
   authoritative parse), calendar→mood mapping, and server-response
   validation. No DOM, no timers, no fetch. */

import { isMood, isKnownTrackId, type Mood } from "./tracks";

export interface CalendarEvent {
  summary: string;
  start: Date;
  /** Missing on events without DTEND. */
  end: Date | null;
  allDay: boolean;
}

// ── iCal parsing ──
// Enough RFC 5545 to preview "tomorrow's events" in the setup UI: line
// unfolding, VEVENT boundaries, SUMMARY / DTSTART / DTEND, all-day
// detection, text unescaping. Recurrence and exotic timezones are the
// backend's job.

/** RFC 5545 §3.1 line unfolding: a CRLF followed by space/tab continues the line. */
export function unfoldIcalLines(text: string): string[] {
  const raw = text.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/** Parse an iCal date/date-time value. Returns null on garbage. */
export function parseIcalDate(value: string): { date: Date; dateOnly: boolean } | null {
  // All-day: 20260730
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : { date: d, dateOnly: true };
  }
  // Date-time: 20260730T063000 or 20260730T063000Z
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (m) {
    const [y, mo, da, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number);
    const d = m[7] === "Z"
      ? new Date(Date.UTC(y, mo - 1, da, h, mi, s))
      : new Date(y, mo - 1, da, h, mi, s); // floating/TZID treated as local (preview only)
    return isNaN(d.getTime()) ? null : { date: d, dateOnly: false };
  }
  return null;
}

/** Parse an iCal feed into events. Malformed events are skipped, not thrown. */
export function parseIcal(text: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let current: { summary?: string; start?: { date: Date; dateOnly: boolean }; end?: { date: Date; dateOnly: boolean } } | null = null;

  for (const line of unfoldIcalLines(text)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const name = left.split(";")[0].toUpperCase();

    if (name === "BEGIN" && value.toUpperCase() === "VEVENT") {
      current = {};
    } else if (name === "END" && value.toUpperCase() === "VEVENT") {
      if (current && current.summary !== undefined && current.start) {
        events.push({
          summary: current.summary,
          start: current.start.date,
          end: current.end ? current.end.date : null,
          allDay: current.start.dateOnly,
        });
      }
      current = null;
    } else if (current) {
      if (name === "SUMMARY") current.summary = unescapeText(value).trim();
      else if (name === "DTSTART") current.start = parseIcalDate(value) ?? undefined;
      else if (name === "DTEND") current.end = parseIcalDate(value) ?? undefined;
    }
  }
  return events;
}

/** Events whose start falls on the given local date ("YYYY-MM-DD"). */
export function eventsOn(events: CalendarEvent[], targetDate: string): CalendarEvent[] {
  return events
    .filter((e) => localDateString(e.start) === targetDate)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function localDateString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ── Mood mapping ──
// Mirrors the backend's density heuristic so the preview and the fallback
// path agree with what the server would pick.

const MOOD_KEYWORDS: Array<[RegExp, Mood]> = [
  [/\b(beach|vacation|holiday|day off|pto|picnic|park)\b/i, "warm"],
  [/\b(party|birthday|concert|game night|festival)\b/i, "playful"],
  [/\b(gym|run|workout|race|training)\b/i, "energetic"],
  [/\b(interview|presentation|launch|deadline|exam)\b/i, "bold"],
  [/\b(dinner|date|brunch|coffee with)\b/i, "smooth"],
];

export function moodForEvents(events: CalendarEvent[], preferredGenre: string = "any"): Mood {
  if (preferredGenre !== "any" && isMood(preferredGenre)) return preferredGenre;
  for (const e of events) {
    for (const [re, mood] of MOOD_KEYWORDS) {
      if (re.test(e.summary)) return mood;
    }
  }
  const n = events.length;
  if (n === 0) return "warm";
  if (n <= 3) return "cheerful";
  if (n <= 7) return "energetic";
  return "bold";
}

// ── Server-response validation ──

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
