/* ═══════════════════════════════════════════════════════
   ForgeImage — pure engine: dimension math, crop bounds,
   format tables, target-size search, social presets.
   Canvas/DOM wiring lives in app.ts; everything here is
   testable without a browser.
   ═══════════════════════════════════════════════════════ */

export interface Dims {
  w: number;
  h: number;
}

/** Resize request: exactly one of the sizing modes applies. */
export interface ResizeSpec {
  width?: number;
  height?: number;
  percent?: number;
  /** keep aspect ratio when only one of width/height is given (default true) */
  lock?: boolean;
}

export function resizeDims(src: Dims, spec: ResizeSpec): Dims {
  const lock = spec.lock !== false;
  if (spec.percent !== undefined) {
    const f = Math.max(spec.percent, 0.01) / 100;
    return { w: Math.max(1, Math.round(src.w * f)), h: Math.max(1, Math.round(src.h * f)) };
  }
  let { width, height } = spec;
  if (width !== undefined && height !== undefined && !lock) {
    return { w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(height)) };
  }
  if (width !== undefined && (height === undefined || lock)) {
    const w = Math.max(1, Math.round(width));
    return { w, h: Math.max(1, Math.round((w * src.h) / src.w)) };
  }
  if (height !== undefined) {
    const h = Math.max(1, Math.round(height));
    return { w: Math.max(1, Math.round((h * src.w) / src.h)), h };
  }
  return { ...src };
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Clamp a crop rectangle inside the image, preserving size where possible. */
export function clampCrop(rect: CropRect, img: Dims): CropRect {
  const w = Math.min(Math.max(1, Math.round(rect.w)), img.w);
  const h = Math.min(Math.max(1, Math.round(rect.h)), img.h);
  const x = Math.min(Math.max(0, Math.round(rect.x)), img.w - w);
  const y = Math.min(Math.max(0, Math.round(rect.y)), img.h - h);
  return { x, y, w, h };
}

/** Largest centered crop of the given aspect ratio (w:h) inside the image. */
export function centeredAspectCrop(img: Dims, aspectW: number, aspectH: number): CropRect {
  const target = aspectW / aspectH;
  let w = img.w;
  let h = Math.round(w / target);
  if (h > img.h) {
    h = img.h;
    w = Math.round(h * target);
  }
  return { x: Math.round((img.w - w) / 2), y: Math.round((img.h - h) / 2), w, h };
}

export const ASPECT_PRESETS: ReadonlyArray<{ id: string; label: string; w: number; h: number }> = [
  { id: "square", label: "1:1", w: 1, h: 1 },
  { id: "landscape", label: "4:3", w: 4, h: 3 },
  { id: "wide", label: "16:9", w: 16, h: 9 },
  { id: "story", label: "9:16", w: 9, h: 16 },
];

/** Output formats Canvas.toBlob can encode everywhere that matters. */
export const FORMATS: ReadonlyArray<{ id: string; label: string; mime: string; lossy: boolean; ext: string }> = [
  { id: "jpeg", label: "JPEG", mime: "image/jpeg", lossy: true, ext: "jpg" },
  { id: "png", label: "PNG", mime: "image/png", lossy: false, ext: "png" },
  { id: "webp", label: "WebP", mime: "image/webp", lossy: true, ext: "webp" },
];

export const SOCIAL_PRESETS: ReadonlyArray<{ id: string; label: string; w: number; h: number }> = [
  { id: "ig-post", label: "Instagram Post", w: 1080, h: 1080 },
  { id: "ig-story", label: "Instagram Story", w: 1080, h: 1920 },
  { id: "x-header", label: "X / Twitter Header", w: 1500, h: 500 },
  { id: "fb-cover", label: "Facebook Cover", w: 820, h: 312 },
  { id: "li-banner", label: "LinkedIn Banner", w: 1584, h: 396 },
  { id: "yt-thumb", label: "YouTube Thumbnail", w: 1280, h: 720 },
  { id: "og-image", label: "OG Image", w: 1200, h: 630 },
];

/**
 * Cover-crop then scale: the source is cropped (centered) to the target
 * aspect, so presets never letterbox or distort. Returns the source crop
 * rect to draw from.
 */
export function coverCropForPreset(img: Dims, preset: Dims): CropRect {
  return centeredAspectCrop(img, preset.w, preset.h);
}

/**
 * Find the highest encode quality whose output fits under targetBytes.
 * `sizeAt` encodes at a quality in [0.05, 0.95] and reports the byte size.
 * Binary search, ≤ `maxIters` encodes. Returns the chosen quality and its
 * size, or null when even the lowest quality is too large.
 */
