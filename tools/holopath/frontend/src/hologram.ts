/**
 * HoloGen — Hologram rendering engine (client-side).
 *
 * Applies holographic visual effects to image frames using
 * Canvas ImageData pixel manipulation. All processing in-browser.
 *
 * Effects pipeline (matches server-side NumPy version):
 *   1. Wobble / float offset
 *   2. Convert to luminance
 *   3. Edge detection (Sobel-like)
 *   4. Hue colourisation
 *   5. Flicker modulation
 *   6. Colour shift (per-row variation)
 *   7. Glow (boost bright areas)
 *   8. Glitch (horizontal slice displacement)
 *   9. Scan lines
 *  10. Noise / static
 *  11. Chromatic aberration
 *  12. Grid overlay
 *  13. Scan beam + vignette
 */

import type { HoloPreset } from "./presets";

// ─── Hue colour table ───────────────────────────────

const HUE_COLORS: Record<string, [number, number, number]> = {
  cyan:    [0, 255, 242],
  green:   [57, 255, 20],
  magenta: [255, 0, 255],
  blue:    [30, 100, 255],
};

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r: number, g: number, b: number;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function getHueRgb(hue: string, t: number): [number, number, number] {
  if (hue in HUE_COLORS) return HUE_COLORS[hue];
  // Rainbow: cycle through hues
  const h = (t * 360) % 360;
  return hslToRgb(h, 1.0, 0.5);
}

// ─── Pseudo-random with seed for deterministic glitch ──

let _seed = 1;
function seedRandom(s: number): void { _seed = s; }
function pseudoRandom(): number {
  _seed = (_seed * 16807 + 0) % 2147483647;
  return (_seed - 1) / 2147483646;
}

// ─── Core frame renderer ────────────────────────────

/**
 * Apply hologram effects to a single frame.
 *
 * @param source - RGBA ImageData from canvas
 * @param frameIdx - Current frame index
 * @param totalFrames - Total number of frames
 * @param preset - Effect preset
 * @returns New ImageData with hologram effects applied (RGB, alpha=255)
 */
