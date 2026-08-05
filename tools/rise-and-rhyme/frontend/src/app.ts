/* UI controller: setup form, preview, scheduling loop, and the alarm screen.
   v1 requires the tab to stay open overnight (documented in the UI). */

import { fetchSongStatus, generateSong, previewCalendar } from "./api";
import { localDateString, localTimeZone, type Song } from "./engine";
import { SongPlayer, listVoices } from "./audio";
import { renderPreview } from "./preview";
import { FALLBACK_JINGLE_ID, FALLBACK_MOOD } from "./tracks";
import {
  isDue,
  lastAlarm,
  lastGeneration,
  nextAlarm,
  nextGeneration,
  occurrenceKey,
  snoozeUntil,
  songDateFor,
  type GenerationSlot,
} from "./scheduler";
import {
  DEFAULT_PREFS,
  loadCachedSong,
  loadPrefs,
  markFired,
  saveCachedSong,
  savePrefs,
  wasFired,
  type CachedSong,
  type RiseAndRhymePrefs,
} from "./storage";

const TICK_MS = 20_000;

/** Client-side ceiling on waiting for a sung song. Slightly beyond the
    server's own timeout so the server is normally the one to call it, and
    this only catches a job the server stopped answering about. */
const MAX_POLL_MS = 360_000;

const player = new SongPlayer();
let prefs: RiseAndRhymePrefs = loadPrefs();
let snoozedUntil: Date | null = null;
let wakeLock: { release(): Promise<void> } | null = null;
let pollTimer: number | null = null;

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
  if (!song) {
    parts.push("No song cached yet.");
  } else if (song.songUrl) {
    parts.push(`Sung song ready for ${song.targetDate} (${song.mood}).`);
  } else if (song.songJobId) {
    parts.push(`Lyrics ready for ${song.targetDate} — song still recording.`);
  } else if (song.songFailed) {
    parts.push(`Lyrics ready for ${song.targetDate} (${song.mood}) — spoken, not sung.`);
  } else {
    parts.push(`Song ready for ${song.targetDate} (${song.mood}).`);
  }
  parts.push("Keep this tab open overnight — there's no background service.");
  el.textContent = parts.join(" · ");
}

// ── Generation ──

async function generateFor(slot: GenerationSlot, manual: boolean): Promise<CachedSong | null> {
  if (!prefs.icalUrl) {
    setStatus("Add your Google Calendar iCal URL first.", true);
    return null;
  }
  setStatus(manual ? "Writing your song…" : "Generating tonight's song…");
  const result = await generateSong(
    prefs.icalUrl,
    slot.targetDate,
    prefs.preferredGenre,
    localTimeZone(),
  );

  if (result.status === "ok" || result.status === "pending") {
    // The lyrics are usable on their own, so they are saved BEFORE the sung
    // song is waited on. Every later failure then degrades to a working alarm
    // instead of no alarm.
    const cached: CachedSong = { ...result.song, targetDate: slot.targetDate };
    if (result.status === "pending") cached.songJobId = result.jobId;
    if (result.status === "ok" && result.songMessage) cached.songFailed = result.songMessage;
    saveCachedSong(cached);

    if (result.status === "pending") {
      setStatus(`Lyrics ready — recording the song (mood: ${result.song.mood}).`);
      startPolling(result.jobId, result.estimatedSeconds, result.pollAfter);
    } else if (result.songMessage) {
      // A sung song was expected and isn't coming. Say so plainly rather than
      // handing over a quieter product with no explanation.
      setStatus(result.songMessage);
    } else {
      setStatus(`Song ready — mood: ${result.song.mood}.`);
    }
    renderSchedule();
    return cached;
  }

  setStatus(result.message, result.status === "error");
  renderSchedule();
  return null;
}

// ── Sung-song polling ──
// The GPU takes tens of seconds, so the page never waits on it: generation
// returns as soon as the lyrics exist and the audio is collected in the
// background. The tab stays fully interactive throughout.

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function startPolling(jobId: string, estimatedSeconds: number, pollAfter: number): void {
  stopPolling();
  const started = Date.now();
  showProgress(0, estimatedSeconds);

  const step = async (): Promise<void> => {
    pollTimer = null;
    const result = await fetchSongStatus(jobId);

    if (result.status === "ready") {
      onSongReady(jobId, result.songUrl);
      return;
    }
    if (result.status === "failed") {
      onSongFailed(jobId, result.message);
      return;
    }
    // The server's own elapsed count is authoritative — it survives a reload
    // that resumed polling, where the local clock only knows about this run.
    const elapsed = result.elapsedSeconds || Math.round((Date.now() - started) / 1000);
    if (Date.now() - started > MAX_POLL_MS) {
      onSongFailed(jobId, "The song took too long, so your alarm will read the lyrics instead.");
      return;
    }
    showProgress(elapsed, estimatedSeconds);
    pollTimer = window.setTimeout(() => void step(), result.pollAfter * 1000);
  };

  pollTimer = window.setTimeout(() => void step(), pollAfter * 1000);
}

function onSongReady(jobId: string, songUrl: string): void {
  hideProgress();
  const cached = loadCachedSong(new Date());
  // Ignore a result for a song that has since been replaced or expired.
  if (!cached || cached.songJobId !== jobId) return;
  cached.songUrl = songUrl;
  delete cached.songJobId;
  delete cached.songFailed;
  saveCachedSong(cached);
  // Pull the audio into the browser cache now, while there is certainly a
  // network, so the morning's playback doesn't depend on one.
  void player.preloadSongFile(songUrl);
  setStatus("Your song is recorded and ready.");
  renderSchedule();
}

