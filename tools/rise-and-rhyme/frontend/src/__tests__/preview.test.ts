import { describe, it, expect } from "vitest";
import { previewCaption, renderPreview } from "../preview";
import type { CalendarPreview } from "../api";

function preview(over: Partial<CalendarPreview> = {}): CalendarPreview {
  return {
    targetDate: "2026-07-30",
    timeZone: "America/Chicago",
    eventCount: 2,
    truncated: false,
    mood: "cheerful",
    events: [
      { time: "7:00 AM", summary: "Standup", all_day: false },
      { time: "8:00 PM", summary: "Late dinner", all_day: false },
    ],
    ...over,
  };
}

describe("previewCaption", () => {
  it("names the day, the count, the mood, and the zone", () => {
    const c = previewCaption(preview());
    expect(c).toContain("Thursday");
    expect(c).toContain("2 events");
    expect(c).toContain("mood: cheerful");
    // The zone is the point of the whole feature — it's how a user notices
    // their song would be written for the wrong day.
    expect(c).toContain("America/Chicago");
  });

  it("uses the singular for one event", () => {
    expect(previewCaption(preview({ eventCount: 1 }))).toContain("1 event");
    expect(previewCaption(preview({ eventCount: 1 }))).not.toContain("1 events");
  });

  it("survives an unparseable date", () => {
    expect(() => previewCaption(preview({ targetDate: "nonsense" }))).not.toThrow();
  });
});

describe("renderPreview", () => {
  it("lists each event with its local time", () => {
    const html = renderPreview(preview());
    expect(html).toContain("7:00 AM");
    expect(html).toContain("Standup");
    expect(html).toContain("8:00 PM");
    expect(html).toContain("Late dinner");
  });

  it("says free day when the calendar is empty", () => {
    const html = renderPreview(preview({ eventCount: 0, events: [] }));
    expect(html).toContain("free-day song");
    expect(html).not.toContain("<ul");
  });

  it("reports how many events were not shown", () => {
    const html = renderPreview(
      preview({ eventCount: 30, truncated: true, events: preview().events }),
    );
    expect(html).toContain("plus 28 more");
  });

  it("does not claim extras when nothing was truncated", () => {
    expect(renderPreview(preview())).not.toContain("plus");
  });

  it("escapes event titles", () => {
    const html = renderPreview(
      preview({
        eventCount: 1,
        events: [{ time: "9:00 AM", summary: "<img src=x onerror=alert(1)>", all_day: false }],
      }),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