export async function targetSizeQuality(
  sizeAt: (quality: number) => Promise<number>,
  targetBytes: number,
  maxIters = 7,
): Promise<{ quality: number; bytes: number } | null> {
  let lo = 0.05;
  let hi = 0.95;
  const atLo = await sizeAt(lo);
  if (atLo > targetBytes) return null;
  let best = { quality: lo, bytes: atLo };
  for (let i = 0; i < maxIters; i++) {
    const mid = (lo + hi) / 2;
    const bytes = await sizeAt(mid);
    if (bytes <= targetBytes) {
      best = { quality: mid, bytes };
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/* ── interactive crop + preview geometry ── */

/** Scale dims to fit inside a box, never upscaling. */
export function fitWithin(src: Dims, maxW: number, maxH: number): Dims & { scale: number } {
  const scale = Math.min(maxW / src.w, maxH / src.h, 1);
  return { w: Math.max(1, Math.round(src.w * scale)), h: Math.max(1, Math.round(src.h * scale)), scale };
}

export type CropHandle = "nw" | "ne" | "sw" | "se" | "move";

/**
 * Apply a pointer drag (in IMAGE pixels) to a crop rect. Corner handles
 * resize (respecting an optional aspect w/h constraint, min 16px); "move"
 * translates. Result is clamped inside the image.
 */
export function dragCropRect(
  rect: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  img: Dims,
  aspect: { w: number; h: number } | null = null,
): CropRect {
  const MIN = 16;
  if (handle === "move") {
    return clampCrop({ ...rect, x: rect.x + dx, y: rect.y + dy }, img);
  }
  // Anchor is the corner opposite the handle; the dragged corner follows the pointer.
  const left = rect.x;
  const top = rect.y;
  const rightEdge = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  const anchor = {
    nw: { x: rightEdge, y: bottom },
    ne: { x: left, y: bottom },
    sw: { x: rightEdge, y: top },
    se: { x: left, y: top },
  }[handle];
  const corner = {
    nw: { x: left + dx, y: top + dy },
    ne: { x: rightEdge + dx, y: top + dy },
    sw: { x: left + dx, y: bottom + dy },
    se: { x: rightEdge + dx, y: bottom + dy },
  }[handle];

  let w = Math.max(MIN, Math.abs(corner.x - anchor.x));
  let h = Math.max(MIN, Math.abs(corner.y - anchor.y));
  if (aspect) {
    const target = aspect.w / aspect.h;
    // Follow the dominant axis of the drag, derive the other.
    if (w / h > target) h = w / target;
    else w = h * target;
  }
  // Rebuild the rect from the anchor toward the dragged corner's direction.
  const dirX = corner.x >= anchor.x ? 1 : -1;
  const dirY = corner.y >= anchor.y ? 1 : -1;
  let x = dirX === 1 ? anchor.x : anchor.x - w;
  let y = dirY === 1 ? anchor.y : anchor.y - h;
  // Clamp size so the anchored corner stays fixed inside the image.
  const maxW2 = dirX === 1 ? img.w - anchor.x : anchor.x;
  const maxH2 = dirY === 1 ? img.h - anchor.y : anchor.y;
  let scaleBack = Math.min(1, maxW2 / w, maxH2 / h);
  if (!aspect) {
    w = Math.min(w, maxW2);
    h = Math.min(h, maxH2);
  } else {
    w *= scaleBack;
    h *= scaleBack;
  }
  w = Math.max(MIN, w);
  h = Math.max(MIN, h);
  x = dirX === 1 ? anchor.x : anchor.x - w;
  y = dirY === 1 ? anchor.y : anchor.y - h;
  return clampCrop({ x, y, w, h }, img);
}

/* ── brush strokes ── */

export interface BrushPoint {
  x: number;
  y: number;
}

/** One brush stroke, in IMAGE pixels (size = diameter). */
export interface BrushStroke {
  size: number;
  color: string;
  points: BrushPoint[];
}

/** Map a stage-space point to image space, clamped inside the image. */
export function stageToImagePoint(x: number, y: number, scale: number, img: Dims): BrushPoint {
  if (scale <= 0) return { x: 0, y: 0 };
  return {
    x: Math.min(Math.max(x / scale, 0), img.w),
    y: Math.min(Math.max(y / scale, 0), img.h),
  };
}

/** Density control: append a point only when it moved at least minDist. */
export function farEnough(prev: BrushPoint | undefined, next: BrushPoint, minDist: number): boolean {
  if (!prev) return true;
  return (prev.x - next.x) ** 2 + (prev.y - next.y) ** 2 >= minDist * minDist;
}

/** Default brush diameter for an image: ~1/25 of the short side. */
export function defaultBrushSize(img: Dims): number {
  return Math.max(4, Math.round(Math.min(img.w, img.h) / 25));
}

/** Brush slider maximum: half the short side (at least 64 px). */
export function maxBrushSize(img: Dims): number {
  return Math.max(64, Math.round(Math.min(img.w, img.h) / 2));
}

/** Which handle (if any) a display-space point hits; tolerance in px. */
export function hitCropHandle(
  px: number,
  py: number,
  rect: CropRect,
  tol: number,
): CropHandle | null {
  const corners: Array<[CropHandle, number, number]> = [
    ["nw", rect.x, rect.y],
    ["ne", rect.x + rect.w, rect.y],
    ["sw", rect.x, rect.y + rect.h],
    ["se", rect.x + rect.w, rect.y + rect.h],
  ];
  for (const [h, cx, cy] of corners) {
    if (Math.abs(px - cx) <= tol && Math.abs(py - cy) <= tol) return h;
  }
  if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) return "move";
  return null;
}
