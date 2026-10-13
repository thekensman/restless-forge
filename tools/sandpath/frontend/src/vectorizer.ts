/**
 * Raster image → SVG vectoriser.
 * Browser-based TypeScript port of backend/vectorizer.py.
 * Uses the Canvas 2D API instead of Pillow for pixel operations.
 *
 * Pipeline:
 *   1. Decode image via createImageBitmap (browser handles all formats)
 *   2. Draw to canvas at target resolution → getImageData (RGBA)
 *   3. Composite alpha on white → convert to grayscale
 *   4. Optional invert
 *   5. Optional Gaussian blur (kernel convolution)
 *   6. Edge detection: Sobel / threshold / centerline thinning
 *   7. Marching squares contour extraction
 *   8. Douglas–Peucker path simplification
 *   9. SVG document generation
 */

export interface VectorizeOpts {
  /** "outline" | "threshold" | "centerline" */
  mode?: string;
  /** 0–255 brightness cutoff */
  threshold?: number;
  /** Gaussian blur radius (0 = none) */
  blur?: number;
  /** Invert image before processing */
  invert?: boolean;
  /** Douglas–Peucker epsilon in pixels */
  detail?: number;
  /** Resize longer side to this many pixels before processing */
  maxDimension?: number;
  /** SVG stroke width */
  lineWidth?: number;
  /** Drop contours shorter than this many points (post-DP simplification).
   *  Defaults to 3 for outline/centerline, 4 for threshold. */
  minPathLength?: number;
}

export interface VectorizeResult {
  svgText: string;
  width: number;
  height: number;
  pathCount: number;
  pointCount: number;
}

// ─── Public API ───────────────────────────────────────────────

export async function vectorize(file: File, opts: VectorizeOpts = {}): Promise<VectorizeResult> {
  // 1–3. Decode, resize, composite on white, greyscale
  const { pixels, width, height } = await loadGrayscale(file, opts.maxDimension ?? 800);
  return traceGray(pixels, width, height, opts);
}

/** Steps 4–9 on an already-decoded greyscale image (row-major, one byte per
 *  pixel). Separate from decoding so it runs without a canvas, e.g. in tests. */
export function traceGray(
  pixels: Uint8Array, w: number, h: number, opts: VectorizeOpts = {}
): VectorizeResult {
  const {
    mode = "outline",
    threshold = 128,
    blur = 1.0,
    invert = false,
    detail = 1.5,
    lineWidth = 2.0,
    minPathLength,
  } = opts;

  // 4. Invert
  let gray = pixels;
  if (invert) {
    gray = new Uint8Array(pixels.length);
    for (let i = 0; i < pixels.length; i++) gray[i] = 255 - pixels[i];
  }

  // 5. Gaussian blur
  if (blur > 0) gray = gaussianBlur(gray, w, h, blur);

  // 6. Edge detection → binary grid.
  //
  // For outline mode, Sobel alone produces a 2–3 px wide band of "on" pixels
  // along every real edge. Marching squares then traces both sides of the
  // band, doubling every contour. NMS thins the band to a single-pixel ridge
  // so each edge yields one contour. The result is far cleaner on photos.
  let grid: number[][];
  if (mode === "outline") {
    grid = sobelEdgesThinned(gray, w, h, threshold);
  } else if (mode === "centerline") {
    grid = centerline(gray, w, h, threshold);
  } else {
    grid = thresholdGrid(gray, w, h, threshold);
  }

  // 7. Marching squares. Outline and centerline produce one-pixel lines,
  // which step diagonally wherever they are not horizontal or vertical;
  // those modes join pixels that touch only at a corner (see marchingSquares).
  const contours = marchingSquares(grid, w, h, mode !== "threshold");

  // 8. Simplify + drop short/noise contours.
  // Short fragments add visible "extra lines" without contributing structure —
  // they are the dominant noise source in Sobel-based tracing.
  const simplified: [number, number][][] = [];
  let totalPts = 0;
  // Outline and centerline trace one-pixel lines, which marching squares
  // returns as narrow loops. Douglas-Peucker folds the loop around a straight
  // line to three points, out and back, so a floor of four dropped every
  // straight stroke. Those modes keep three-point paths; the length check
  // below still removes specks. Threshold traces region boundaries and keeps
  // the floor of four.
  const minPts = Math.max(2, minPathLength ?? (mode === "threshold" ? 4 : 3));
  for (const contour of contours) {
    const simp = douglasPeucker(contour, detail);
    if (simp.length < minPts) continue;
    if (pathLength(simp) < detail * 4) continue;
    simplified.push(simp);
    totalPts += simp.length;
  }

  // 9. Build SVG
  const svgText = buildSvg(simplified, w, h, lineWidth);

  return { svgText, width: w, height: h, pathCount: simplified.length, pointCount: totalPts };
}

