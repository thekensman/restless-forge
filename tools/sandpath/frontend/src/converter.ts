/**
 * SVG → Theta-Rho / G-code converter.
 * Direct TypeScript port of backend/converter.py.
 * Operates entirely in memory, no network requests.
 */

import type { DeviceProfile } from "./devices.js";

// ─── Types ────────────────────────────────────────────────────

type Segment =
  | ["L", number, number, number, number]
  | ["Q", number, number, number, number, number, number]
  | ["C", number, number, number, number, number, number, number, number];

export interface ConvertOptions {
  fit?: "cover" | "contain";
  samples?: number;
  maxRhoOverride?: number | null;
  padding?: number;
}

export interface ConvertResult {
  output: string;
  filename: string;
  stats: Record<string, string | number>;
}

// ─── SVG path tokeniser ───────────────────────────────────────

function tokenize(d: string): string[] {
  return d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
}

// ─── SVG path parser (M L H V Q T C S A Z, abs + rel) ────────

function parsePath(d: string): Segment[][] {
  const tokens = tokenize(d);
  const subs: Segment[][] = [];
  let cur: Segment[] = [];
  let i = 0;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let lc: [number, number] | null = null;

  const nf = (): number => { i++; return parseFloat(tokens[i]); };
  const more = (): boolean =>
    i + 1 < tokens.length && !/[MmLlHhVvCcSsQqTtAaZz]/.test(tokens[i + 1]);

  while (i < tokens.length) {
    const t = tokens[i];
    const rel = t === t.toLowerCase() && t !== t.toUpperCase();

    if ("Mm".includes(t)) {
      if (cur.length) { subs.push(cur); cur = []; }
      let x = nf(), y = nf();
      if (rel) { x += cx; y += cy; }
      cx = sx = x; cy = sy = y; lc = null;
      while (more()) {
        x = nf(); y = nf();
        if (rel) { x += cx; y += cy; }
        cur.push(["L", cx, cy, x, y]);
        cx = x; cy = y; lc = null;
      }
    } else if ("Ll".includes(t)) {
      while (more()) {
        let x = nf(), y = nf();
        if (rel) { x += cx; y += cy; }
        cur.push(["L", cx, cy, x, y]);
        cx = x; cy = y;
      }
      lc = null;
    } else if ("Hh".includes(t)) {
      while (more()) {
        let x = nf();
        if (rel) x += cx;
        cur.push(["L", cx, cy, x, cy]); cx = x;
      }
      lc = null;
    } else if ("Vv".includes(t)) {
      while (more()) {
        let y = nf();
        if (rel) y += cy;
        cur.push(["L", cx, cy, cx, y]); cy = y;
      }
      lc = null;
    } else if ("Qq".includes(t)) {
      while (more()) {
        let x1 = nf(), y1 = nf(), x = nf(), y = nf();
        if (rel) { x1 += cx; y1 += cy; x += cx; y += cy; }
        cur.push(["Q", cx, cy, x1, y1, x, y]);
        lc = [x1, y1]; cx = x; cy = y;
      }
    } else if ("Tt".includes(t)) {
      while (more()) {
        let x = nf(), y = nf();
        if (rel) { x += cx; y += cy; }
        const x1: number = lc ? 2 * cx - lc[0] : cx;
        const y1: number = lc ? 2 * cy - lc[1] : cy;
        cur.push(["Q", cx, cy, x1, y1, x, y]);
        lc = [x1, y1]; cx = x; cy = y;
      }
    } else if ("Cc".includes(t)) {
      while (more()) {
        let x1 = nf(), y1 = nf(), x2 = nf(), y2 = nf(), x = nf(), y = nf();
        if (rel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
        cur.push(["C", cx, cy, x1, y1, x2, y2, x, y]);
        lc = [x2, y2]; cx = x; cy = y;
      }
    } else if ("Ss".includes(t)) {
      while (more()) {
        let x2 = nf(), y2 = nf(), x = nf(), y = nf();
        if (rel) { x2 += cx; y2 += cy; x += cx; y += cy; }
        const x1: number = lc ? 2 * cx - lc[0] : cx;
        const y1: number = lc ? 2 * cy - lc[1] : cy;
        cur.push(["C", cx, cy, x1, y1, x2, y2, x, y]);
        lc = [x2, y2]; cx = x; cy = y;
      }
    } else if ("Aa".includes(t)) {
      while (more()) {
        const rx = nf(), ry = nf(), rot = nf();
        const la = nf() | 0, sw = nf() | 0;
        let x = nf(), y = nf();
        if (rel) { x += cx; y += cy; }
        for (const seg of arcToLines(cx, cy, rx, ry, rot, la, sw, x, y)) {
          cur.push(seg);
        }
        cx = x; cy = y;
      }
      lc = null;
    } else if ("Zz".includes(t)) {
      if (Math.abs(cx - sx) > 0.01 || Math.abs(cy - sy) > 0.01) {
        cur.push(["L", cx, cy, sx, sy]);
      }
      cx = sx; cy = sy; lc = null;
    }
    i++;
  }
  if (cur.length) subs.push(cur);
  return subs;
}

function arcToLines(
  cx: number, cy: number, _rx: number, _ry: number,
  _rot: number, _la: number, _sw: number, ex: number, ey: number, n = 24
): Segment[] {
  const segs: Segment[] = [];
  let px = cx, py = cy;
  const r = Math.min(Math.max(_rx, 0.1), Math.max(_ry, 0.1)) * 0.5;
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const x = cx + (ex - cx) * t;
    const y = cy + (ey - cy) * t;
    const bulge = Math.sin(t * Math.PI) * r;
    const ang = Math.atan2(ey - cy, ex - cx) + Math.PI / 2;
    const nx = x + bulge * Math.cos(ang);
    const ny = y + bulge * Math.sin(ang);
    segs.push(["L", px, py, nx, ny]);
    px = nx; py = ny;
  }
  return segs;
}

