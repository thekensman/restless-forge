/* Presentation logic for the calendar preview, kept pure so it can be tested
   without a DOM. app.ts owns the element it renders into. */

import type { CalendarPreview } from "./api";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Human summary of what the song will cover, e.g.
    "Thursday, July 30 · 3 events · mood: warm · times shown in America/Chicago". */
export function previewCaption(p: CalendarPreview): string {
  const parts: string[] = [];
  const day = new Date(`${p.targetDate}T12:00:00`);
  if (!isNaN(day.getTime())) {
    parts.push(day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }));
  }
  parts.push(p.eventCount === 1 ? "1 event" : `${p.eventCount} events`);
  if (p.mood) parts.push(`mood: ${p.mood}`);
  // Surfacing the zone is the point: it is how someone spots that their song
  // would have been written for the wrong day.
  if (p.timeZone) parts.push(`times shown in ${p.timeZone}`);
  return parts.join(" · ");
}

/** The preview body. Returns HTML for the caller to inject. */
export function renderPreview(p: CalendarPreview): string {
  const caption = `<p class="preview__caption">${escapeHtml(previewCaption(p))}</p>`;

  if (p.eventCount === 0) {
    return (
      caption +
      '<p class="preview__empty">Nothing on the calendar — you\'ll get a ' +
      "free-day song.</p>"
    );
  }

  const rows = p.events
    .map(
      (e) =>
        '<li class="preview__event">' +
        `<span class="preview__time">${escapeHtml(e.time)}</span>` +
        `<span class="preview__summary">${escapeHtml(e.summary)}</span>` +
        "</li>",
    )
    .join("");

  const remaining = p.eventCount - p.events.length;
  const more =
    remaining > 0
      ? `<p class="preview__more">plus ${remaining} more — the song covers the highlights.</p>`
      : "";

  return `${caption}<ul class="preview__list">${rows}</ul>${more}`;
}