// ─── Image loading & grayscale ────────────────────────────────

async function loadGrayscale(
  file: File,
  maxDimension: number
): Promise<{ pixels: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  let w = bitmap.width, h = bitmap.height;

  if (Math.max(w, h) > maxDimension) {
    const scale = maxDimension / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // White background to composite alpha
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const rgba = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return { pixels: gray, width: w, height: h };
}

// ─── Gaussian blur ────────────────────────────────────────────

function gaussianBlur(pixels: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  // Build a Gaussian kernel of size 2*ceil(2*sigma)+1
  const sigma = Math.max(0.1, radius);
  const kHalf = Math.ceil(2 * sigma);
  const kernel: number[] = [];
  let kSum = 0;
  for (let k = -kHalf; k <= kHalf; k++) {
    const v = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel.push(v);
    kSum += v;
  }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= kSum;

  // Separable 1D passes: horizontal then vertical
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let val = 0;
      for (let k = -kHalf; k <= kHalf; k++) {
        const sx = Math.max(0, Math.min(w - 1, x + k));
        val += pixels[y * w + sx] * kernel[k + kHalf];
      }
      tmp[y * w + x] = val;
    }
  }

  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let val = 0;
      for (let k = -kHalf; k <= kHalf; k++) {
        const sy = Math.max(0, Math.min(h - 1, y + k));
        val += tmp[sy * w + x] * kernel[k + kHalf];
      }
      out[y * w + x] = Math.round(Math.max(0, Math.min(255, val)));
    }
  }

  return out;
}

// ─── Edge detection ───────────────────────────────────────────

/**
 * Sobel + non-maximum suppression: thins the gradient ridge to a single
 * pixel along each edge. Without NMS, marching squares traces both sides of
 * the 2–3 px wide Sobel response, producing two parallel contours per edge.
 */
export function sobelEdgesThinned(
  pixels: Uint8Array, w: number, h: number, threshold: number
): number[][] {
  const mag = new Float32Array(w * h);
  const dir = new Uint8Array(w * h); // 0:|  1:/  2:—  3:\
  const px = (x: number, y: number): number =>
    pixels[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = -px(x-1,y-1) + px(x+1,y-1) - 2*px(x-1,y) + 2*px(x+1,y) - px(x-1,y+1) + px(x+1,y+1);
      const gy = -px(x-1,y-1) - 2*px(x,y-1) - px(x+1,y-1) + px(x-1,y+1) + 2*px(x,y+1) + px(x+1,y+1);
      mag[y * w + x] = Math.sqrt(gx * gx + gy * gy);
      // Quantise angle to 4 bins (0, 45, 90, 135°) for NMS comparisons
      const ang = Math.atan2(gy, gx) * 180 / Math.PI;
      const a = ((ang < 0 ? ang + 180 : ang) + 22.5) % 180;
      dir[y * w + x] = Math.min(3, Math.floor(a / 45));
    }
  }

  const grid: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      const m = mag[y * w + x];
      if (m <= threshold) { row.push(0); continue; }
      let m1 = 0, m2 = 0;
      const d = dir[y * w + x];
      // Compare across the edge, i.e. along the gradient. With y pointing
      // down, bin 1 (gradient near 45°) points down-right or up-left, and bin
      // 3 (near 135°) down-left or up-right. The two diagonal pairs were once
      // swapped, which compared along diagonal edges instead of across them
      // and broke every curve into fragments.
      if (d === 0)      { m1 = mag[y * w + Math.max(0, x-1)];           m2 = mag[y * w + Math.min(w-1, x+1)]; }
      else if (d === 1) { m1 = mag[Math.max(0, y-1) * w + Math.max(0, x-1)];   m2 = mag[Math.min(h-1, y+1) * w + Math.min(w-1, x+1)]; }
      else if (d === 2) { m1 = mag[Math.max(0, y-1) * w + x];           m2 = mag[Math.min(h-1, y+1) * w + x]; }
      else              { m1 = mag[Math.max(0, y-1) * w + Math.min(w-1, x+1)]; m2 = mag[Math.min(h-1, y+1) * w + Math.max(0, x-1)]; }
      row.push(m >= m1 && m >= m2 ? 1 : 0);
    }
    grid.push(row);
  }
  return grid;
}

