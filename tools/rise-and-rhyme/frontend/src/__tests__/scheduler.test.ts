import { describe, it, expect } from "vitest";
import {
  isDue,
  lastAlarm,
  lastGeneration,
  nextAlarm,
  nextGeneration,
  occurrenceKey,
  parseHm,
  snoozeUntil,
} from "../scheduler";

// Wed Jul 29 2026, 21:00 local
const WED_EVENING = new Date(2026, 6, 29, 21, 0, 0);
// Thu Jul 30 2026, 05:00 local
const THU_EARLY = new Date(2026, 6, 30, 5, 0, 0);

const WEEKDAYS = { alarmTime: "06:30", alarmDays: [1, 2, 3, 4, 5], genTime: "22:00" };

describe("parseHm", () => {
  it("parses valid times", () => {
    expect(parseHm("06:30")).toEqual({ h: 6, m: 30 });
    expect(parseHm("23:59")).toEqual({ h: 23, m: 59 });
  });
  it("rejects invalid times", () => {
    expect(parseHm("24:00")).toBeNull();
    expect(parseHm("6.30")).toBeNull();
    expect(parseHm("")).toBeNull();
  });
});

describe("nextAlarm", () => {
  it("finds the next enabled day", () => {
    const t = nextAlarm(WED_EVENING, WEEKDAYS)!;
    expect(t.getDay()).toBe(4); // Thursday
    expect(t.getHours()).toBe(6);
    expect(t.getMinutes()).toBe(30);
    expect(t.getDate()).toBe(30);
  });

  it("fires later the same day when the time is still ahead", () => {
    expect(nextAlarm(THU_EARLY, WEEKDAYS)!.getDate()).toBe(30);
  });

  it("skips disabled days (Friday evening → Monday)", () => {
    const friEvening = new Date(2026, 6, 31, 20, 0, 0); // Fri Jul 31
    const t = nextAlarm(friEvening, WEEKDAYS)!;
    expect(t.getDay()).toBe(1); // Monday
    expect(t.getDate()).toBe(3); // Aug 3
  });

  it("returns null when no days are enabled or the time is invalid", () => {
    expect(nextAlarm(WED_EVENING, { ...WEEKDAYS, alarmDays: [] })).toBeNull();
    expect(nextAlarm(WED_EVENING, { ...WEEKDAYS, alarmTime: "26:00" })).toBeNull();
  });
});

describe("lastAlarm", () => {
  it("finds an alarm the tab slept through, however late the tick is", () => {
    // Backgrounded tabs get throttled to ~1 tick/minute, so the check must
    // not depend on catching the moment within a narrow window.
    const late = new Date(2026, 6, 30, 6, 55, 0); // 25 min after a 06:30 alarm
    const t = lastAlarm(late, WEEKDAYS)!;
    expect(t.getDate()).toBe(30);
    expect(t.getHours()).toBe(6);
    expect(isDue(t, late)).toBe(true);
  });

  it("stops being due once past the grace window", () => {
    const veryLate = new Date(2026, 6, 30, 7, 30, 0); // 60 min after
    const t = lastAlarm(veryLate, WEEKDAYS)!;
    expect(isDue(t, veryLate)).toBe(false);
  });

  it("looks back to the previous enabled day", () => {
    const satMorning = new Date(2026, 7, 1, 9, 0, 0); // Sat Aug 1
    const t = lastAlarm(satMorning, WEEKDAYS)!;
    expect(t.getDay()).toBe(5); // Friday's alarm
  });

  it("returns null when no days are enabled", () => {
    expect(lastAlarm(THU_EARLY, { ...WEEKDAYS, alarmDays: [] })).toBeNull();
  });
});

describe("snoozeUntil", () => {
  it("adds the snooze minutes", () => {
    expect(snoozeUntil(THU_EARLY, 9).getTime() - THU_EARLY.getTime()).toBe(9 * 60_000);
  });
  it("floors at one minute", () => {
    expect(snoozeUntil(THU_EARLY, 0).getTime() - THU_EARLY.getTime()).toBe(60_000);
  });
});

describe("nextGeneration", () => {
  it("generates the evening before an alarm day", () => {
    const slot = nextGeneration(WED_EVENING, WEEKDAYS)!;
    expect(slot.fireAt.getDate()).toBe(29); // Wed 22:00
    expect(slot.fireAt.getHours()).toBe(22);
    expect(slot.targetDate).toBe("2026-07-30"); // Thursday's song
  });

  it("skips evenings before disabled days (Fri evening covers Monday)", () => {
    const friEvening = new Date(2026, 6, 31, 20, 0, 0);
    const slot = nextGeneration(friEvening, WEEKDAYS)!;
    expect(slot.fireAt.getDay()).toBe(0); // Sunday evening
    expect(slot.targetDate).toBe("2026-08-03");
  });

  it("returns null without alarm days", () => {
    expect(nextGeneration(WED_EVENING, { ...WEEKDAYS, alarmDays: [] })).toBeNull();
  });
});

describe("lastGeneration", () => {
  it("finds a generation slot the tab slept through", () => {
    const late = new Date(2026, 6, 29, 22, 25, 0); // 25 min after 22:00
    const slot = lastGeneration(late, WEEKDAYS)!;
    expect(slot.targetDate).toBe("2026-07-30");
    expect(isDue(slot.fireAt, late)).toBe(true);
  });

  it("is no longer due long after the slot", () => {
    const nextMorning = new Date(2026, 6, 30, 5, 0, 0);
    const slot = lastGeneration(nextMorning, WEEKDAYS)!;
    expect(isDue(slot.fireAt, nextMorning)).toBe(false);
  });
});

describe("isDue", () => {
  const t = new Date(2026, 6, 30, 6, 30, 0);
  it("is due at and shortly after the target", () => {
    expect(isDue(t, t)).toBe(true);
    expect(isDue(t, new Date(t.getTime() + 5 * 60_000))).toBe(true);
  });
  it("is not due before the target or past the grace window", () => {
    expect(isDue(t, new Date(t.getTime() - 1000))).toBe(false);
    expect(isDue(t, new Date(t.getTime() + 31 * 60_000))).toBe(false);
  });
});

describe("occurrenceKey", () => {
  it("is stable for one occurrence and distinct across days", () => {
    const a = new Date(2026, 6, 30, 6, 30);
    expect(occurrenceKey(a)).toBe(occurrenceKey(new Date(2026, 6, 30, 6, 30)));
    expect(occurrenceKey(a)).not.toBe(occurrenceKey(new Date(2026, 6, 31, 6, 30)));
  });
});
