import { describe, it, expect } from "vitest";
import {
  eventsOn,
  localDateString,
  moodForEvents,
  parseIcal,
  parseIcalDate,
  unfoldIcalLines,
  validateSongResponse,
  type CalendarEvent,
} from "../engine";

const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "SUMMARY:Standup",
  "DTSTART:20260730T090000",
  "DTEND:20260730T091500",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:Dentist\\, downtown",
  "DTSTART;TZID=America/Chicago:20260730T140000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:Company holiday",
  "DTSTART;VALUE=DATE:20260731",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

function ev(summary: string, iso = "2026-07-30T09:00:00"): CalendarEvent {
  return { summary, start: new Date(iso), end: null, allDay: false };
}

describe("unfoldIcalLines", () => {
  it("joins folded continuation lines", () => {
    const lines = unfoldIcalLines("SUMMARY:A very\r\n  long title\r\nDTSTART:20260730");
    expect(lines).toEqual(["SUMMARY:A very long title", "DTSTART:20260730"]);
  });

  it("handles bare-LF feeds", () => {
    expect(unfoldIcalLines("A:1\nB:2")).toEqual(["A:1", "B:2"]);
  });
});

describe("parseIcalDate", () => {
  it("parses date-only values as all-day", () => {
    const r = parseIcalDate("20260730");
    expect(r).not.toBeNull();
    expect(r!.dateOnly).toBe(true);
    expect(r!.date.getFullYear()).toBe(2026);
    expect(r!.date.getMonth()).toBe(6);
    expect(r!.date.getDate()).toBe(30);
  });

  it("parses UTC date-times", () => {
    const r = parseIcalDate("20260730T063000Z");
    expect(r!.dateOnly).toBe(false);
    expect(r!.date.toISOString()).toBe("2026-07-30T06:30:00.000Z");
  });

  it("parses floating date-times as local", () => {
    const r = parseIcalDate("20260730T063000");
    expect(r!.date.getHours()).toBe(6);
    expect(r!.date.getMinutes()).toBe(30);
  });

  it("rejects garbage", () => {
    expect(parseIcalDate("not-a-date")).toBeNull();
    expect(parseIcalDate("2026-07-30")).toBeNull();
  });
});

describe("parseIcal", () => {
  it("parses a valid feed", () => {
    const events = parseIcal(FEED);
    expect(events).toHaveLength(3);
    expect(events[0].summary).toBe("Standup");
    expect(events[0].end).not.toBeNull();
    expect(events[1].summary).toBe("Dentist, downtown"); // unescaped comma
    expect(events[2].allDay).toBe(true);
  });

  it("returns [] on an empty feed", () => {
    expect(parseIcal("BEGIN:VCALENDAR\r\nEND:VCALENDAR")).toEqual([]);
    expect(parseIcal("")).toEqual([]);
  });

  it("skips malformed events instead of throwing", () => {
    const bad = [
      "BEGIN:VEVENT",
      "SUMMARY:No start date",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:Good",
      "DTSTART:20260730T090000",
      "END:VEVENT",
    ].join("\r\n");
    const events = parseIcal(bad);
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe("Good");
  });
});

describe("eventsOn", () => {
  it("filters by local date and sorts by start", () => {
    const events = parseIcal(FEED);
    const day = eventsOn(events, "2026-07-30");
    expect(day).toHaveLength(2);
    expect(day[0].summary).toBe("Standup");
    const next = eventsOn(events, "2026-07-31");
    expect(next.map((e) => e.summary)).toEqual(["Company holiday"]);
  });
});

describe("localDateString", () => {
  it("formats with zero padding", () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("moodForEvents", () => {
  it("maps event density to mood", () => {
    expect(moodForEvents([])).toBe("warm");
    expect(moodForEvents([ev("A"), ev("B")])).toBe("cheerful");
    expect(moodForEvents([ev("A"), ev("B"), ev("C"), ev("D"), ev("E")])).toBe("energetic");
    expect(moodForEvents(Array.from({ length: 9 }, (_, i) => ev(`E${i}`)))).toBe("bold");
  });

  it("lets event keywords override density", () => {
    expect(moodForEvents([ev("Beach day")])).toBe("warm");
    expect(moodForEvents([ev("Final exam"), ev("B"), ev("C")])).toBe("bold");
  });

  it("honors an explicit genre preference", () => {
    expect(moodForEvents([ev("Beach day")], "playful")).toBe("playful");
    expect(moodForEvents([], "not-a-mood")).toBe("warm"); // invalid pref ignored
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
    cache_until: "2026-07-30T12:00:00Z",
  };

  it("accepts a valid payload", () => {
    const song = validateSongResponse(good);
    expect(song).not.toBeNull();
    expect(song!.trackId).toBe("cheerful-02");
    expect(song!.mood).toBe("cheerful");
    expect(song!.lyrics).toHaveLength(2);
  });

  it("rejects malformed payloads", () => {
    expect(validateSongResponse(null)).toBeNull();
    expect(validateSongResponse({ ...good, lyrics: [] })).toBeNull();
    expect(validateSongResponse({ ...good, lyrics: [42] })).toBeNull();
    expect(validateSongResponse({ ...good, mood: "angry" })).toBeNull();
    expect(validateSongResponse({ ...good, track_id: "../../etc/passwd" })).toBeNull();
    expect(validateSongResponse({ ...good, lyrics: Array(20).fill("line") })).toBeNull();
  });
});