// ─── Curve sampling ───────────────────────────────────────────

function sampleSegment(seg: Segment, n: number): [number, number][] {
  const pts: [number, number][] = [];
  if (seg[0] === "L") {
    const [, x0, y0, x1, y1] = seg;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      pts.push([x0 + t * (x1 - x0), y0 + t * (y1 - y0)]);
    }
  } else if (seg[0] === "Q") {
    const [, x0, y0, x1, y1, x2, y2] = seg;
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t;
      pts.push([u*u*x0 + 2*u*t*x1 + t*t*x2, u*u*y0 + 2*u*t*y1 + t*t*y2]);
    }
  } else if (seg[0] === "C") {
    const [, x0, y0, x1, y1, x2, y2, x3, y3] = seg;
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t;
      pts.push([
        u**3*x0 + 3*u**2*t*x1 + 3*u*t**2*x2 + t**3*x3,
        u**3*y0 + 3*u**2*t*y1 + 3*u*t**2*y2 + t**3*y3,
      ]);
    }
  }
  return pts;
}

function sampleSubpath(subpath: Segment[], n: number): [number, number][] {
  const all: [number, number][] = [];
  for (const seg of subpath) {
    const pts = sampleSegment(seg, n);
    if (all.length && pts.length) {
      const last = all[all.length - 1];
      if (Math.abs(last[0] - pts[0][0]) < 0.5 && Math.abs(last[1] - pts[0][1]) < 0.5) {
        pts.shift();
      }
    }
    all.push(...pts);
  }
  return all;
}

// ─── SVG element extraction ───────────────────────────────────

function parseTransform(s: string | null): [number, number, number, number] {
  let tx = 0, ty = 0, sx = 1, sy = 1;
  if (!s) return [tx, ty, sx, sy];
  const mt = s.match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)/);
  if (mt) { tx = parseFloat(mt[1]); ty = parseFloat(mt[2]); }
  const ms = s.match(/scale\(\s*([-\d.]+)(?:[,\s]+([-\d.]+))?\s*\)/);
  if (ms) { sx = parseFloat(ms[1]); sy = ms[2] ? parseFloat(ms[2]) : sx; }
  return [tx, ty, sx, sy];
}

interface PathEntry { d: string; tx: number; ty: number; sx: number; sy: number; }

