"""
SVG → Theta-Rho / G-code converter core.

Operates entirely in memory — no temporary files are written.
Accepts raw SVG bytes/string and returns the converted output
as a string, ready to be sent to the client.
"""

from __future__ import annotations

import io
import math
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass

from devices import DeviceProfile


# ─── SVG path tokeniser ──────────────────────────────────────

def _tok(d: str) -> list[str]:
    return re.findall(
        r'[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?', d
    )


# ─── SVG path parser (M L H V Q T C S A Z, abs + rel) ────────

def _parse_path(d: str) -> list[list[tuple]]:
    tokens = _tok(d)
    subs: list[list[tuple]] = []
    cur: list[tuple] = []
    i = 0
    cx = cy = sx = sy = 0.0
    lc = None

    def nf():
        nonlocal i; i += 1; return float(tokens[i])

    def more():
        return (i + 1 < len(tokens)
                and tokens[i + 1] not in "MmLlHhVvCcSsQqTtAaZz")

    while i < len(tokens):
        t = tokens[i]
        rel = t.islower()

        if t in "Mm":
            if cur:
                subs.append(cur); cur = []
            x, y = nf(), nf()
            if rel: x += cx; y += cy
            cx, cy = sx, sy = x, y; lc = None
            while more():
                x, y = nf(), nf()
                if rel: x += cx; y += cy
                cur.append(("L", cx, cy, x, y))
                cx, cy = x, y; lc = None

        elif t in "Ll":
            while more():
                x, y = nf(), nf()
                if rel: x += cx; y += cy
                cur.append(("L", cx, cy, x, y))
                cx, cy = x, y
            lc = None

        elif t in "Hh":
            while more():
                x = nf()
                if rel: x += cx
                cur.append(("L", cx, cy, x, cy)); cx = x
            lc = None

        elif t in "Vv":
            while more():
                y = nf()
                if rel: y += cy
                cur.append(("L", cx, cy, cx, y)); cy = y
            lc = None

        elif t in "Qq":
            while more():
                x1, y1, x, y = nf(), nf(), nf(), nf()
                if rel: x1 += cx; y1 += cy; x += cx; y += cy
                cur.append(("Q", cx, cy, x1, y1, x, y))
                lc = (x1, y1); cx, cy = x, y

        elif t in "Tt":
            while more():
                x, y = nf(), nf()
                if rel: x += cx; y += cy
                x1, y1 = (2 * cx - lc[0], 2 * cy - lc[1]) if lc else (cx, cy)
                cur.append(("Q", cx, cy, x1, y1, x, y))
                lc = (x1, y1); cx, cy = x, y

        elif t in "Cc":
            while more():
                x1, y1, x2, y2, x, y = nf(), nf(), nf(), nf(), nf(), nf()
                if rel:
                    x1 += cx; y1 += cy; x2 += cx; y2 += cy
                    x += cx; y += cy
                cur.append(("C", cx, cy, x1, y1, x2, y2, x, y))
                lc = (x2, y2); cx, cy = x, y

        elif t in "Ss":
            while more():
                x2, y2, x, y = nf(), nf(), nf(), nf()
                if rel: x2 += cx; y2 += cy; x += cx; y += cy
                x1, y1 = (2 * cx - lc[0], 2 * cy - lc[1]) if lc else (cx, cy)
                cur.append(("C", cx, cy, x1, y1, x2, y2, x, y))
                lc = (x2, y2); cx, cy = x, y

        elif t in "Aa":
            while more():
                rx, ry, rot = nf(), nf(), nf()
                la, sw = int(nf()), int(nf())
                x, y = nf(), nf()
                if rel: x += cx; y += cy
                for seg in _arc_to_lines(cx, cy, rx, ry, rot, la, sw, x, y):
                    cur.append(seg)
                cx, cy = x, y
            lc = None

        elif t in "Zz":
            if abs(cx - sx) > 0.01 or abs(cy - sy) > 0.01:
                cur.append(("L", cx, cy, sx, sy))
            cx, cy = sx, sy; lc = None

        i += 1

    if cur:
        subs.append(cur)
    return subs


