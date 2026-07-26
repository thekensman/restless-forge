/* UI controller: setup form, preview, scheduling loop, and the alarm screen.
   v1 requires the tab to stay open overnight (documented in the UI). */

import { generateSong } from "./api";
import { moodForEvents, type Song } from "./engine";
import { SongPlayer, listVoices } from "./audio";
import { FALLBACK_JINGLE_ID } from "./tracks";
import {
  isDue,
  nextAlarm,
  nextGeneration,
  snoozeUntil,
  type GenerationSlot,
} from "./scheduler";
import {
  DEFAULT_PREFS,
  loadCachedSong,
  loadPrefs,
  saveCachedSong,
  savePrefs,
  type CachedSong,
  type RiseAndRhymePrefs,
} from "./storage";

const TICK_MS = 20_000;

const player = new SongPlayer();
let prefs: RiseAndRhymePrefs = loadPrefs();
let snoozedUntil: Date | null = null;
let firedAlarmFor: string | null = null; // alarm day already fired
let requestedGenFor: string | null = null; // targetDate already requested this session
let wakeLock: { release(): Promise<void> } | null = null;

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

function input(id: string): HTMLInputElement {
  return $(id) as HTMLInputElement;
}

// ── Form ↔ prefs ──

function fillForm(): void {
  input("rar-ical").value = prefs.icalUrl;
  input("rar-alarm-time").value = prefs.alarmTime;
  input("rar-gen-time").value = prefs.genTime;
  input("rar-volume").value = String(prefs.volume);
  input("rar-snooze").value = String(prefs.snoozeMinutes);
  input("rar-enabled").checked = prefs.enabled;
  (document.getElementById("rar-genre") as HTMLSelectElement).value = prefs.preferredGenre;
  document.querySelectorAll<HTMLInputElement>("#rar-days input").forEach((cb) => {
    cb.checked = prefs.alarmDays.includes(Number(cb.value));
  });
  populateVoices();
}

function populateVoices(): void {
  const sel = document.getElementById("rar-voice") as HTMLSelectElement;
  const voices = listVoices();
  sel.innerHTML =
    '<option value="">Browser default</option>' +
    voices
      .map((v) => `<option value="${v.name.replace(/"/g, "&quot;")}">${v.name} (${v.lang})</option>`)
      .join("");
  sel.value = prefs.ttsVoice;
  if (sel.value !== prefs.ttsVoice) sel.value = "";
}

function readForm(): RiseAndRhymePrefs {
  const days: number[] = [];
  document.querySelectorAll<HTMLInputElement>("#rar-days input").forEach((cb) => {
    if (cb.checked) days.push(Number(cb.value));
  });
  return {
    icalUrl: input("rar-ical").value.trim(),
    alarmTime: input("rar-alarm-time").value || DEFAULT_PREFS.alarmTime,
    alarmDays: days,
    genTime: input("rar-gen-time").value || DEFAULT_PREFS.genTime,
    preferredGenre: (document.getElementById("rar-genre") as HTMLSelectElement).value,
    volume: Number(input("rar-volume").value) || DEFAULT_PREFS.volume,
    snoozeMinutes: Number(input("rar-snooze").value) || DEFAULT_PREFS.snoozeMinutes,
    ttsVoice: (document.getElementById("rar-voice") as HTMLSelectElement).value,
    enabled: input("rar-enabled").checked,
  };
}

function onSave(): void {
  prefs = readForm();
  savePrefs(prefs);
  firedAlarmFor = null;
  setStatus("Saved.");
  renderSchedule();
}

// ── Status / schedule display ──

function setStatus(text: string, isError = false): void {
  const el = $("rar-status");
  el.textContent = text;
  el.classList.toggle("status--error", isError);
}

function renderSchedule(): void {
  const el = $("rar-schedule");
  if (!prefs.enabled) {
    el.textContent = "Alarm is off.";
    return;
  }
  const now = new Date();
  const alarm = nextAlarm(now, prefs);
  const gen = nextGeneration(now, prefs);
  const song = loadCachedSong(now);
  const parts: string[] = [];
  if (alarm) parts.push(`Next alarm: ${alarm.toLocaleString()}`);
  if (gen) parts.push(`Song generates: ${gen.fireAt.toLocaleString()}`);
  parts.push(song ? `Song ready for ${song.targetDate} (${song.mood}).` : "No song cached yet.");
  parts.push("Keep this tab open overnight — v1 has no background service.");
  el.textContent = parts.join(" · ");
}

// ── Generation ──

async function generateFor(slot: GenerationSlot, manual: boolean): Promise<CachedSong | null> {
  if (!prefs.icalUrl) {
    setStatus("Add your Google Calendar iCal URL first.", true);
    return null;
  }
  setStatus(manual ? "Writing your song…" : "Generating tonight's song…");
  const result = await generateSong(prefs.icalUrl, slot.targetDate, prefs.preferredGenre);
  if (result.status === "ok") {
    const cached: CachedSong = { ...result.song, targetDate: slot.targetDate };
    saveCachedSong(cached);
    setStatus(`Song ready — mood: ${result.song.mood}.`);
    renderSchedule();
    return cached;
  }
  setStatus(result.message, result.status === "error");
  renderSchedule();
  return null;
}