function extractPaths(svgText: string): { paths: PathEntry[]; viewbox: [number,number,number,number] } {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  const vbAttr = root.getAttribute("viewBox") ?? "0 0 800 800";
  const [vx, vy, vw, vh] = vbAttr.split(/\s+|,/).map(Number);
  const viewbox: [number,number,number,number] = [vx, vy, vw, vh];

  const results: PathEntry[] = [];

  function walk(el: Element, ptx: [number, number, number, number]) {
    const [stx, sty, ssx, ssy] = parseTransform(el.getAttribute("transform"));
    const ct: [number, number, number, number] = [
      ptx[0] + stx * ptx[2], ptx[1] + sty * ptx[3],
      ptx[2] * ssx, ptx[3] * ssy,
    ];
    const tag = el.localName;

    if (tag === "path") {
      const d = el.getAttribute("d") ?? "";
      if (d) results.push({ d, tx: ct[0], ty: ct[1], sx: ct[2], sy: ct[3] });
    } else if (tag === "line") {
      const x1 = +(el.getAttribute("x1") ?? 0), y1 = +(el.getAttribute("y1") ?? 0);
      const x2 = +(el.getAttribute("x2") ?? 0), y2 = +(el.getAttribute("y2") ?? 0);
      results.push({ d: `M ${x1},${y1} L ${x2},${y2}`, tx: ct[0], ty: ct[1], sx: ct[2], sy: ct[3] });
    } else if (tag === "circle") {
      const ccx = +(el.getAttribute("cx") ?? 0), ccy = +(el.getAttribute("cy") ?? 0);
      const r = +(el.getAttribute("r") ?? 0);
      if (r > 0) results.push({
        d: `M ${ccx+r},${ccy} A ${r},${r} 0 1 1 ${ccx-r},${ccy} A ${r},${r} 0 1 1 ${ccx+r},${ccy} Z`,
        tx: ct[0], ty: ct[1], sx: ct[2], sy: ct[3],
      });
    } else if (tag === "ellipse") {
      const ecx = +(el.getAttribute("cx") ?? 0), ecy = +(el.getAttribute("cy") ?? 0);
      const erx = +(el.getAttribute("rx") ?? 0), ery = +(el.getAttribute("ry") ?? 0);
      if (erx > 0 && ery > 0) results.push({
        d: `M ${ecx+erx},${ecy} A ${erx},${ery} 0 1 1 ${ecx-erx},${ecy} A ${erx},${ery} 0 1 1 ${ecx+erx},${ecy} Z`,
        tx: ct[0], ty: ct[1], sx: ct[2], sy: ct[3],
      });
    } else if (tag === "rect") {
      const rx = +(el.getAttribute("x") ?? 0), ry = +(el.getAttribute("y") ?? 0);
      const rw = +(el.getAttribute("width") ?? 0), rh = +(el.getAttribute("height") ?? 0);
      if (rw > 0 && rh > 0) results.push({
        d: `M ${rx},${ry} L ${rx+rw},${ry} L ${rx+rw},${ry+rh} L ${rx},${ry+rh} Z`,
        tx: ct[0], ty: ct[1], sx: ct[2], sy: ct[3],
      });
    } else if (tag === "polyline" || tag === "polygon") {
      const coords = (el.getAttribute("points") ?? "").match(/[-+]?(?:\d+\.?\d*|\.\d+)/g) ?? [];
      if (coords.length >= 4) {
        let d = `M ${coords[0]},${coords[1]}`;
        for (let j = 2; j < coords.length - 1; j += 2) d += ` L ${coords[j]},${coords[j+1]}`;
        if (tag === "polygon") d += " Z";
        results.push({ d, tx: ct[0], ty: ct[1], sx: ct[2], sy: ct[3] });
      }
    }
    for (const child of el.children) walk(child, ct);
  }

  walk(root, [0, 0, 1, 1]);
  return { paths: results, viewbox };
}

// ─── Path optimisation (nearest-neighbour ordering) ──────────