def _arc_to_lines(cx, cy, rx, ry, rot, la, sw, ex, ey, n=24):
    segs = []
    px, py = cx, cy
    for i in range(1, n + 1):
        t = i / n
        x = cx + (ex - cx) * t
        y = cy + (ey - cy) * t
        bulge = math.sin(t * math.pi) * min(max(rx, 0.1), max(ry, 0.1)) * 0.5
        ang = math.atan2(ey - cy, ex - cx) + math.pi / 2
        nx_ = x + bulge * math.cos(ang)
        ny_ = y + bulge * math.sin(ang)
        segs.append(("L", px, py, nx_, ny_))
        px, py = nx_, ny_
    return segs


# ─── Curve sampling ───────────────────────────────────────────

def _sample(seg: tuple, n: int = 16) -> list[tuple[float, float]]:
    k = seg[0]
    pts: list[tuple[float, float]] = []
    if k == "L":
        _, x0, y0, x1, y1 = seg
        for i in range(n + 1):
            t = i / n
            pts.append((x0 + t * (x1 - x0), y0 + t * (y1 - y0)))
    elif k == "Q":
        _, x0, y0, x1, y1, x2, y2 = seg
        for i in range(n + 1):
            t = i / n; u = 1 - t
            pts.append((u*u*x0 + 2*u*t*x1 + t*t*x2,
                         u*u*y0 + 2*u*t*y1 + t*t*y2))
    elif k == "C":
        _, x0, y0, x1, y1, x2, y2, x3, y3 = seg
        for i in range(n + 1):
            t = i / n; u = 1 - t
            pts.append((
                u**3*x0 + 3*u**2*t*x1 + 3*u*t**2*x2 + t**3*x3,
                u**3*y0 + 3*u**2*t*y1 + 3*u*t**2*y2 + t**3*y3,
            ))
    return pts


def _sample_subpath(subpath: list[tuple], n: int) -> list[tuple[float, float]]:
    all_pts: list[tuple[float, float]] = []
    for seg in subpath:
        pts = _sample(seg, n)
        if all_pts and pts:
            if (abs(all_pts[-1][0] - pts[0][0]) < 0.5
                    and abs(all_pts[-1][1] - pts[0][1]) < 0.5):
                pts = pts[1:]
        all_pts.extend(pts)
    return all_pts


# ─── SVG element extraction ──────────────────────────────────

def _parse_transform(s: str | None):
    tx = ty = 0.0; sx = sy = 1.0
    if not s:
        return tx, ty, sx, sy
    m = re.search(r'translate\(\s*([-\d.]+)[,\s]+([-\d.]+)', s)
    if m: tx, ty = float(m.group(1)), float(m.group(2))
    m = re.search(r'scale\(\s*([-\d.]+)(?:[,\s]+([-\d.]+))?\s*\)', s)
    if m: sx = float(m.group(1)); sy = float(m.group(2)) if m.group(2) else sx
    return tx, ty, sx, sy


def _extract_paths(svg_text: str) -> tuple[list[tuple[str, tuple]], tuple]:
    root = ET.fromstring(svg_text)
    ns = root.tag.split("}")[0] + "}" if "}" in root.tag else ""

    vb = root.get("viewBox", "0 0 800 800")
    parts = [float(x) for x in vb.split()]
    viewbox = (parts[0], parts[1], parts[2], parts[3])

    results: list[tuple[str, tuple]] = []

    def walk(el, ptx=(0.0, 0.0, 1.0, 1.0)):
        t = _parse_transform(el.get("transform"))
        ct = (ptx[0] + t[0]*ptx[2], ptx[1] + t[1]*ptx[3],
              ptx[2]*t[2], ptx[3]*t[3])
        tag = el.tag.replace(ns, "")

        if tag == "path":
            d = el.get("d", "")
            if d: results.append((d, ct))
        elif tag == "line":
            x1, y1 = float(el.get("x1", 0)), float(el.get("y1", 0))
            x2, y2 = float(el.get("x2", 0)), float(el.get("y2", 0))
            results.append((f"M {x1},{y1} L {x2},{y2}", ct))
        elif tag == "circle":
            ccx, ccy = float(el.get("cx", 0)), float(el.get("cy", 0))
            r = float(el.get("r", 0))
            if r > 0:
                results.append((
                    f"M {ccx+r},{ccy} A {r},{r} 0 1 1 {ccx-r},{ccy} "
                    f"A {r},{r} 0 1 1 {ccx+r},{ccy} Z", ct
                ))
        elif tag == "ellipse":
            ecx, ecy = float(el.get("cx", 0)), float(el.get("cy", 0))
            erx, ery = float(el.get("rx", 0)), float(el.get("ry", 0))
            if erx > 0 and ery > 0:
                results.append((
                    f"M {ecx+erx},{ecy} A {erx},{ery} 0 1 1 {ecx-erx},{ecy} "
                    f"A {erx},{ery} 0 1 1 {ecx+erx},{ecy} Z", ct
                ))
        elif tag == "rect":
            rx, ry_ = float(el.get("x", 0)), float(el.get("y", 0))
            rw, rh = float(el.get("width", 0)), float(el.get("height", 0))
            if rw > 0 and rh > 0:
                results.append((
                    f"M {rx},{ry_} L {rx+rw},{ry_} L {rx+rw},{ry_+rh} "
                    f"L {rx},{ry_+rh} Z", ct
                ))
        elif tag in ("polyline", "polygon"):
            coords = re.findall(r'[-+]?(?:\d+\.?\d*|\.\d+)', el.get("points", ""))
            if len(coords) >= 4:
                d = f"M {coords[0]},{coords[1]}"
                for j in range(2, len(coords) - 1, 2):
                    d += f" L {coords[j]},{coords[j+1]}"
                if tag == "polygon": d += " Z"
                results.append((d, ct))

        for ch in el:
            walk(ch, ct)

    walk(root)
    return results, viewbox