export function renderHoloFrame(
  source: ImageData,
  frameIdx: number,
  totalFrames: number,
  preset: HoloPreset,
): ImageData {
  const w = source.width;
  const h = source.height;
  const src = source.data;
  const t = frameIdx / Math.max(totalFrames, 1);

  seedRandom(frameIdx * 31337 + 7);

  // Work in float arrays for precision
  const imgR = new Float64Array(w * h);
  const imgG = new Float64Array(w * h);
  const imgB = new Float64Array(w * h);

  // Copy RGB from source
  for (let i = 0; i < w * h; i++) {
    imgR[i] = src[i * 4];
    imgG[i] = src[i * 4 + 1];
    imgB[i] = src[i * 4 + 2];
  }

  // ─── 1. Wobble offset ───
  if (preset.wobble) {
    const offX = Math.round(Math.sin(t * Math.PI * 4) * 3);
    const offY = Math.round(
      Math.cos(t * Math.PI * 2) * 2 + Math.sin(t * Math.PI * 6) * 1.5
    );
    const tmpR = new Float64Array(w * h);
    const tmpG = new Float64Array(w * h);
    const tmpB = new Float64Array(w * h);

    for (let y = 0; y < h; y++) {
      const sy = y - offY;
      if (sy < 0 || sy >= h) continue;
      for (let x = 0; x < w; x++) {
        const sx = x - offX;
        if (sx < 0 || sx >= w) continue;
        const di = y * w + x;
        const si = sy * w + sx;
        tmpR[di] = imgR[si];
        tmpG[di] = imgG[si];
        tmpB[di] = imgB[si];
      }
    }
    imgR.set(tmpR);
    imgG.set(tmpG);
    imgB.set(tmpB);
  }

  // ─── 2. Luminance ───
  const lum = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (imgR[i] * 0.299 + imgG[i] * 0.587 + imgB[i] * 0.114) / 255.0;
  }

  // ─── 3. Edge detection (Sobel-like) ───
  if (preset.edge_detect > 0) {
    const edge = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const edgeH = Math.abs(lum[idx] - (x > 0 ? lum[idx - 1] : lum[idx]));
        const edgeV = Math.abs(lum[idx] - (y > 0 ? lum[(y - 1) * w + x] : lum[idx]));
        edge[idx] = Math.min(edgeH + edgeV, 1);
      }
    }
    const ed = preset.edge_detect;
    for (let i = 0; i < w * h; i++) {
      lum[i] = lum[i] * (1 - ed) + edge[i] * ed;
    }
  }

  // ─── 4. Hue colour ───
  const hueRgb = getHueRgb(preset.hue, t);

  // ─── 5. Flicker modulation ───
  const flickerMod = 1.0 - preset.flicker * 0.3 * (
    Math.sin(t * Math.PI * 8 + pseudoRandom() * 0.5) * 0.5 + 0.5
  );

  // ─── 6. Colour shift + Colorise ───
  const resR = new Float64Array(w * h);
  const resG = new Float64Array(w * h);
  const resB = new Float64Array(w * h);

  const shiftMults = [50, 30, -40];
  for (let y = 0; y < h; y++) {
    const rowPhase = (y / h) * Math.PI * 2 * 0.01;
    const shiftVal = preset.color_shift * Math.sin(t * Math.PI * 2 + rowPhase) * 0.3;

    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const l = lum[idx];
      resR[idx] = l * (hueRgb[0] + shiftVal * shiftMults[0]) * flickerMod;
      resG[idx] = l * (hueRgb[1] + shiftVal * shiftMults[1]) * flickerMod;
      resB[idx] = l * (hueRgb[2] + shiftVal * shiftMults[2]) * flickerMod;
    }
  }

  // ─── 7. Glow (boost bright areas) ───
  if (preset.glow > 0) {
    for (let i = 0; i < w * h; i++) {
      const brightMask = Math.max(lum[i] - 0.5, 0) * 2 * preset.glow;
      resR[i] += brightMask * hueRgb[0] * 0.5;
      resG[i] += brightMask * hueRgb[1] * 0.5;
      resB[i] += brightMask * hueRgb[2] * 0.5;
    }
  }

  // ─── 8. Glitch (horizontal displacement) ───
  if (preset.glitch > 0) {
    for (let y = 0; y < h; y++) {
      if (pseudoRandom() < preset.glitch * 0.15) {
        const offset = Math.round((pseudoRandom() - 0.5) * w * preset.glitch * 0.3);
        if (offset !== 0) {
          const rowStart = y * w;
          // Roll row by offset (circular shift)
          const tmpRowR = new Float64Array(w);
          const tmpRowG = new Float64Array(w);
          const tmpRowB = new Float64Array(w);
          for (let x = 0; x < w; x++) {
            const nx = ((x - offset) % w + w) % w;
            tmpRowR[x] = resR[rowStart + nx];
            tmpRowG[x] = resG[rowStart + nx];
            tmpRowB[x] = resB[rowStart + nx];
          }
          for (let x = 0; x < w; x++) {
            resR[rowStart + x] = tmpRowR[x];
            resG[rowStart + x] = tmpRowG[x];
            resB[rowStart + x] = tmpRowB[x];
          }
        }
      }
    }
  }

  // ─── 9. Scan lines ───
  if (preset.scan_lines > 0) {
    const spacing = Math.max(1, Math.round(6 - preset.scan_lines * 4));
    const scroll = Math.round(t * h * 0.5);
    const mult = 1 - preset.scan_lines * 0.6;
    for (let y = 0; y < h; y++) {
      if ((y + scroll) % spacing === 0) {
        const rowStart = y * w;
        for (let x = 0; x < w; x++) {
          resR[rowStart + x] *= mult;
          resG[rowStart + x] *= mult;
          resB[rowStart + x] *= mult;
        }
      }
    }
  }

  // ─── 10. Noise ───
  if (preset.noise > 0) {
    const noiseAmt = preset.noise * 80;
    for (let i = 0; i < w * h; i++) {
      const n = (pseudoRandom() - 0.5) * noiseAmt;
      resR[i] += n;
      resG[i] += n;
      resB[i] += n;
    }
  }

  // ─── 11. Chromatic aberration ───
  if (preset.chromatic_aberration) {
    const ca = Math.round(2 + preset.glitch * 4);
    if (ca > 0) {
      for (let y = 0; y < h; y++) {
        const row = y * w;
        // Shift red left, blue right (circular roll)
        const origR = resR.slice(row, row + w);
        const origB = resB.slice(row, row + w);
        for (let x = 0; x < w; x++) {
          const rSrc = ((x + ca) % w + w) % w;
          const bSrc = ((x - ca) % w + w) % w;
          resR[row + x] = resR[row + x] * 0.6 + origR[rSrc] * 0.4;
          resB[row + x] = resB[row + x] * 0.6 + origB[bSrc] * 0.4;
        }
      }
    }
  }

  // ─── 12. Grid overlay ───
  if (preset.grid) {
    const gridSize = 20;
    const scrollY = Math.round(t * gridSize) % gridSize;
    const gR = hueRgb[0] * 0.06;
    const gG = hueRgb[1] * 0.06;
    const gB = hueRgb[2] * 0.06;

    for (let y = 0; y < h; y++) {
      if ((y + scrollY) % gridSize === 0) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          resR[row + x] = Math.min(resR[row + x] + gR, 255);
          resG[row + x] = Math.min(resG[row + x] + gG, 255);
          resB[row + x] = Math.min(resB[row + x] + gB, 255);
        }
      }
    }
    for (let x = 0; x < w; x += gridSize) {
      for (let y = 0; y < h; y++) {
        const idx = y * w + x;
        resR[idx] = Math.min(resR[idx] + gR, 255);
        resG[idx] = Math.min(resG[idx] + gG, 255);
        resB[idx] = Math.min(resB[idx] + gB, 255);
      }
    }
  }

  // ─── 13a. Scan beam ───
  const beamY = Math.round((t * h * 1.5) % (h + 60) - 30);
  for (let dy = -30; dy <= 30; dy++) {
    const y = beamY + dy;
    if (y >= 0 && y < h) {
      const intensity = (1 - Math.abs(dy) / 30) * 0.08 * preset.glow;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        resR[row + x] = Math.min(resR[row + x] + hueRgb[0] * intensity, 255);
        resG[row + x] = Math.min(resG[row + x] + hueRgb[1] * intensity, 255);
        resB[row + x] = Math.min(resB[row + x] + hueRgb[2] * intensity, 255);
      }
    }
  }

  // ─── 13b. Vignette ───
  const cy = h / 2, cx = w / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < h; y++) {
    const dy2 = (y - cy) * (y - cy);
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt((x - cx) * (x - cx) + dy2);
      let vignette = (dist / maxDist - 0.4) / 0.6;
      vignette = Math.min(Math.max(vignette, 0), 0.5);
      const factor = 1 - vignette;
      const idx = y * w + x;
      resR[idx] *= factor;
      resG[idx] *= factor;
      resB[idx] *= factor;
    }
  }

  // ─── Output ImageData ───
  const brightness = preset.brightness ?? 1.0;
  const out = new ImageData(w, h);
  const od = out.data;
  for (let i = 0; i < w * h; i++) {
    od[i * 4]     = Math.max(0, Math.min(255, Math.round(resR[i] * brightness)));
    od[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(resG[i] * brightness)));
    od[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(resB[i] * brightness)));
    od[i * 4 + 3] = 255;
  }
  return out;
}
