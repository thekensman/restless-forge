/* Pure alarm/generation time math. app.ts owns the actual timers. */

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

/** The next alarm firing strictly after `now`, or null when no days are enabled. */
export function nextAlarm(now: Date, prefs: SchedulePrefs): Date | null {
  const hm = parseHm(prefs.alarmTime);
  if (!hm || prefs.alarmDays.length === 0) return null;
  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (!prefs.alarmDays.includes(day.getDay())) continue;
    const t = atTime(day, hm);
    if (t.getTime() > now.getTime()) return t;
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
    Generation on day D covers an alarm on day D+1 — unless the gen time
    itself is before the alarm time on the same day (night-shift setups),
    which we don't support in v1: gen is always the evening before. */
export function nextGeneration(now: Date, prefs: SchedulePrefs): GenerationSlot | null {
  const hm = parseHm(prefs.genTime);
  if (!hm || prefs.alarmDays.length === 0 || !parseHm(prefs.alarmTime)) return null;
  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    if (!prefs.alarmDays.includes(next.getDay())) continue;
    const t = atTime(day, hm);
    if (t.getTime() > now.getTime()) {
      return { fireAt: t, targetDate: localDateString(next) };
    }
  }
  return null;
}

/** True when `t` (an alarm/generation timestamp) is due at `now`, within a
    grace window so a sleeping tab that wakes late still fires. */
export function isDue(t: Date, now: Date, graceMinutes = 30): boolean {
  const delta = now.getTime() - t.getTime();
  return delta >= 0 && delta <= graceMinutes * 60_000;
}