function pathLength(pts: [number, number][]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]);
  }
  return len;
}

function thresholdGrid(pixels: Uint8Array, w: number, h: number, level: number): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) row.push(pixels[y * w + x] < level ? 1 : 0);
    grid.push(row);
  }
  return grid;
}

/**
 * Threshold, then thin every stroke to a one-pixel skeleton with Zhang–Suen
 * (Zhang & Suen, "A fast parallel algorithm for thinning digital patterns",
 * CACM 1984). Its two sub-passes only delete a pixel whose removal cannot
 * split a stroke (exactly one 0→1 transition around it) and that is not a
 * line end (at least two neighbours), so lines thin to their middle and stay
 * whole. The earlier single-pass approximation had no connectivity check and
 * eroded line drawings to nothing.
 */
function centerline(pixels: Uint8Array, w: number, h: number, level: number): number[][] {
  const img = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) img[i] = pixels[i] < level ? 1 : 0;
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x];

  const doomed: number[] = [];
  const n = new Uint8Array(8); // neighbours clockwise from north: P2 … P9
  for (let changed = true; changed; ) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      doomed.length = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!img[y * w + x]) continue;
          n[0] = at(x, y-1); n[2] = at(x+1, y); n[4] = at(x, y+1); n[6] = at(x-1, y);
          // All four edge neighbours set: inside a stroke, and both
          // sub-passes below would keep it anyway.
          if (n[0] && n[2] && n[4] && n[6]) continue;
          n[1] = at(x+1, y-1); n[3] = at(x+1, y+1); n[5] = at(x-1, y+1); n[7] = at(x-1, y-1);
          let count = 0, transitions = 0;
          for (let k = 0; k < 8; k++) {
            count += n[k];
            if (!n[k] && n[(k + 1) % 8]) transitions++;
          }
          if (count < 2 || count > 6 || transitions !== 1) continue;
          const [p2, , p4, , p6, , p8] = n;
          if (pass === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8)
                         : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
          doomed.push(y * w + x);
        }
      }
      for (const i of doomed) img[i] = 0;
      if (doomed.length) changed = true;
    }
  }

  const grid: number[][] = [];
  for (let y = 0; y < h; y++) grid.push(Array.from(img.subarray(y * w, (y + 1) * w)));
  return grid;
}

// ─── Marching squares ─────────────────────────────────────────