/** Fallback when generation failed: jingle + a plain-spoken line. */
function fallbackSong(targetDate: string): CachedSong {
  return {
    lyrics: ["Good morning! Your song didn't generate, but it's time to get up. Check your calendar for today's plan."],
    trackId: FALLBACK_JINGLE_ID,
    mood: moodForEvents([]),
    eventCount: 0,
    generatedAt: new Date().toISOString(),
    cacheUntil: "",
    targetDate,
  };
}

// ── Playback ──

async function playSong(song: CachedSong | Song): Promise<void> {
  showAlarmScreen(song.lyrics);
  await requestWakeLock();
  try {
    await player.play(song.trackId, song.lyrics, {
      volume: prefs.volume,
      ttsVoice: prefs.ttsVoice,
      onLine: highlightLine,
    });
  } catch {
    // Track failed to load — last resort: fallback jingle, then TTS-only.
    await player
      .play(FALLBACK_JINGLE_ID, song.lyrics, {
        volume: prefs.volume,
        ttsVoice: prefs.ttsVoice,
        onLine: highlightLine,
      })
      .catch(() => setStatus("Audio playback failed.", true));
  }
}

function showAlarmScreen(lyrics: string[]): void {
  $("rar-lyrics").innerHTML = lyrics
    .map((l, i) => `<p class="alarm__line" data-line="${i}">${escapeHtml(l)}</p>`)
    .join("");
  $("rar-alarm").hidden = false;
}

function highlightLine(i: number): void {
  document.querySelectorAll(".alarm__line").forEach((el) => {
    el.classList.toggle("alarm__line--active", el.getAttribute("data-line") === String(i));
  });
}

function hideAlarmScreen(): void {
  $("rar-alarm").hidden = true;
  player.stop();
  void releaseWakeLock();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function requestWakeLock(): Promise<void> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: string): Promise<{ release(): Promise<void> }> };
    };
    if (nav.wakeLock) wakeLock = await nav.wakeLock.request("screen");
  } catch {
    /* not critical */
  }
}

async function releaseWakeLock(): Promise<void> {
  try {
    await wakeLock?.release();
  } catch {
    /* ignore */
  } finally {
    wakeLock = null;
  }
}

// ── Preview ──

async function onPreview(): Promise<void> {
  const now = new Date();
  const cached = loadCachedSong(now);
  if (cached) {
    await playSong(cached);
    return;
  }
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  const slot: GenerationSlot = {
    fireAt: now,
    targetDate: `${tomorrow.getFullYear()}-${p(tomorrow.getMonth() + 1)}-${p(tomorrow.getDate())}`,
  };
  const song = await generateFor(slot, true);
  await playSong(song ?? fallbackSong(slot.targetDate));
}

// ── Scheduling loop ──

async function tick(): Promise<void> {
  if (!prefs.enabled) return;
  const now = new Date();

  // Snooze re-fire
  if (snoozedUntil && now.getTime() >= snoozedUntil.getTime()) {
    snoozedUntil = null;
    const song = loadCachedSong(now);
    await playSong(song ?? fallbackSong("snooze"));
    return;
  }

  // Evening generation: look back slightly so a slot that just passed is seen.
  const lookback = new Date(now.getTime() - TICK_MS * 2);
  const gen = nextGeneration(lookback, prefs);
  if (gen && isDue(gen.fireAt, now) && requestedGenFor !== gen.targetDate) {
    requestedGenFor = gen.targetDate;
    await generateFor(gen, false);
  }

  // Alarm firing
  const alarm = nextAlarm(lookback, prefs);
  if (alarm && isDue(alarm, now)) {
    const dateKey = alarm.toDateString();
    if (firedAlarmFor !== dateKey && $("rar-alarm").hidden) {
      firedAlarmFor = dateKey;
      const song = loadCachedSong(now);
      await playSong(song ?? fallbackSong(dateKey));
    }
  }
}

// ── Wire-up ──

function init(): void {
  fillForm();
  renderSchedule();

  $("rar-save").addEventListener("click", onSave);
  $("rar-preview").addEventListener("click", () => void onPreview());
  $("rar-stop").addEventListener("click", () => {
    snoozedUntil = null;
    hideAlarmScreen();
    renderSchedule();
  });
  $("rar-snooze-btn").addEventListener("click", () => {
    snoozedUntil = snoozeUntil(new Date(), prefs.snoozeMinutes);
    hideAlarmScreen();
    setStatus(`Snoozed until ${snoozedUntil.toLocaleTimeString()}.`);
  });

  if ("speechSynthesis" in window) {
    window.speechSynthesis.addEventListener("voiceschanged", populateVoices);
  }

  window.setInterval(() => void tick(), TICK_MS);
}

document.addEventListener("DOMContentLoaded", init);
