/* Web Audio playback: backing track loading/looping, volume, and
   SpeechSynthesis lyric delivery timed against the track. */

import { LOOP_START_SEC, trackUrl } from "./tracks";

/** Seconds of instrumental intro before the first lyric line (doc: 0:00–0:08). */
const INTRO_SEC = 8;

export class SongPlayer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private lyricTimers: number[] = [];
  private buffers = new Map<string, AudioBuffer>();
  /** Set only while a sung MP3 is playing; the Web Audio path uses `source`. */
  private element: HTMLAudioElement | null = null;
  playing = false;

  /** Must be called from a user gesture the first time (autoplay policy). */
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setVolume(volume: number): void {
    if (this.gain) this.gain.gain.value = Math.min(100, Math.max(0, volume)) / 100;
  }

  /** Fetch + decode a track; cached per session so the evening pre-load
      means no network at alarm time. */
  async loadTrack(trackId: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(trackId);
    if (cached) return cached;
    const ctx = this.ensureContext();
    const res = await fetch(trackUrl(trackId));
    if (!res.ok) throw new Error(`track fetch failed: HTTP ${res.status}`);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    this.buffers.set(trackId, buf);
    return buf;
  }

  /** Play a fully sung song (one MP3 from the server).
   *
   * Uses an <audio> element rather than the Web Audio path below because the
   * file is streamed from the network: <audio> starts on the first buffered
   * chunk and issues Range requests, where decodeAudioData needs the whole
   * file in memory first — a visible delay at exactly the wrong moment.
   *
   * Loops until dismissed. An alarm that plays once and gives up is not an
   * alarm, and this file has no separate outro region to loop like the
   * backing tracks do.
   *
   * Rejects if the audio can't play, so the caller can fall back to the v1
   * path; that rejection is the whole reason `songUrl` is optional. */
  async playSongFile(url: string, opts: { volume: number }): Promise<void> {
    this.stop();
    const el = new Audio();
    el.src = url;
    el.loop = true;
    el.volume = Math.min(100, Math.max(0, opts.volume)) / 100;
    this.element = el;
    this.playing = true;
    try {
      await el.play();
    } catch (err) {
      this.playing = false;
      this.element = null;
      throw err;
    }
  }

  /** Warm the browser cache for a finished song.
   *
   * Called when the song lands the evening before, so the morning's playback
   * comes off disk. Best-effort by design: a failure here costs a slower
   * start, not the alarm, and the response is `private, max-age=86400` so the
   * browser is allowed to keep it. */
  async preloadSongFile(url: string): Promise<void> {
    try {
      await fetch(url, { cache: "force-cache" });
    } catch {
      /* the alarm re-fetches, and falls back to TTS if that fails too */
    }
  }

  /** Play a song: backing track (looping its outro until stopped) with
      lyrics spoken over it after the intro. */
  async play(
    trackId: string,
    lyrics: string[],
    opts: { volume: number; ttsVoice: string; onLine?: (i: number) => void },
  ): Promise<void> {
    this.stop();
    const ctx = this.ensureContext();
    const buffer = await this.loadTrack(trackId);
    this.setVolume(opts.volume);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    // Loop the outro region so the alarm keeps playing until dismissed.
    source.loopStart = Math.min(LOOP_START_SEC, Math.max(0, buffer.duration - 1));
    source.loopEnd = buffer.duration;
    source.connect(this.gain!);
    source.start();
    this.source = source;
    this.playing = true;

    this.speakLyrics(lyrics, opts.ttsVoice, opts.onLine);
  }

  /** Speak lines sequentially, starting after the instrumental intro. */
  private speakLyrics(lyrics: string[], voiceName: string, onLine?: (i: number) => void): void {
    if (!("speechSynthesis" in window) || lyrics.length === 0) return;
    const voice = this.findVoice(voiceName);
    const startTimer = window.setTimeout(() => {
      let i = 0;
      const speakNext = () => {
        if (!this.playing || i >= lyrics.length) return;
        const u = new SpeechSynthesisUtterance(lyrics[i]);
        if (voice) u.voice = voice;
        u.rate = 0.95;
        if (onLine) onLine(i);
        u.onend = () => {
          i += 1;
          // A breath between lines keeps it song-like rather than a wall of TTS.
          const t = window.setTimeout(speakNext, 350);
          this.lyricTimers.push(t);
        };
        window.speechSynthesis.speak(u);
      };
      speakNext();
    }, INTRO_SEC * 1000);
    this.lyricTimers.push(startTimer);
  }

  private findVoice(name: string): SpeechSynthesisVoice | null {
    if (!name || !("speechSynthesis" in window)) return null;
    return window.speechSynthesis.getVoices().find((v) => v.name === name) ?? null;
  }

  stop(): void {
    this.playing = false;
    for (const t of this.lyricTimers) window.clearTimeout(t);
    this.lyricTimers = [];
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (this.element) {
      this.element.pause();
      // Drop the source too: pause() alone leaves the element streaming in
      // some browsers, and "I'm up" has to mean silence.
      this.element.removeAttribute("src");
      this.element.load();
      this.element = null;
    }
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* already stopped */
      }
      this.source.disconnect();
      this.source = null;
    }
  }
}

/** Voices for the settings dropdown (may be empty until voiceschanged fires). */
export function listVoices(): SpeechSynthesisVoice[] {
  if (!("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}
