/**
 * HoloPath — Layout compositor (client-side).
 *
 * Supports 5 output layouts for different hologram hardware:
 *   pyramid4      — 4 copies for 4-sided glass pyramid (360°)
 *   pyramid3      — 3 copies for 3-sided showcase (270°)
 *   fan           — Circular crop for LED hologram fan / POV
 *   peppers_ghost — Lower-centre of 16:9 black canvas
 *   single        — No compositing, direct output
 *
 * All compositing uses offscreen Canvas 2D.
 */

// ─── Types ──────────────────────────────────────────

export type LayoutMode = "pyramid4" | "pyramid3" | "fan" | "peppers_ghost" | "single";

export const LAYOUT_INFO: Record<LayoutMode, { label: string; description: string }> = {
  pyramid4: {
    label: "Pyramid 360°",
    description: "4 views for 4-sided pyramid projectors",
  },
  pyramid3: {
    label: "Pyramid 270°",
    description: "3 views for 3-sided showcase displays",
  },
  fan: {
    label: "Hologram Fan",
    description: "Circular crop for LED fan / POV displays",
  },
  peppers_ghost: {
    label: "Pepper's Ghost",
    description: "Single view for 45° glass reflectors",
  },
  single: {
    label: "Single Image",
    description: "No layout — direct hologram output",
  },
};

// ─── Constants (match Python version) ───────────────

const INSET_RATIO = 0.08;
const GHOST_VERTICAL = 0.55;

// ─── Helpers ────────────────────────────────────────

function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return [c, ctx];
}

/** Convert ImageData to a canvas for drawing operations. */
function imageDataToCanvas(data: ImageData): HTMLCanvasElement {
  const [c, ctx] = createCanvas(data.width, data.height);
  ctx.putImageData(data, 0, 0);
  return c;
}

/** Fit frame within max_size maintaining aspect ratio. */
function fitSubject(
  srcCanvas: HTMLCanvasElement,
  maxSize: number,
): HTMLCanvasElement {
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;
  const scale = Math.min(maxSize / sw, maxSize / sh);
  const nw = Math.max(1, Math.round(sw * scale));
  const nh = Math.max(1, Math.round(sh * scale));
  const [c, ctx] = createCanvas(nw, nh);
  ctx.drawImage(srcCanvas, 0, 0, nw, nh);
  return c;
}

/** Draw a canvas rotated by degrees around its centre, onto target canvas at (x, y). */
function drawRotated(
  target: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  x: number,
  y: number,
  degrees: number,
): void {
  const rad = degrees * Math.PI / 180;
  target.save();
  target.translate(x + src.width / 2, y + src.height / 2);
  target.rotate(rad);
  target.drawImage(src, -src.width / 2, -src.height / 2);
  target.restore();
}

// ─── Layout composers ───────────────────────────────

function composePyramid4(frame: ImageData, outputSize: number): ImageData {
  const [, ctx] = createCanvas(outputSize, outputSize);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, outputSize, outputSize);

  const srcCanvas = imageDataToCanvas(frame);
  const inset = Math.round(outputSize * 0.03);
  const cx = outputSize / 2;
  const cy = outputSize / 2;
  const sep = 1; // 1px separator at center cross

  // Size subject to fill ~88% of the half-canvas (minus inset).
  // Clipping prevents any overlap between quadrants.
  const quadrantMax = Math.round((outputSize / 2 - inset) * 0.88);
  const subject = fitSubject(srcCanvas, quadrantMax);
  const fw = subject.width;
  const fh = subject.height;

  // Top: upright, clipped to upper half
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, outputSize, cy - sep);
  ctx.clip();
  ctx.drawImage(subject, Math.round(cx - fw / 2), inset);
  ctx.restore();

  // Bottom: rotated 180°, clipped to lower half
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cy + sep, outputSize, cy - sep);
  ctx.clip();
  drawRotated(ctx, subject,
    Math.round(cx - fw / 2),
    outputSize - fh - inset,
    180,
  );
  ctx.restore();

  // Left: rotated -90°, clipped to left half
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, cx - sep, outputSize);
  ctx.clip();
  ctx.translate(inset + fh / 2, cy);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(subject, -fw / 2, -fh / 2);
  ctx.restore();

  // Right: rotated +90°, clipped to right half
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx + sep, 0, cx - sep, outputSize);
  ctx.clip();
  ctx.translate(outputSize - inset - fh / 2, cy);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(subject, -fw / 2, -fh / 2);
  ctx.restore();

  return ctx.getImageData(0, 0, outputSize, outputSize);
}