function marchingSquares(
  grid: number[][], w: number, h: number, joinDiagonals = false
): [number, number][][] {
  if (h < 2 || w < 2) return [];

  const cell = (x: number, y: number): number => {
    const tl = (y >= 0 && y < h && x >= 0 && x < w) ? grid[y][x] : 0;
    const tr = (y >= 0 && y < h && x+1 >= 0 && x+1 < w) ? grid[y][x+1] : 0;
    const bl = (y+1 >= 0 && y+1 < h && x >= 0 && x < w) ? grid[y+1][x] : 0;
    const br = (y+1 >= 0 && y+1 < h && x+1 >= 0 && x+1 < w) ? grid[y+1][x+1] : 0;
    return (tl << 3) | (tr << 2) | (br << 1) | bl;
  };

  const midpoint = (cx: number, cy: number, side: number): [number, number] => {
    if (side === 0) return [cx + 0.5, cy];
    if (side === 1) return [cx + 1.0, cy + 0.5];
    if (side === 2) return [cx + 0.5, cy + 1.0];
    return [cx, cy + 0.5];
  };

  // Marching squares edge table: case → (entry_side, exit_side) pairs
  const EDGES: Record<number, [number, number][]> = {
    0: [], 15: [],
    1: [[2,3]], 2: [[1,2]], 3: [[1,3]],
    4: [[0,1]], 5: [[0,1],[2,3]], 6: [[0,2]],
    7: [[0,3]], 8: [[3,0]], 9: [[2,0]],
    10: [[3,0],[1,2]], 11: [[1,0]], 12: [[3,1]],
    13: [[2,1]], 14: [[3,2]],
  };
  // Cases 5 and 10 are saddles: two "on" pixels that touch only at a corner.
  // The table above keeps them apart, which suits filled regions. A one-pixel
  // line kept apart that way breaks at every diagonal step, so for lines the
  // saddle cuts off the two "off" corners instead and the pixels join.
  if (joinDiagonals) {
    EDGES[5] = [[0,3],[2,1]];
    EDGES[10] = [[1,0],[3,2]];
  }

  const visitedEdges = new Set<string>();
  const contours: [number, number][][] = [];

  for (let cy = 0; cy < h - 1; cy++) {
    for (let cx = 0; cx < w - 1; cx++) {
      const c = cell(cx, cy);
      for (const [entry] of EDGES[c] ?? []) {
        const edgeKey = `${cx},${cy},${entry}`;
        if (visitedEdges.has(edgeKey)) continue;

        const path: [number, number][] = [];
        let px = cx, py = cy, pside = entry;
        const maxIter = w * h * 2;

        for (let safety = 0; safety < maxIter; safety++) {
          const ek = `${px},${py},${pside}`;
          if (visitedEdges.has(ek)) break;
          visitedEdges.add(ek);

          const cc = cell(px, py);
          let found = false;
          for (const [eIn, eOut] of EDGES[cc] ?? []) {
            if (eIn !== pside) continue;
            path.push(midpoint(px, py, eIn));
            path.push(midpoint(px, py, eOut));
            visitedEdges.add(`${px},${py},${eOut}`);

            let nx = px, ny = py, nside = eOut;
            if (eOut === 0) { ny--; nside = 2; }
            else if (eOut === 1) { nx++; nside = 3; }
            else if (eOut === 2) { ny++; nside = 0; }
            else { nx--; nside = 1; }

            if (nx < 0 || nx >= w - 1 || ny < 0 || ny >= h - 1) { found = false; break; }
            px = nx; py = ny; pside = nside;
            found = true;
            break;
          }
          if (!found) break;
        }

        if (path.length >= 2) contours.push(path);
      }
    }
  }

  return contours;
}

// ─── Douglas–Peucker simplification ──────────────────────────

function douglasPeucker(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points;
  const [start, end] = [points[0], points[points.length - 1]];
  let maxDist = 0, maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDist(points[i], start, end);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [start, end];
}

function pointLineDist(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const magSq = dx * dx + dy * dy;
  if (magSq < 1e-10) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / magSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// ─── SVG generation ───────────────────────────────────────────

function buildSvg(
  paths: [number, number][][],
  width: number,
  height: number,
  strokeWidth: number
): string {
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
  ];
  for (const path of paths) {
    if (path.length < 2) continue;
    const d = `M ${path[0][0].toFixed(1)},${path[0][1].toFixed(1)} ` +
      path.slice(1).map(([x, y]) => `L ${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    lines.push(
      `  <path d="${d}" fill="none" stroke="#000" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`
    );
  }
  lines.push("</svg>");
  return lines.join("\n");
}
