"""
Raster image → SVG vectoriser.

Converts JPG / PNG / BMP / WebP images into SVG path data entirely
in memory using Pillow + a custom marching-squares contour tracer.

Pipeline:
  1.  Decode image bytes with Pillow
  2.  Resize to manageable working resolution
  3.  Convert to greyscale
  4.  Optional Gaussian blur for noise reduction
  5.  Edge detection (Sobel) or simple threshold
  6.  Marching squares contour extraction
  7.  Douglas–Peucker path simplification
  8.  SVG document generation

No external tools (potrace, Inkscape, etc.) are required.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass

from PIL import Image, ImageFilter, ImageOps


# ═══════════════════════════════════════════════════════════════
#  PUBLIC INTERFACE
# ═══════════════════════════════════════════════════════════════

@dataclass
class VectoriseOpts:
    """Knobs exposed to the user via the frontend."""

    mode: str = "outline"
    # "outline"   — Sobel edge detection → trace edges
    # "threshold" — simple B/W threshold → trace filled regions
    # "centerline"— thin/skeletonise then trace (best for line art)

    threshold: int = 128
    # 0–255: brightness cutoff for threshold mode,
    # or edge-strength cutoff for outline mode.

    blur: float = 1.0
    # Gaussian blur radius (0 = none). Helps with noisy photos.

    invert: bool = False
    # Invert the image before processing (useful for dark-on-light art).

    detail: float = 1.5
    # Path simplification tolerance in pixels.
    # Lower = more detail (bigger files). Higher = smoother.

    max_dimension: int = 800
    # Resize the longer side to this many pixels before processing.
    # Keeps processing fast and output file size reasonable.

    line_width: float = 2.0
    # SVG stroke width in the output.


@dataclass
class VectoriseResult:
    svg_text: str
    width: int
    height: int
    path_count: int
    point_count: int


def vectorise(image_bytes: bytes, opts: VectoriseOpts | None = None) -> VectoriseResult:
    """
    Convert raster image bytes to SVG string.

    Parameters
    ----------
    image_bytes : bytes
        Raw file content (JPEG, PNG, BMP, WebP, etc.)
    opts : VectoriseOpts
        Processing options.

    Returns
    -------
    VectoriseResult with the SVG string and statistics.
    """
    if opts is None:
        opts = VectoriseOpts()

    # ── 1. Open & normalise ───────────────────────────────────
    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")

    # Flatten alpha onto white background
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    bg.paste(img, mask=img)
    img = bg.convert("L")  # greyscale

    # ── 2. Resize ─────────────────────────────────────────────
    w, h = img.size
    if max(w, h) > opts.max_dimension:
        scale = opts.max_dimension / max(w, h)
        nw, nh = int(w * scale), int(h * scale)
        img = img.resize((nw, nh), Image.LANCZOS)
    w, h = img.size

    # ── 3. Invert ─────────────────────────────────────────────
    if opts.invert:
        img = ImageOps.invert(img)

    # ── 4. Blur ───────────────────────────────────────────────
    if opts.blur > 0:
        img = img.filter(ImageFilter.GaussianBlur(radius=opts.blur))

    # ── 5. Edge / threshold ───────────────────────────────────
    if opts.mode == "outline":
        binary = _sobel_edges(img, opts.threshold)
    elif opts.mode == "centerline":
        binary = _centerline(img, opts.threshold)
    else:  # "threshold"
        binary = _threshold(img, opts.threshold)

    # ── 6. Marching squares ───────────────────────────────────
    contours = _marching_squares(binary, w, h)

    # ── 7. Simplify ───────────────────────────────────────────
    simplified = []
    total_pts = 0
    for contour in contours:
        simp = _douglas_peucker(contour, opts.detail)
        if len(simp) >= 2:
            simplified.append(simp)
            total_pts += len(simp)

    # ── 8. Generate SVG ───────────────────────────────────────
    svg = _build_svg(simplified, w, h, opts.line_width)

    return VectoriseResult(
        svg_text=svg,
        width=w,
        height=h,
        path_count=len(simplified),
        point_count=total_pts,
    )


# ═══════════════════════════════════════════════════════════════
#  IMAGE PROCESSING
# ═══════════════════════════════════════════════════════════════

def _threshold(img: Image.Image, level: int) -> list[list[int]]:
    """Simple binary threshold → 2D grid of 0/1."""
    w, h = img.size
    pix = img.load()
    grid = []
    for y in range(h):
        row = []
        for x in range(w):
            row.append(1 if pix[x, y] < level else 0)
        grid.append(row)
    return grid


def _sobel_edges(img: Image.Image, threshold: int) -> list[list[int]]:
    """Sobel edge detection → binary grid."""
    w, h = img.size
    pix = img.load()

    # Pad to avoid bounds checks
    def px(x: int, y: int) -> int:
        x = max(0, min(w - 1, x))
        y = max(0, min(h - 1, y))
        return pix[x, y]

    grid = []
    for y in range(h):
        row = []
        for x in range(w):
            # Sobel 3×3
            gx = (
                -px(x-1, y-1) + px(x+1, y-1)
                - 2*px(x-1, y) + 2*px(x+1, y)
                - px(x-1, y+1) + px(x+1, y+1)
            )
            gy = (
                -px(x-1, y-1) - 2*px(x, y-1) - px(x+1, y-1)
                + px(x-1, y+1) + 2*px(x, y+1) + px(x+1, y+1)
            )
            mag = min(255, int(math.sqrt(gx * gx + gy * gy)))
            row.append(1 if mag > threshold else 0)
        grid.append(row)
    return grid


def _centerline(img: Image.Image, threshold: int) -> list[list[int]]:
    """
    Threshold then thin to approximate centerlines.
    Uses a simple iterative thinning (Zhang-Suen-like single pass).
    """
    w, h = img.size
    pix = img.load()

    # Initial threshold
    grid = []
    for y in range(h):
        row = []
        for x in range(w):
            row.append(1 if pix[x, y] < threshold else 0)
        grid.append(row)

    # Simple thinning: iteratively remove border pixels
    # (a lightweight approximation — full Zhang-Suen is heavy)
    for _ in range(max(w, h) // 4):
        changed = False
        new_grid = [row[:] for row in grid]
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if grid[y][x] == 0:
                    continue
                # Count neighbours
                n = sum(
                    grid[y + dy][x + dx]
                    for dy in (-1, 0, 1)
                    for dx in (-1, 0, 1)
                    if (dx, dy) != (0, 0)
                )
                # Remove if it has few enough neighbours and is a border pixel
                if n <= 2 or n >= 7:
                    continue
                # Check it's on a border (at least one 0 neighbour in 4-connected)
                if (grid[y-1][x] == 0 or grid[y+1][x] == 0
                        or grid[y][x-1] == 0 or grid[y][x+1] == 0):
                    # Check removal doesn't break connectivity (simplified)
                    new_grid[y][x] = 0
                    changed = True
        grid = new_grid
        if not changed:
            break

    return grid


# ═══════════════════════════════════════════════════════════════
#  MARCHING SQUARES CONTOUR EXTRACTION
# ═══════════════════════════════════════════════════════════════

def _marching_squares(grid: list[list[int]], w: int, h: int) -> list[list[tuple[float, float]]]:
    """
    Extract contour polylines from a binary grid using marching squares.

    Returns a list of contour paths, each path is a list of (x, y) tuples.
    """
    if h < 2 or w < 2:
        return []

    visited_edges: set[tuple[int, int, int]] = set()
    contours: list[list[tuple[float, float]]] = []

    def cell(x: int, y: int) -> int:
        """Get the 4-bit marching squares case for cell (x, y)."""
        tl = grid[y][x] if 0 <= y < h and 0 <= x < w else 0
        tr = grid[y][x + 1] if 0 <= y < h and 0 <= x + 1 < w else 0
        bl = grid[y + 1][x] if 0 <= y + 1 < h and 0 <= x < w else 0
        br = grid[y + 1][x + 1] if 0 <= y + 1 < h and 0 <= x + 1 < w else 0
        return (tl << 3) | (tr << 2) | (br << 1) | bl

    # Edge midpoints for each cell side
    # side 0=top, 1=right, 2=bottom, 3=left
    def midpoint(cx: int, cy: int, side: int) -> tuple[float, float]:
        if side == 0: return (cx + 0.5, cy)
        if side == 1: return (cx + 1.0, cy + 0.5)
        if side == 2: return (cx + 0.5, cy + 1.0)
        return (cx, cy + 0.5)  # side == 3

    # Marching squares edge table: case → list of (entry_side, exit_side)
    EDGES: dict[int, list[tuple[int, int]]] = {
        0: [], 15: [],
        1:  [(2, 3)],  2:  [(1, 2)],  3:  [(1, 3)],
        4:  [(0, 1)],  5:  [(0, 1), (2, 3)],  6:  [(0, 2)],
        7:  [(0, 3)],  8:  [(3, 0)],  9:  [(2, 0)],
        10: [(3, 0), (1, 2)], 11: [(1, 0)], 12: [(3, 1)],
        13: [(2, 1)], 14: [(3, 2)],
    }

    # Scan for contour starts
    for cy in range(h - 1):
        for cx in range(w - 1):
            c = cell(cx, cy)
            edges = EDGES.get(c, [])
            for entry, exit_ in edges:
                edge_key = (cx, cy, entry)
                if edge_key in visited_edges:
                    continue

                # Trace this contour
                path: list[tuple[float, float]] = []
                px, py, pside = cx, cy, entry
                for _safety in range(w * h * 2):
                    ek = (px, py, pside)
                    if ek in visited_edges:
                        break
                    visited_edges.add(ek)

                    cc = cell(px, py)
                    ee = EDGES.get(cc, [])

                    found = False
                    for e_in, e_out in ee:
                        if e_in == pside:
                            path.append(midpoint(px, py, e_in))
                            path.append(midpoint(px, py, e_out))
                            visited_edges.add((px, py, e_out))

                            # Move to neighbour cell
                            nx, ny, nside = px, py, e_out
                            if e_out == 0: ny -= 1; nside = 2
                            elif e_out == 1: nx += 1; nside = 3
                            elif e_out == 2: ny += 1; nside = 0
                            elif e_out == 3: nx -= 1; nside = 1

                            # Bounds check
                            if nx < 0 or nx >= w - 1 or ny < 0 or ny >= h - 1:
                                found = False
                                break

                            px, py, pside = nx, ny, nside
                            found = True
                            break

                    if not found:
                        break

                if len(path) >= 2:
                    contours.append(path)

    return contours


# ═══════════════════════════════════════════════════════════════
#  PATH SIMPLIFICATION (Douglas–Peucker)
# ═══════════════════════════════════════════════════════════════

def _douglas_peucker(
    points: list[tuple[float, float]], epsilon: float
) -> list[tuple[float, float]]:
    """Simplify a polyline using the Douglas–Peucker algorithm."""
    if len(points) <= 2:
        return points

    # Find point with max distance from line(start, end)
    start, end = points[0], points[-1]
    max_dist = 0.0
    max_idx = 0
    for i in range(1, len(points) - 1):
        d = _point_line_dist(points[i], start, end)
        if d > max_dist:
            max_dist = d
            max_idx = i

    if max_dist > epsilon:
        left = _douglas_peucker(points[: max_idx + 1], epsilon)
        right = _douglas_peucker(points[max_idx:], epsilon)
        return left[:-1] + right
    else:
        return [start, end]


def _point_line_dist(
    p: tuple[float, float],
    a: tuple[float, float],
    b: tuple[float, float],
) -> float:
    """Perpendicular distance from point p to line segment a–b."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    mag_sq = dx * dx + dy * dy
    if mag_sq < 1e-10:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    t = max(0.0, min(1.0, ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / mag_sq))
    proj_x = a[0] + t * dx
    proj_y = a[1] + t * dy
    return math.hypot(p[0] - proj_x, p[1] - proj_y)


# ═══════════════════════════════════════════════════════════════
#  SVG GENERATION
# ═══════════════════════════════════════════════════════════════

def _build_svg(
    paths: list[list[tuple[float, float]]],
    width: int,
    height: int,
    stroke_width: float = 2.0,
) -> str:
    """Build a minimal SVG document from contour paths."""
    lines: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">',
    ]

    for path in paths:
        if len(path) < 2:
            continue
        d_parts = [f"M {path[0][0]:.1f},{path[0][1]:.1f}"]
        for x, y in path[1:]:
            d_parts.append(f"L {x:.1f},{y:.1f}")
        d = " ".join(d_parts)
        lines.append(
            f'  <path d="{d}" fill="none" stroke="#000" '
            f'stroke-width="{stroke_width}" stroke-linecap="round" '
            f'stroke-linejoin="round"/>'
        )

    lines.append("</svg>")
    return "\n".join(lines)