function optimizeOrder(paths: [number, number][][]): number[] {
  if (!paths.length) return [];
  const rem = paths.map((_, i) => i);
  const order = [rem.shift()!];
  let end = paths[order[0]].at(-1) ?? [0, 0];

  while (rem.length) {
    let bestIdx = -1, bestDist = Infinity, bestRev = false;
    for (const idx of rem) {
      const p = paths[idx];
      if (!p.length) continue;
      const ds = (end[0]-p[0][0])**2 + (end[1]-p[0][1])**2;
      const de = (end[0]-p.at(-1)![0])**2 + (end[1]-p.at(-1)![1])**2;
      if (ds < bestDist) { bestDist = ds; bestIdx = idx; bestRev = false; }
      if (de < bestDist) { bestDist = de; bestIdx = idx; bestRev = true; }
    }
    if (bestIdx === -1) break;
    if (bestRev) paths[bestIdx].reverse();
    order.push(bestIdx);
    rem.splice(rem.indexOf(bestIdx), 1);
    end = paths[bestIdx].at(-1)!;
  }
  return order;
}

// ─── Theta continuity unwrap ──────────────────────────────────

function unwrapTheta(pts: [number, number][]): [number, number][] {
  if (pts.length < 2) return pts;
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    let [th, rh] = pts[i];
    const prev = out[out.length - 1][0];
    while (th - prev > Math.PI)  th -= 2 * Math.PI;
    while (th - prev < -Math.PI) th += 2 * Math.PI;
    out.push([th, rh]);
  }
  return out;
}

// ─── Public API ───────────────────────────────────────────────

