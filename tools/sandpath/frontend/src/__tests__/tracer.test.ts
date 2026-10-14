/**
 * Tracer and converter regressions, run on synthetic images so they need no
 * canvas. Each case failed before the fix it names.
 */

import { describe, it, expect } from "vitest";
import { traceGray, sobelEdgesThinned } from "../vectorizer";
import { convert } from "../converter";
import { DEVICES } from "../devices";

/** Greyscale image: black where `ink(x, y)` is true, white elsewhere. */
function image(w: number, h: number, ink: (x: number, y: number) => boolean): Uint8Array {
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = ink(x, y) ? 0 : 255;
  return px;
}

/** Every vertex of every path in a traced SVG. */
function vertices(svg: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of svg.matchAll(/ d="([^"]+)"/g)) {
    const nums = (m[1].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  }
  return out;
}

/** How many of 12 equal slices around (cx, cy) hold a vertex within 3 px of radius r. */
function slicesCovered(pts: [number, number][], cx: number, cy: number, r: number): number {
  const hit = new Set<number>();
  for (const [x, y] of pts) {
    if (Math.abs(Math.hypot(x - cx, y - cy) - r) > 3) continue;
    const a = Math.atan2(y - cy, x - cx) + Math.PI;
    hit.add(Math.min(11, Math.floor((a / (2 * Math.PI)) * 12)));
  }
  return hit.size;
}

describe("Edge thinning (non-maximum suppression)", () => {
  // A diagonal edge must thin to a ridge one or two pixels across. With the
  // diagonal neighbour pairs swapped, pixels were compared along the edge
  // instead of across it, so the whole band survived on straight diagonals
  // and broke into fragments on curves.
  // The edge crosses every row once. Across a hard step, Sobel responds in a
  // band four pixels wide; thinned, one or two of them remain in each row.
  // (Counting along a diagonal instead would see only every other pixel of
  // the band and miss the difference.)
  const w = 48, h = 48;
  const ridgeWidths = (grid: number[][]) =>
    grid.slice(12, 36).map((row) => row.reduce((a, b) => a + b, 0));

  it("thins an edge running down-left to one ridge", () => {
    const grid = sobelEdgesThinned(image(w, h, (x, y) => x + y < 48), w, h, 128);
    for (const n of ridgeWidths(grid)) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(2);
    }
  });

  it("thins an edge running down-right to one ridge", () => {
    const grid = sobelEdgesThinned(image(w, h, (x, y) => x > y), w, h, 128);
    for (const n of ridgeWidths(grid)) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(2);
    }
  });
});

describe("Outline mode", () => {
  const w = 300, h = 300;
  const ring = image(w, h, (x, y) => {
    const d = Math.hypot(x - 150, y - 150);
    return d >= 50 && d <= 100;
  });

  it("traces both edges of a ring all the way round", () => {
    const r = traceGray(ring, w, h, { mode: "outline" });
    const pts = vertices(r.svgText);
    expect(slicesCovered(pts, 150, 150, 100)).toBe(12);
    expect(slicesCovered(pts, 150, 150, 50)).toBe(12);
  });

  it("traces each circle as one piece, not a scatter of fragments", () => {
    // Joining pixels that touch only at a corner keeps a curved one-pixel
    // ridge whole; kept apart, the ring came out as dozens of short paths.
    const r = traceGray(ring, w, h, { mode: "outline" });
    expect(r.pathCount).toBeLessThanOrEqual(6);
  });
});

describe("Centerline mode", () => {
  const w = 300, h = 300;

  it("thins a drawn circle to one line at its middle", () => {
    const circle = image(w, h, (x, y) => Math.abs(Math.hypot(x - 150, y - 150) - 80) <= 2.5);
    const r = traceGray(circle, w, h, { mode: "centerline" });
    const pts = vertices(r.svgText);
    expect(r.pathCount).toBeGreaterThanOrEqual(1);
    expect(r.pathCount).toBeLessThanOrEqual(4);
    expect(slicesCovered(pts, 150, 150, 80)).toBe(12);
    for (const [x, y] of pts) expect(Math.abs(Math.hypot(x - 150, y - 150) - 80)).toBeLessThan(3);
  });

  it("keeps a straight diagonal stroke", () => {
    // From (40, 260) to (260, 40), five pixels thick.
    const onLine = (x: number, y: number) =>
      Math.abs(x + y - 300) / Math.SQRT2 <= 2.5 && x >= 40 && x <= 260;
    const r = traceGray(image(w, h, onLine), w, h, { mode: "centerline" });
    const pts = vertices(r.svgText);
    expect(r.pathCount).toBeGreaterThanOrEqual(1);
    for (const [x, y] of pts) expect(Math.abs(x + y - 300) / Math.SQRT2).toBeLessThan(3);
    const along = pts.map(([x, y]) => (x - y) / Math.SQRT2);
    const span = Math.max(...along) - Math.min(...along);
    expect(span).toBeGreaterThan(0.8 * 220 * Math.SQRT2);
  });

  it("keeps a short straight dash", () => {
    // A straight line traces as an out-and-back path of three points.
    const dash = image(w, h, (x, y) => x >= 100 && x <= 130 && y >= 148 && y <= 152);
    const r = traceGray(dash, w, h, { mode: "centerline" });
    expect(r.pathCount).toBe(1);
  });
});

describe("Threshold mode", () => {
  it("keeps two squares that touch only at a corner apart", () => {
    const w = 80, h = 80;
    const squares = image(w, h, (x, y) =>
      (x >= 10 && x < 30 && y >= 10 && y < 30) || (x >= 30 && x < 50 && y >= 30 && y < 50));
    const r = traceGray(squares, w, h, { mode: "threshold", blur: 0 });
    expect(r.pathCount).toBe(2);
  });
});

describe("Converter", () => {
  it("converts a trace too large to spread into one function call", () => {
    // 20,000 segments sample to about 320,000 points. The bounding box used
    // Math.min(...points), which overflowed the stack near 125,000.
    const d = ["M 0,0"];
    for (let i = 1; i <= 20000; i++) d.push(`L ${i % 2 ? 300 : 0},${(i * 0.015).toFixed(3)}`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><path d="${d.join(" ")}"/></svg>`;
    for (const device of [DEVICES.sisyphus_mini, DEVICES.zen_xy]) {
      const result = convert(svg, device);
      expect(Number(result.stats.points)).toBeGreaterThan(300000);
    }
  });
});