# ─── Path optimisation (nearest-neighbour ordering) ──────────

def _optimise_order(paths: list[list[tuple[float, float]]]) -> list[int]:
    if not paths:
        return []
    rem = list(range(len(paths)))
    order = [rem.pop(0)]
    end = paths[order[0]][-1] if paths[order[0]] else (0.0, 0.0)

    while rem:
        best_i = None; best_d = float("inf"); best_rev = False
        for idx in rem:
            p = paths[idx]
            if not p: continue
            ds = (end[0]-p[0][0])**2 + (end[1]-p[0][1])**2
            de = (end[0]-p[-1][0])**2 + (end[1]-p[-1][1])**2
            if ds < best_d: best_d = ds; best_i = idx; best_rev = False
            if de < best_d: best_d = de; best_i = idx; best_rev = True
        if best_i is None: break
        if best_rev: paths[best_i] = list(reversed(paths[best_i]))
        order.append(best_i); rem.remove(best_i)
        end = paths[best_i][-1]

    return order


# ─── Theta continuity (unwrap) ───────────────────────────────

def _unwrap(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(pts) < 2:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts)):
        th, rh = pts[i]
        prev = out[-1][0]
        while th - prev > math.pi:  th -= 2 * math.pi
        while th - prev < -math.pi: th += 2 * math.pi
        out.append((th, rh))
    return out


# ═══════════════════════════════════════════════════════════════
#  PUBLIC API
# ═══════════════════════════════════════════════════════════════

@dataclass
class ConvertResult:
    output: str
    filename: str
    content_type: str
    stats: dict