export function convert(
  svgText: string,
  device: DeviceProfile,
  opts: ConvertOptions = {}
): ConvertResult {
  const { fit = "cover", samples = 16, maxRhoOverride = null, padding = 0 } = opts;
  const effectiveRho = Math.max(0.1, Math.min(1.0, (maxRhoOverride ?? device.max_rho) - padding));

  // 1. Parse SVG
  const { paths: pathEntries } = extractPaths(svgText);

  // 2. Sample all paths
  const allLists: [number, number][][] = [];
  for (const { d, tx, ty, sx, sy } of pathEntries) {
    try {
      for (const sub of parsePath(d)) {
        if (!sub.length) continue;
        const pts = sampleSubpath(sub, samples)
          .map(([x, y]): [number, number] => [x * sx + tx, y * sy + ty]);
        if (pts.length >= 2) allLists.push(pts);
      }
    } catch { /* skip malformed paths */ }
  }

  if (!allLists.length) throw new Error("No valid paths found in SVG.");

  // 3. Bounding box
  const xs = allLists.flatMap(p => p.map(([x]) => x));
  const ys = allLists.flatMap(p => p.map(([, y]) => y));
  const mnX = Math.min(...xs), mxX = Math.max(...xs);
  const mnY = Math.min(...ys), mxY = Math.max(...ys);
  const cw = mxX - mnX, ch = mxY - mnY;
  const ccx = (mnX + mxX) / 2, ccy = (mnY + mxY) / 2;

  if (device.shape === "circular") {
    // 4. Polar radius
    //
    // For a circular bed there are no rectangular "corners" to crop, so the
    // useful difference between cover and contain is how aggressively we fill
    // the disk:
    //   contain → fits every traced point inside the disk (safe default for
    //             asymmetric content like a watch + chain — nothing clips)
    //   cover   → scales up further so the SHORT bbox side reaches the edge,
    //             accepting that points beyond the inscribed circle clip
    //
    // Previously cover used halfShort with the bbox center, which silently
    // dropped large arcs of off-center content (e.g. the bottom of a watch
    // when the chain pulled the bbox center upward). Anchoring both modes to
    // the actual max distance from center keeps the polar center honest.
    const maxDist = Math.max(
      ...allLists.flatMap(p => p.map(([x, y]) => Math.hypot(x - ccx, y - ccy)))
    );
    let polarR: number;
    if (fit === "cover") {
      const halfShort = Math.min(cw, ch) / 2;
      // Use halfShort when it actually contains the content (centered, square
      // artwork). Otherwise fall back to maxDist so off-center content is not
      // truncated.
      polarR = (halfShort > 0.001 && halfShort >= maxDist)
        ? halfShort / effectiveRho
        : (maxDist > 0.001 ? maxDist / effectiveRho : 1);
    } else {
      polarR = maxDist > 0.001 ? maxDist / effectiveRho : 1;
    }

    // 5. Optimise order
    const order = optimizeOrder(allLists);

    // 6. Convert to theta-rho.
    //
    // Theta-rho output has no "pen up" — every consecutive point is drawn as
    // a continuous arc. When subpaths are concatenated the table sweeps from
    // the previous endpoint to the next start across whatever angle the unwrap
    // chose, leaving large visible curves between unrelated shapes (the "extra
    // loops" the user sees). Retracting through rho=0 between subpaths turns
    // those connections into short radial moves through the centre, which are
    // far less visible in sand than long off-axis arcs.
    const toPolar = (x: number, y: number): [number, number] => {
      const dx = x - ccx, dy = y - ccy;
      const rho = Math.min(Math.hypot(dx, dy) / polarR, effectiveRho);
      const theta = Math.atan2(dy, dx) + Math.PI / 2;
      return [theta, rho];
    };

    let tr: [number, number][] = [];
    for (let oi = 0; oi < order.length; oi++) {
      const path = allLists[order[oi]];
      if (!path.length) continue;

      const polarPath = path.map(([x, y]) => toPolar(x, y));

      if (oi > 0) {
        // Lift through centre: prev_theta@0 → next_theta@0 → next_start.
        // Holding rho=0 keeps the ball on a single point while theta winds.
        const prev = tr[tr.length - 1];
        const next = polarPath[0];
        tr.push([prev[0], 0]);
        tr.push([next[0], 0]);
      }
      tr.push(...polarPath);
    }
    tr = unwrapTheta(tr);

    const clipped = tr.filter(([, r]) => r >= effectiveRho - 0.0001).length;

    const lines = [
      `# SandPath converter`,
      `# Device: ${device.name}`,
      `# Fit: ${fit} | max_rho: ${effectiveRho}`,
      `# Points: ${tr.length} | Subpaths: ${allLists.length}`,
      ...tr.map(([th, rh]) => `${th.toFixed(6)} ${rh.toFixed(6)}`),
    ];

    return {
      output: lines.join("\n") + "\n",
      filename: "output.thr",
      stats: {
        points: tr.length,
        subpaths: allLists.length,
        fit,
        max_rho: effectiveRho,
        polar_radius: Math.round(polarR * 10) / 10,
        content_size: `${Math.round(cw)}×${Math.round(ch)}`,
        clipped_points: clipped,
      },
    };

  } else {
    // Rectangular / G-code output
    const scaleX = cw > 0 ? device.width_mm / cw : 1;
    const scaleY = ch > 0 ? device.height_mm / ch : 1;
    const scale = fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

    const order = optimizeOrder(allLists);

    const lines = [
      `; SandPath G-code output`,
      `; Device: ${device.name}`,
      `; Fit: ${fit} | Scale: ${scale.toFixed(4)}`,
      `G90`,
      `G21`,
      `G0 X0 Y0 F3000`,
    ];

    let totalPts = 0;
    for (const idx of order) {
      for (let j = 0; j < allLists[idx].length; j++) {
        const [x, y] = allLists[idx][j];
        const gx = Math.max(0, Math.min(device.width_mm, (x - ccx) * scale + device.width_mm / 2));
        const gy = Math.max(0, Math.min(device.height_mm, (y - ccy) * scale + device.height_mm / 2));
        lines.push(`${j === 0 ? "G0" : "G1"} X${gx.toFixed(3)} Y${gy.toFixed(3)}`);
        totalPts++;
      }
    }
    lines.push(`G0 X0 Y0`);

    return {
      output: lines.join("\n") + "\n",
      filename: "output.gcode",
      stats: {
        points: totalPts,
        subpaths: allLists.length,
        fit,
        scale: Math.round(scale * 10000) / 10000,
        content_size: `${Math.round(cw)}×${Math.round(ch)}`,
        bed_size: `${device.width_mm}×${device.height_mm}mm`,
      },
    };
  }
}
