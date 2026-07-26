/* Backend API client. One endpoint; relative /api URL works through the
   root dev proxy (:8080), the tool dev server proxy (:5198), and nginx
   in production. */

import { validateSongResponse, type Song } from "./engine";

const GENERATE_URL = "/api/v1/rise-and-rhyme/generate";

export type GenerateResult =
  | { status: "ok"; song: Song }
  | { status: "rate_limited"; message: string; retryAfter: number }
  | { status: "capacity"; message: string }
  | { status: "error"; message: string };

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
  if (d.status === "ok") {
    const song = validateSongResponse(d);
    if (song) return { status: "ok", song };
    return { status: "error", message: "The server returned a malformed song." };
  }
  return { status: "error", message: message || `Generation failed (HTTP ${res.status}).` };
}