function onSongFailed(jobId: string, message: string): void {
  hideProgress();
  const cached = loadCachedSong(new Date());
  if (cached && cached.songJobId === jobId) {
    delete cached.songJobId;
    cached.songFailed = message;
    saveCachedSong(cached);
  }
  // Not flagged as an error: the alarm still works, it just sounds like v1.
  setStatus(`${message} Your lyrics are saved and the alarm will still ring.`);
  renderSchedule();
}

/** Resume a song left rendering by an earlier page load.
    Generation runs at ~22:00 unattended, so the tab that started a job is
    very often not the tab that has to finish it. */
function resumePollingIfNeeded(): void {
  const cached = loadCachedSong(new Date());
  if (cached?.songJobId && !cached.songUrl && pollTimer === null) {
    startPolling(cached.songJobId, 75, 5);
  }
}

// ── Progress display ──

function showProgress(elapsedSeconds: number, estimatedSeconds: number): void {
  const box = $("rar-progress");
  box.hidden = false;
  const remaining = Math.max(0, estimatedSeconds - elapsedSeconds);
  // Past the estimate, stop pretending to know: a cold GPU worker legitimately
  // takes several times a warm one, and a countdown stuck at "0s left" reads
  // as a hang.
  const hint =
    remaining > 0 ? `about ${remaining}s left` : "taking longer than usual — still working";
  $("rar-progress-text").textContent = `Recording your song — ${hint} (${elapsedSeconds}s elapsed)`;
}

function hideProgress(): void {
  $("rar-progress").hidden = true;
}

/** Fallback when generation failed: jingle + a plain-spoken line. */
function fallbackSong(targetDate: string): CachedSong {
  return {
    lyrics: ["Good morning! Your song didn't generate, but it's time to get up. Check your calendar for today's plan."],
    trackId: FALLBACK_JINGLE_ID,
    mood: FALLBACK_MOOD,
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

  // A real sung song when one exists, the v1 backing-track-plus-speech path
  // when it doesn't. The lyrics on screen are the same either way, so a
  // fallback still tells you what your day holds.
  const songUrl = "songUrl" in song ? song.songUrl : undefined;
  if (songUrl) {
    try {
      await player.playSongFile(songUrl, { volume: prefs.volume });
      return;
    } catch {
      // Expired, offline, or blocked by autoplay policy. Fall through rather
      // than leave someone in silence, and say why the alarm sounds different.
      setStatus("Couldn't play the recorded song — reading your lyrics instead.");
    }
  }

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

// ── Calendar check ──
// Reads the calendar without writing a song, so someone can confirm the URL
// works and — crucially — that the detected timezone is right, before
// spending their one generation for the day.

async function onCheckCalendar(): Promise<void> {
  const current = readForm();
  if (!current.icalUrl) {
    setStatus("Add your Google Calendar iCal URL first.", true);
    return;
  }
  const box = $("rar-preview");
  box.hidden = false;
  box.textContent = "Reading your calendar…";
  setStatus("");

  const result = await previewCalendar(
    current.icalUrl,
    songDateFor(new Date(), prefs),
    current.preferredGenre,
    localTimeZone(),
  );
  if (result.status === "ok") {
    box.innerHTML = renderPreview(result.preview);
  } else {
    box.textContent = "";
    box.hidden = true;
    setStatus(result.message, true);
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
  // Same day the calendar check reports, so "Check my calendar" and the song
  // it writes can never describe two different days.
  const slot: GenerationSlot = { fireAt: now, targetDate: songDateFor(now, prefs) };
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

  // Evening generation. Looking BACKWARD at the most recent slot (rather than
  // forward from a narrow window) means a tab that was throttled or asleep at
  // 22:00 still generates when it wakes, instead of silently skipping the night.
  const gen = lastGeneration(now, prefs);
  if (gen && isDue(gen.fireAt, now) && !wasFired("generation", gen.targetDate)) {
    markFired("generation", gen.targetDate);
    await generateFor(gen, false);
  }

  // A throttled or suspended tab can lose its poll timer without losing the
  // job. Re-arming here means the song is still collected, just later.
  resumePollingIfNeeded();

  // Alarm firing. The marker is persisted, so a reload can't re-fire an alarm
  // that already went off, and a late tick still fires one that was missed.
  const alarm = lastAlarm(now, prefs);
  if (alarm && isDue(alarm, now)) {
    const key = occurrenceKey(alarm);
    if (!wasFired("alarm", key) && $("rar-alarm").hidden) {
      markFired("alarm", key);
      const song = loadCachedSong(now);
      await playSong(song ?? fallbackSong(localDateString(alarm)));
    }
  }
}

// ── Wire-up ──

function init(): void {
  // FIRST, before any DOM lookup. $() throws on a missing element, so a single
  // stale id used to abort the rest of init() — and the scheduling loop, being
  // last, was the first thing lost. An alarm that silently never rings is the
  // worst failure this tool has; starting the loop up front means a wiring bug
  // costs a button, not the alarm. (`prefs` is module-level, so tick() is
  // already safe to run.) The id contract itself is enforced by app.test.ts.
  window.setInterval(() => void tick(), TICK_MS);

  fillForm();
  renderSchedule();
  // A song left rendering by a previous page load has nobody else to collect
  // it — the tab that started the job is often not the tab that finishes it.
  resumePollingIfNeeded();

  $("rar-save").addEventListener("click", onSave);
  $("rar-check").addEventListener("click", () => void onCheckCalendar());
  $("rar-play").addEventListener("click", () => void onPreview());
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
}

document.addEventListener("DOMContentLoaded", init);
