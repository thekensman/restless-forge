/* Pure alarm/generation time math. app.ts owns the actual timers.

   The firing check deliberately looks BACKWARD for the most recent occurrence
   rather than forward from a narrow window. An earlier version searched from
   `now - 2 * tickInterval` (40 s), which was shorter than the interval a
   backgrounded tab actually gets — browsers throttle timers to roughly once a
   minute — so the alarm could be stepped over entirely in exactly the setup
   this tool asks for (tab left open overnight). Pairing lastOccurrence() with
   the persisted "already fired" marker in storage.ts makes a late tick still
   fire, and fire only once. */

import { localDateString } from "./engine";

export interface SchedulePrefs {
  alarmTime: string; // "06:30"
  alarmDays: number[]; // 0=Sun … 6=Sat
  genTime: string; // "22:00" — evening before the alarm
}

export function parseHm(hm: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return { h, m: mi };
}

function atTime(day: Date, hm: { h: number; m: number }): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hm.h, hm.m, 0, 0);
}

function dayOffset(from: Date, offset: number): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
}

/** The next alarm firing strictly after `now`, or null when no days are enabled. */
export function nextAlarm(now: Date, prefs: SchedulePrefs): Date | null {
  const hm = parseHm(prefs.alarmTime);
  if (!hm || prefs.alarmDays.length === 0) return null;
  for (let offset = 0; offset < 8; offset++) {
    const day = dayOffset(now, offset);
    if (!prefs.alarmDays.includes(day.getDay())) continue;
    const t = atTime(day, hm);
    if (t.getTime() > now.getTime()) return t;
  }
  return null;
}

/** The most recent alarm at or before `now`, however long ago it was. */
export function lastAlarm(now: Date, prefs: SchedulePrefs): Date | null {
  const hm = parseHm(prefs.alarmTime);
  if (!hm || prefs.alarmDays.length === 0) return null;
  for (let offset = 0; offset < 8; offset++) {
    const day = dayOffset(now, -offset);
    if (!prefs.alarmDays.includes(day.getDay())) continue;
    const t = atTime(day, hm);
    if (t.getTime() <= now.getTime()) return t;
  }
  return null;
}

/** Snooze target: now + n minutes. */
export function snoozeUntil(now: Date, snoozeMinutes: number): Date {
  return new Date(now.getTime() + Math.max(1, snoozeMinutes) * 60_000);
}

export interface GenerationSlot {
  /** When the browser should call the backend. */
  fireAt: Date;
  /** The alarm day the song is for ("YYYY-MM-DD"). */
  targetDate: string;
}

/** The next evening-before generation slot strictly after `now`.
    Generation on day D covers an alarm on day D+1. */
export function nextGeneration(now: Date, prefs: SchedulePrefs): GenerationSlot | null {
  const hm = parseHm(prefs.genTime);
  if (!hm || prefs.alarmDays.length === 0 || !parseHm(prefs.alarmTime)) return null;
  for (let offset = 0; offset < 8; offset++) {
    const day = dayOffset(now, offset);
    const next = dayOffset(day, 1);
    if (!prefs.alarmDays.includes(next.getDay())) continue;
    const t = atTime(day, hm);
    if (t.getTime() > now.getTime()) {
      return { fireAt: t, targetDate: localDateString(next) };
    }
  }
  return null;
}

/** The most recent generation slot at or before `now`. */
export function lastGeneration(now: Date, prefs: SchedulePrefs): GenerationSlot | null {
  const hm = parseHm(prefs.genTime);
  if (!hm || prefs.alarmDays.length === 0 || !parseHm(prefs.alarmTime)) return null;
  for (let offset = 0; offset < 8; offset++) {
    const day = dayOffset(now, -offset);
    const next = dayOffset(day, 1);
    if (!prefs.alarmDays.includes(next.getDay())) continue;
    const t = atTime(day, hm);
    if (t.getTime() <= now.getTime()) {
      return { fireAt: t, targetDate: localDateString(next) };
    }
  }
  return null;
}

/** The local day the next song covers: the day the next alarm actually rings.

    This is deliberately NOT nextGeneration().targetDate. A generation slot is
    "the next time we call the backend", which rolls to tomorrow night's slot
    the moment tonight's genTime passes — so asking it at 22:19 with a 22:00
    genTime named the day AFTER tomorrow, and the preview showed a day that was
    off by two. The alarm is the thing the song is for, so ask about the alarm:
    correct before genTime, after genTime, and at 3am (when the song being
    written is for later *today*, not tomorrow). */
export function songDateFor(now: Date, prefs: SchedulePrefs): string {
  const alarm = nextAlarm(now, prefs);
  if (alarm) return localDateString(alarm);
  // No alarm days enabled (or an unparseable time): fall back to tomorrow so
  // the preview still has something sensible to read.
  return localDateString(dayOffset(now, 1));
}

/** True when `t` is due at `now`, within a grace window so a tab that was
    throttled or suspended still acts on an occurrence it slept through. */
export function isDue(t: Date, now: Date, graceMinutes = 30): boolean {
  const delta = now.getTime() - t.getTime();
  return delta >= 0 && delta <= graceMinutes * 60_000;
}

/** Stable identifier for one alarm occurrence, used as the fired-marker key. */
export function occurrenceKey(t: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${localDateString(t)}T${p(t.getHours())}:${p(t.getMinutes())}`;
}
