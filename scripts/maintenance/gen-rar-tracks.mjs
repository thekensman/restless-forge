/**
 * gen-rar-tracks.mjs — PLACEHOLDER backing tracks for Rise & Rhyme.
 *
 * Synthesizes simple 50-second WAV loops (11.025 kHz mono 16-bit) for each
 * mood in the Rise & Rhyme track manifest, plus a 15-second fallback jingle,
 * into tools/rise-and-rhyme/frontend/public/tracks/.
 *
 * These are stand-ins so the full audio pipeline works end-to-end during
 * development. Before launch, replace them 1:1 with real produced tracks
 * (Suno/Udio, 60–75 s, -14 LUFS) using the SAME filenames; if the real
 * files are mp3s, flip TRACK_EXT in src/tracks.ts and delete the .wav files.
 * If ffmpeg is on PATH, this script converts its output to .mp3 itself.
 *
 * Usage: node scripts/maintenance/gen-rar-tracks.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "tools", "rise-and-rhyme", "frontend", "public", "tracks",
);

const SAMPLE_RATE = 11025;
const TRACK_SEC = 50; // loop region is 45 s → end (see src/tracks.ts LOOP_START_SEC)
const JINGLE_SEC = 15;

// Per-mood synthesis recipes: tempo, key root (Hz), lead waveform, chord
// progression (semitone offsets from the key), and rhythmic character.
const MOODS = {
  "energetic-01": { bpm: 125, root: 220.0, wave: "saw", prog: [0, 9, 5, 7], fourOnFloor: true, arp: 2 },
  "energetic-02": { bpm: 128, root: 246.9, wave: "saw", prog: [0, 5, 9, 7], fourOnFloor: true, arp: 2 },
  "warm-01": { bpm: 104, root: 196.0, wave: "triangle", prog: [0, 5, 9, 7], fourOnFloor: false, arp: 1 },
  "warm-02": { bpm: 108, root: 174.6, wave: "triangle", prog: [0, 9, 5, 0], fourOnFloor: false, arp: 1 },
  "groovy-01": { bpm: 110, root: 174.6, wave: "square", prog: [0, 3, 5, 7], fourOnFloor: false, arp: 2, swing: true },
  "groovy-02": { bpm: 112, root: 164.8, wave: "square", prog: [0, 5, 3, 7], fourOnFloor: false, arp: 2, swing: true },
  "smooth-01": { bpm: 98, root: 185.0, wave: "sine", prog: [0, 4, 9, 2], fourOnFloor: false, arp: 1, swing: true },
  "smooth-02": { bpm: 102, root: 196.0, wave: "sine", prog: [0, 9, 2, 7], fourOnFloor: false, arp: 1, swing: true },
  "cheerful-01": { bpm: 118, root: 220.0, wave: "triangle", prog: [0, 5, 7, 5], fourOnFloor: true, arp: 2 },
  "cheerful-02": { bpm: 122, root: 233.1, wave: "triangle", prog: [0, 7, 9, 5], fourOnFloor: true, arp: 2 },
  "playful-01": { bpm: 135, root: 261.6, wave: "square", prog: [0, 5, 7, 12], fourOnFloor: true, arp: 4 },
  "playful-02": { bpm: 138, root: 293.7, wave: "square", prog: [0, 12, 5, 7], fourOnFloor: true, arp: 4 },
  "bold-01": { bpm: 114, root: 146.8, wave: "saw", prog: [0, 0, 5, 7], fourOnFloor: true, arp: 1 },
  "bold-02": { bpm: 116, root: 164.8, wave: "saw", prog: [0, 5, 0, 7], fourOnFloor: true, arp: 1 },
};

function osc(wave, phase) {
  const p = phase % 1;
  switch (wave) {
    case "sine": return Math.sin(2 * Math.PI * p);
    case "square": return p < 0.5 ? 0.6 : -0.6; // pre-tamed
    case "saw": return (2 * p - 1) * 0.7;
    case "triangle": return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
    default: return 0;
  }
}

const semitone = (root, n) => root * Math.pow(2, n / 12);

// Tiny deterministic noise for percussion (no Math.random → reproducible files).
function noise(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function synthesize(cfg, seconds) {
  const n = Math.floor(seconds * SAMPLE_RATE);
  const out = new Float64Array(n);
  const beat = 60 / cfg.bpm;
  const bar = beat * 4;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const barIdx = Math.floor(t / bar);
    const chordRoot = semitone(cfg.root, cfg.prog[barIdx % cfg.prog.length]);
    const tInBeat = (t % beat) / beat;
    const beatIdx = Math.floor(t / beat);
    let s = 0;

    // Bass: root an octave down, plucked on beats 1 & 3 (or every beat).
    const bassOn = cfg.fourOnFloor || beatIdx % 2 === 0;
    if (bassOn) s += 0.5 * Math.exp(-4 * tInBeat) * osc("sine", (chordRoot / 2) * t);

    // Chord pad: root + major third + fifth, sustained.
    for (const iv of [0, 4, 7]) {
      s += 0.10 * osc("triangle", semitone(chordRoot, iv) * t);
    }

    // Lead arpeggio through chord tones, `arp` notes per beat.
    const div = cfg.arp;
    const stepLen = beat / div;
    let step = Math.floor(t / stepLen);
    if (cfg.swing && div > 1) step = Math.floor((t + stepLen * 0.15 * (step % 2)) / stepLen);
    const arpTones = [0, 4, 7, 12];
    const tone = semitone(chordRoot, arpTones[step % arpTones.length]);
    const tInStep = (t % stepLen) / stepLen;
    s += 0.28 * Math.exp(-3 * tInStep) * osc(cfg.wave, tone * t);

    // Percussion: kick thump on beats (four-on-floor moods), hat on off-beats.
    if (cfg.fourOnFloor && tInBeat < 0.08) {
      s += 0.5 * Math.exp(-30 * tInBeat) * Math.sin(2 * Math.PI * 60 * tInBeat * (1 - tInBeat * 4));
    }
    const tInHalf = (t % (beat / 2)) / (beat / 2);
    if (tInHalf < 0.03 && Math.floor(t / (beat / 2)) % 2 === 1) {
      s += 0.12 * Math.exp(-80 * tInHalf) * noise(i);
    }

    // Gentle fade-in; no fade-out (the tail is the loop region).
    const fade = Math.min(1, t / 0.6);
    out[i] = s * fade;
  }

  // Normalize to 0.8 peak.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? 0.8 / peak : 1;
  for (let i = 0; i < n; i++) out[i] *= gain;
  return out;
}

function toWav(samples) {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits/sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  return buf;
}

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const ffmpeg = hasFfmpeg();

const jobs = Object.entries(MOODS).map(([id, cfg]) => [id, cfg, TRACK_SEC]);
jobs.push(["fallback-jingle", { bpm: 120, root: 261.6, wave: "triangle", prog: [0, 5, 7, 0], fourOnFloor: true, arp: 2 }, JINGLE_SEC]);

for (const [id, cfg, seconds] of jobs) {
  const wavPath = join(OUT_DIR, `${id}.wav`);
  writeFileSync(wavPath, toWav(synthesize(cfg, seconds)));
  if (ffmpeg) {
    const mp3Path = join(OUT_DIR, `${id}.mp3`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wavPath, "-b:a", "96k", mp3Path]);
    unlinkSync(wavPath);
    console.log(`wrote ${mp3Path}`);
  } else {
    console.log(`wrote ${wavPath}`);
  }
}

console.log(
  ffmpeg
    ? "\nDone (mp3). Ensure TRACK_EXT in src/tracks.ts is \".mp3\"."
    : "\nDone (wav — no ffmpeg found). TRACK_EXT in src/tracks.ts must stay \".wav\" until real mp3 tracks replace these.",
);
