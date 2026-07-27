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