def convert(
    svg_text: str,
    device: DeviceProfile,
    fit: str = "cover",
    samples: int = 16,
    max_rho_override: float | None = None,
    padding: float = 0.0,
) -> ConvertResult:
    """
    Convert SVG text to the device's native format entirely in memory.

    Parameters
    ----------
    svg_text : str
        Raw SVG file content.
    device : DeviceProfile
        Target sand table.
    fit : str
        "cover" — shorter dimension fills circle, corners may clip.
        "contain" — entire image fits inside circle, may leave empty space.
    samples : int
        Points per curve segment (higher = smoother, slower).
    max_rho_override : float | None
        Override device default max rho.
    padding : float
        Extra inward padding as fraction of radius.

    Returns
    -------
    ConvertResult with output text, suggested filename, and stats.
    """
    effective_rho = (max_rho_override or device.max_rho) - padding
    effective_rho = max(0.1, min(1.0, effective_rho))

    # 1. Parse SVG
    d_strings, _vb = _extract_paths(svg_text)

    # 2. Sample all paths
    all_lists: list[list[tuple[float, float]]] = []
    for d_str, (tx, ty, sx, sy) in d_strings:
        try:
            for sub in _parse_path(d_str):
                if not sub: continue
                pts = _sample_subpath(sub, samples)
                pts = [(x * sx + tx, y * sy + ty) for x, y in pts]
                if len(pts) >= 2:
                    all_lists.append(pts)
        except (ValueError, IndexError):
            continue

    if not all_lists:
        raise ValueError("No valid paths found in SVG.")

    # 3. Bounding box
    xs = [x for p in all_lists for x, _ in p]
    ys = [y for p in all_lists for _, y in p]
    mn_x, mx_x = min(xs), max(xs)
    mn_y, mx_y = min(ys), max(ys)
    cw, ch = mx_x - mn_x, mx_y - mn_y
    ccx, ccy = (mn_x + mx_x) / 2, (mn_y + mx_y) / 2

    # 4. Polar radius based on fit mode
    if device.shape == "circular":
        if fit == "cover":
            half_short = min(cw, ch) / 2
            polar_r = (half_short / effective_rho) if half_short > 0.001 else 1.0
        else:
            max_dist = max(
                math.hypot(x - ccx, y - ccy) for p in all_lists for x, y in p
            )
            polar_r = (max_dist / effective_rho) if max_dist > 0.001 else 1.0

        # 5. Optimise
        order = _optimise_order(all_lists)

        # 6. Convert to theta-rho
        tr: list[tuple[float, float]] = []
        for idx in order:
            for x, y in all_lists[idx]:
                dx, dy = x - ccx, y - ccy
                rho = min(math.hypot(dx, dy) / polar_r, effective_rho)
                theta = math.atan2(dy, dx) + math.pi / 2  # orientation fix
                tr.append((theta, rho))

        tr = _unwrap(tr)

        rhos = [r for _, r in tr]
        clipped = sum(1 for r in rhos if r >= effective_rho - 0.0001)

        buf = io.StringIO()
        buf.write(f"# SandPath converter\n")
        buf.write(f"# Device: {device.name}\n")
        buf.write(f"# Fit: {fit} | max_rho: {effective_rho}\n")
        buf.write(f"# Points: {len(tr)} | Subpaths: {len(all_lists)}\n")
        for th, rh in tr:
            buf.write(f"{th:.6f} {rh:.6f}\n")

        return ConvertResult(
            output=buf.getvalue(),
            filename="output.thr",
            content_type="text/plain",
            stats={
                "points": len(tr),
                "subpaths": len(all_lists),
                "fit": fit,
                "max_rho": effective_rho,
                "polar_radius": round(polar_r, 1),
                "content_size": f"{cw:.0f}×{ch:.0f}",
                "clipped_points": clipped,
            },
        )

    else:
        # Rectangular / G-code output
        scale_x = device.width_mm / cw if cw > 0 else 1
        scale_y = device.height_mm / ch if ch > 0 else 1
        if fit == "cover":
            scale = max(scale_x, scale_y)
        else:
            scale = min(scale_x, scale_y)

        order = _optimise_order(all_lists)

        buf = io.StringIO()
        buf.write("; SandPath G-code output\n")
        buf.write(f"; Device: {device.name}\n")
        buf.write(f"; Fit: {fit} | Scale: {scale:.4f}\n")
        buf.write("G90\nG21\n")  # absolute, mm
        buf.write(f"G0 X0 Y0 F3000\n")

        total_pts = 0
        for idx in order:
            pts = all_lists[idx]
            for j, (x, y) in enumerate(pts):
                gx = (x - ccx) * scale + device.width_mm / 2
                gy = (y - ccy) * scale + device.height_mm / 2
                gx = max(0, min(device.width_mm, gx))
                gy = max(0, min(device.height_mm, gy))
                cmd = "G0" if j == 0 else "G1"
                buf.write(f"{cmd} X{gx:.3f} Y{gy:.3f}\n")
                total_pts += 1

        buf.write("G0 X0 Y0\n")

        return ConvertResult(
            output=buf.getvalue(),
            filename="output.gcode",
            content_type="text/plain",
            stats={
                "points": total_pts,
                "subpaths": len(all_lists),
                "fit": fit,
                "scale": round(scale, 4),
                "content_size": f"{cw:.0f}×{ch:.0f}",
                "bed_size": f"{device.width_mm}×{device.height_mm}mm",
            },
        )