function composePyramid3(frame: ImageData, outputSize: number): ImageData {
  const [, ctx] = createCanvas(outputSize, outputSize);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, outputSize, outputSize);

  const insetPx = Math.round(outputSize * INSET_RATIO);
  const maxSubject = Math.round((outputSize - insetPx * 2) * 0.42);
  const subjectSize = maxSubject;
  const srcCanvas = imageDataToCanvas(frame);
  const subject = fitSubject(srcCanvas, subjectSize);
  const cx = outputSize / 2;

  // Top-centre: normal
  ctx.drawImage(subject, Math.round(cx - subject.width / 2), insetPx);

  // Bottom-left: -120°
  const blX = Math.round(outputSize * 0.12);
  const blY = outputSize - subject.height - insetPx;
  drawRotated(ctx, subject, blX, blY, -120);

  // Bottom-right: +120°
  const brX = outputSize - subject.width - Math.round(outputSize * 0.12);
  const brY = outputSize - subject.height - insetPx;
  drawRotated(ctx, subject, brX, brY, 120);

  return ctx.getImageData(0, 0, outputSize, outputSize);
}

function composeFan(frame: ImageData, outputSize: number): ImageData {
  const [, ctx] = createCanvas(outputSize, outputSize);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, outputSize, outputSize);

  // Subject fills ~75% of circle diameter
  const subjectDiam = Math.round(outputSize * 0.75);
  const srcCanvas = imageDataToCanvas(frame);
  const subject = fitSubject(srcCanvas, subjectDiam);

  // Paste centred
  const sx = Math.round(outputSize / 2 - subject.width / 2);
  const sy = Math.round(outputSize / 2 - subject.height / 2);
  ctx.drawImage(subject, sx, sy);

  // Apply circular mask
  const margin = Math.round(outputSize * 0.05);
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = outputSize;
  maskCanvas.height = outputSize;
  const maskCtx = maskCanvas.getContext("2d")!;

  // Draw circle on mask
  maskCtx.fillStyle = "#fff";
  maskCtx.beginPath();
  maskCtx.arc(
    outputSize / 2, outputSize / 2,
    (outputSize - margin * 2) / 2,
    0, Math.PI * 2,
  );
  maskCtx.fill();

  // Apply mask: set alpha to 0 outside circle
  const canvasData = ctx.getImageData(0, 0, outputSize, outputSize);
  const maskData = maskCtx.getImageData(0, 0, outputSize, outputSize);
  for (let i = 0; i < canvasData.data.length; i += 4) {
    if (maskData.data[i] === 0) {
      canvasData.data[i] = 0;
      canvasData.data[i + 1] = 0;
      canvasData.data[i + 2] = 0;
    }
  }

  return canvasData;
}

function composePeppersGhost(frame: ImageData, outputSize: number): ImageData {
  const outW = outputSize;
  const outH = Math.round(outputSize * 9 / 16); // 16:9 landscape
  const [, ctx] = createCanvas(outW, outH);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, outW, outH);

  const srcCanvas = imageDataToCanvas(frame);

  // Subject fills lower portion
  let subjectH = Math.round(outH * GHOST_VERTICAL);
  let subjectW = Math.round(subjectH * frame.width / frame.height);
  if (subjectW > Math.round(outW * 0.8)) {
    subjectW = Math.round(outW * 0.8);
    subjectH = Math.round(subjectW * frame.height / frame.width);
  }

  const sx = Math.round((outW - subjectW) / 2);
  const sy = outH - subjectH - Math.round(outH * 0.05);
  ctx.drawImage(srcCanvas, sx, sy, subjectW, subjectH);

  return ctx.getImageData(0, 0, outW, outH);
}

function composeSingle(frame: ImageData, outputSize: number): ImageData {
  const srcCanvas = imageDataToCanvas(frame);
  const fitted = fitSubject(srcCanvas, outputSize);
  const ctx = fitted.getContext("2d")!;
  return ctx.getImageData(0, 0, fitted.width, fitted.height);
}

// ─── Public API ─────────────────────────────────────

const COMPOSERS: Record<LayoutMode, (f: ImageData, s: number) => ImageData> = {
  pyramid4: composePyramid4,
  pyramid3: composePyramid3,
  fan: composeFan,
  peppers_ghost: composePeppersGhost,
  single: composeSingle,
};

/**
 * Apply the chosen layout to a hologrammed frame.
 */
export function composeLayout(
  frame: ImageData,
  layout: LayoutMode = "pyramid4",
  outputSize: number = 720,
): ImageData {
  return COMPOSERS[layout](frame, outputSize);
}
