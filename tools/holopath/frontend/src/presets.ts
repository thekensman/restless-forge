/**
 * HoloGen — Hologram effect presets.
 *
 * Each preset defines a complete set of effect parameters that
 * produce a distinct holographic visual style. All values are
 * normalised to 0.0–1.0 unless otherwise noted.
 */

export interface HoloPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly scan_lines: number;  // 0–1
  readonly glow: number;        // 0–1
  readonly flicker: number;     // 0–1
  readonly glitch: number;      // 0–1
  readonly noise: number;       // 0–1
  readonly color_shift: number; // 0–1
  readonly edge_detect: number; // 0–1
  readonly brightness: number;  // 0.5–2.0 (output brightness multiplier)
  readonly hue: string;         // cyan | green | magenta | blue | rainbow
  readonly grid: boolean;
  readonly chromatic_aberration: boolean;
  readonly wobble: boolean;
}

export const PRESETS: Record<string, HoloPreset> = {
  classic: {
    id: "classic",
    name: "Classic",
    description: "Clean cyan hologram with subtle scan lines and glow",
    scan_lines: 0.6, glow: 0.7, flicker: 0.4, glitch: 0.3,
    noise: 0.25, color_shift: 0.5, edge_detect: 0.0, brightness: 1.2,
    hue: "cyan", grid: true, chromatic_aberration: true, wobble: true,
  },
  cyberpunk: {
    id: "cyberpunk",
    name: "Cyberpunk",
    description: "High-intensity magenta with heavy glitch and aberration",
    scan_lines: 0.8, glow: 0.9, flicker: 0.6, glitch: 0.7,
    noise: 0.4, color_shift: 0.8, edge_detect: 0.1, brightness: 1.3,
    hue: "magenta", grid: true, chromatic_aberration: true, wobble: true,
  },
  ghost: {
    id: "ghost",
    name: "Ghost",
    description: "Ethereal blue phantom with edge detection and heavy flicker",
    scan_lines: 0.3, glow: 0.5, flicker: 0.7, glitch: 0.1,
    noise: 0.5, color_shift: 0.3, edge_detect: 0.4, brightness: 1.15,
    hue: "blue", grid: false, chromatic_aberration: false, wobble: true,
  },
  glitch: {
    id: "glitch",
    name: "Glitch",
    description: "Maximum digital corruption with rainbow color cycling",
    scan_lines: 0.5, glow: 0.6, flicker: 0.3, glitch: 0.95,
    noise: 0.6, color_shift: 0.9, edge_detect: 0.0, brightness: 1.25,
    hue: "rainbow", grid: true, chromatic_aberration: true, wobble: false,
  },
  matrix: {
    id: "matrix",
    name: "Matrix",
    description: "Green phosphor CRT aesthetic with sharp scan lines",
    scan_lines: 0.7, glow: 0.8, flicker: 0.2, glitch: 0.15,
    noise: 0.3, color_shift: 0.4, edge_detect: 0.2, brightness: 1.2,
    hue: "green", grid: true, chromatic_aberration: false, wobble: false,
  },
};

export const PRESET_ORDER = ["classic", "cyberpunk", "ghost", "glitch", "matrix"] as const;
