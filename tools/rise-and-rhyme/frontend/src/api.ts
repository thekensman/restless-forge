/* Backend API client. One endpoint; relative /api URL works through the
   root dev proxy (:8080), the tool dev server proxy (:5198), and nginx
   in production. */

import { validateSongResponse, type Song } from "./engine";

const GENERATE_URL = "/api/v1/rise-and-rhyme/generate";
const PREVIEW_URL = "/api/v1/rise-and-rhyme/preview";
const SONG_STATUS_URL = "/api/v1/rise-and-rhyme/song-status/";

export type GenerateResult =
  /** Lyrics only — either sung songs are off, or this one couldn't start.
      `songMessage` is non-empty only in the second case. */
  | { status: "ok"; song: Song; songMessage: string }
  /** Lyrics are ready and a sung song is rendering. The Song is complete, so
      the alarm already works even if the poll never finishes. */
  | { status: "pending"; song: Song; jobId: string; estimatedSeconds: number; pollAfter: number }
  | { status: "rate_limited"; message: string; retryAfter: number }
  | { status: "capacity"; message: string }
  | { status: "error"; message: string };

export type SongStatusResult =
  | { status: "pending"; elapsedSeconds: number; pollAfter: number }
  | { status: "ready"; songUrl: string; durationSeconds: number }
  | { status: "failed"; message: string };

export interface PreviewEvent {
  time: string;
  summary: string;
  all_day: boolean;
}

export interface CalendarPreview {
  targetDate: string;
  /** Echoed by the server; shown in the UI so a wrong zone is visible. */
  timeZone: string;
  eventCount: number;
  events: PreviewEvent[];
  truncated: boolean;
  mood: string;
}

export type PreviewResult =
  | { status: "ok"; preview: CalendarPreview }
  | { status: "error"; message: string };

/** Read the calendar without writing a song — no model call, no cost, and it
    does not consume the one generation this calendar gets per day. */
export async function previewCalendar(
  icalUrl: string,
  targetDate: string,
  preferredGenre: string,
  timeZone: string,
): Promise<PreviewResult> {
  let res: Response;
  try {
    res = await fetch(PREVIEW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ical_url: icalUrl,
        target_date: targetDate,
        preferred_genre: preferredGenre,
        timezone: timeZone,
      }),
    });
  } catch {
    return { status: "error", message: "Could not reach the server. Check your connection." };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { status: "error", message: `Unexpected response from the server (HTTP ${res.status}).` };
  }

  const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  if (d.status === "ok" && Array.isArray(d.events)) {
    return {
      status: "ok",
      preview: {
        targetDate: String(d.target_date ?? ""),
        timeZone: String(d.timezone ?? ""),
        eventCount: typeof d.event_count === "number" ? d.event_count : d.events.length,
        events: d.events as PreviewEvent[],
        truncated: d.truncated === true,
        mood: String(d.mood ?? ""),
      },
    };
  }
  const message = typeof d.message === "string" ? d.message : "";
  return { status: "error", message: message || `Couldn't read that calendar (HTTP ${res.status}).` };
}

export async function generateSong(
  icalUrl: string,
  targetDate: string,
  preferredGenre: string,
  timeZone: string,
): Promise<GenerateResult> {
  let res: Response;
  try {
    res = await fetch(GENERATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ical_url: icalUrl,
        target_date: targetDate,
        preferred_genre: preferredGenre,
        // Without this the server expands the day in UTC: evening events fall
        // off the end, lyric times are wrong, and the song expires early.
        timezone: timeZone,
      }),
    });
  } catch {
    return { status: "error", message: "Could not reach the song server. Check your connection." };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { status: "error", message: `Unexpected response from the server (HTTP ${res.status}).` };
  }

  const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const message = typeof d.message === "string" ? d.message : "";

  if (d.status === "rate_limited") {
    return {
      status: "rate_limited",
      message: message || "A song was already generated for this calendar recently.",
      retryAfter: typeof d.retry_after === "number" ? d.retry_after : 0,
    };
  }
  if (d.status === "capacity") {
    return { status: "capacity", message: message || "The forge is busy today. Try again tomorrow." };
  }
  if (d.status === "ok" || d.status === "pending") {
    const song = validateSongResponse(d);
    if (!song) return { status: "error", message: "The server returned a malformed song." };
    if (d.status === "pending" && typeof d.job_id === "string" && d.job_id) {
      return {
        status: "pending",
        song,
        jobId: d.job_id,
        estimatedSeconds: numberOr(d.estimated_seconds, 75),
        pollAfter: numberOr(d.poll_after, 5),
      };
    }
    // `song_message` is set only when a sung song was expected and could not
    // be started — the UI uses it to explain the downgrade rather than quietly
    // handing over a lesser product.
    return { status: "ok", song, songMessage: typeof d.song_message === "string" ? d.song_message : "" };
  }
  return { status: "error", message: message || `Generation failed (HTTP ${res.status}).` };
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && isFinite(v) && v > 0 ? v : fallback;
}

/** Check on a song that's rendering on the GPU.
 *
 * Network trouble is reported as `pending`, not `failed`: a dropped poll says
 * nothing about the job, and the caller has its own overall deadline. Only the
 * server gets to declare a song dead. */
export async function fetchSongStatus(jobId: string): Promise<SongStatusResult> {
  let res: Response;
  try {
    res = await fetch(SONG_STATUS_URL + encodeURIComponent(jobId));
  } catch {
    return { status: "pending", elapsedSeconds: 0, pollAfter: 5 };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { status: "pending", elapsedSeconds: 0, pollAfter: 5 };
  }

  const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  if (d.status === "ready" && typeof d.song_url === "string" && d.song_url) {
    return {
      status: "ready",
      songUrl: d.song_url,
      durationSeconds: typeof d.duration_seconds === "number" ? d.duration_seconds : 0,
    };
  }
  if (d.status === "pending") {
    return {
      status: "pending",
      elapsedSeconds: typeof d.elapsed_seconds === "number" ? d.elapsed_seconds : 0,
      pollAfter: numberOr(d.poll_after, 5),
    };
  }
  return {
    status: "failed",
    message: typeof d.message === "string" && d.message ? d.message : "The sung song didn't come through.",
  };
}
