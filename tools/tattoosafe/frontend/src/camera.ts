/**
 * TattooSafe — tier-1 camera preview.
 *
 * Live camera feed on a canvas with the uploaded design composited on top.
 * Manual placement: drag to move, pinch (or wheel) to resize, existing
 * rotation/opacity sliders apply live. No body tracking — the user lines
 * the design up against their own reflection, then screenshots it.
 *
 * Scale: a camera can't measure distance, so until the user calibrates,
 * the frame is assumed to be DEFAULT_FRAME_WIDTH_CM across and the hint
 * calls the size approximate. Calibration matches an on-screen outline to
 * a bank or ID card (ISO/IEC 7810 ID-1, 85.60 × 53.98 mm) held flat on the
 * skin, which gives the frame's real width at that distance. After that,
 * pinch resizes the tattoo itself (in cm, through onResize) instead of
 * zooming the picture, so the size panel and price follow.
 *
 * Pure geometry helpers are exported for unit tests; DOM/media wiring is
 * in setupCameraPreview().
 */

import { removeFlatBackground, invertForDarkBackdrop, getBodyPart, MIN_TATTOO_CM, MAX_TATTOO_CM } from "./engine";
import {
  AR_PLACEMENTS, MASK_CLASS, OneEuro, canvasToVideo, computeAnchor, isLimb, maskRunWidth, pickSide,
  unwrapAngle, videoToCanvas, wrapSpanFor, type Anchor, type Crop, type Pt, type Side,
} from "./ar-anchor";
// Type-only: the runtime chunk loads when the visitor turns Full AR on.
import type { Tracker, TrackerOutput } from "./ar-tracking";

// ─── Overlay state & pure helpers ────────────────────────────

export interface OverlayState {
  /** Center of the design, in canvas pixels. */
  x: number;
  y: number;
  /** Multiplier applied to the design's base size. */
  scale: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;

/** Assumed real width of the camera frame until the user calibrates, cm. */
export const DEFAULT_FRAME_WIDTH_CM = 50;
/** ID-1 card (bank card, driving licence): 85.60 × 53.98 mm, 3.18 mm corners. */
export const CARD_W_CM = 8.56;
export const CARD_H_CM = 5.398;
export const CARD_RADIUS_CM = 0.318;

/** Keep the overlay center inside the canvas so it can't be lost off-screen. */
export function clampCenter(x: number, y: number, canvasW: number, canvasH: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, 0), canvasW),
    y: Math.min(Math.max(y, 0), canvasH),
  };
}

/** New scale after a pinch: ratio of current to initial finger distance. */
export function pinchScale(baseScale: number, startDist: number, currentDist: number): number {
  if (startDist <= 0) return baseScale;
  const s = baseScale * (currentDist / startDist);
  return Math.min(Math.max(s, MIN_SCALE), MAX_SCALE);
}

/** New scale after a wheel step (negative deltaY = zoom in). */
export function wheelScale(baseScale: number, deltaY: number): number {
  const s = baseScale * (deltaY < 0 ? 1.1 : 1 / 1.1);
  return Math.min(Math.max(s, MIN_SCALE), MAX_SCALE);
}

/** Drawn size of the design for a given state, preserving aspect ratio. */
export function drawSize(imgW: number, imgH: number, canvasW: number, scale: number): { w: number; h: number } {
  // Base size: design occupies 1/3 of the canvas width at scale 1.
  const baseW = canvasW / 3;
  const w = baseW * scale;
  return { w, h: imgH > 0 && imgW > 0 ? (w * imgH) / imgW : w };
}

/**
 * On-screen size of the design, in canvas px. With a real-world size, the
 * tattoo's width is mapped onto the frame's width in cm (assumed until
 * calibrated); without one, drawSize's image-based default applies.
 * `scale` is the free zoom used before calibration (1 after it).
 */
export function overlaySize(
  canvasW: number, frameWidthCm: number, wCm: number, hCm: number,
  imgW: number, imgH: number, scale: number
): { w: number; h: number } {
  if (wCm > 0 && frameWidthCm > 0) {
    const w = canvasW * (wCm / frameWidthCm) * scale;
    const h = hCm > 0 ? (w * hCm) / wCm : imgW > 0 && imgH > 0 ? (w * imgH) / imgW : w;
    return { w, h };
  }
  return drawSize(imgW, imgH, canvasW, scale);
}

/** Real width of the whole frame, given the matched card outline's width in canvas px. */
export function frameWidthFromCard(canvasW: number, cardPx: number): number {
  return cardPx > 0 ? (CARD_W_CM * canvasW) / cardPx : NaN;
}

/**
 * Scale a w×h size by f, keeping its proportions and both sides within
 * [min, max]. Used when pinch resizes a calibrated tattoo.
 */
export function scaleSize(w: number, h: number, f: number, min: number, max: number): { w: number; h: number } {
  if (!(w > 0 && h > 0) || !Number.isFinite(f)) return { w, h };
  const lo = Math.max(min / w, min / h);
  const hi = Math.min(max / w, max / h);
  const k = Math.min(Math.max(f, lo), Math.max(lo, hi));
  return { w: w * k, h: h * k };
}

/** The status line under the canvas. */
export function cameraHint(o: { calibrating: boolean; calibrated: boolean; sizeLabel: string }): string {
  if (o.calibrating) {
    return "Hold a bank or ID card flat on your skin where the tattoo will go. " +
      "Drag the outline onto the card and resize it until the edges line up, then tap Done.";
  }
  const size = o.sizeLabel ? `${o.sizeLabel} · ` : "";
  return o.calibrated
    ? `${size}true size at the distance you calibrated · drag to move · pinch or scroll to resize`
    : `${size}approximate size until you calibrate with a card · drag to move · pinch or scroll to zoom`;
}

export interface WrapStrip {
  /** Source x range, in design pixels. */
  u0: number;
  u1: number;
  /** Destination x range, centered on 0, in display pixels. */
  x0: number;
  x1: number;
}

/** On-screen width of a design dispW wide wrapped over `span` radians of a cylinder. */
export function wrapProjectedWidth(dispW: number, span: number): number {
  const sp = Math.min(Math.max(span, 0.02), Math.PI);
  return 2 * (dispW / sp) * Math.sin(sp / 2);
}

/**
 * Cylindrical wrap geometry. The flat design (srcW px wide, displayed at
 * dispW px when flat) wraps the front half of a cylinder whose
 * half-circumference equals the flat display width, viewed straight on:
 *   dest x = R·sin(θ),  source u = (θ + π/2)/π · srcW,  R = dispW/π
 * So the projected on-screen width shrinks to dispW·2/π, the center stays
 * 1:1, and the edges compress toward zero — the actual foreshortening a
 * wrapped design has. Destination strips are contiguous (seam-free) and
 * the source ranges cover the design exactly.
 */
export function computeWrapStrips(
  srcW: number, dispW: number, strips: number, span: number = Math.PI
): { projW: number; strips: WrapStrip[] } {
  // The design (arc length dispW) wraps `span` radians of a cylinder:
  //   R = dispW / span,  dest x = R·sin(θ),  θ ∈ [−span/2, span/2]
  // span→0 degenerates to flat (projW → dispW); span=π is a half wrap.
  const sp = Math.min(Math.max(span, 0.02), Math.PI);
  const R = dispW / sp;
  const projW = wrapProjectedWidth(dispW, sp);
  const X = projW / 2;
  const out: WrapStrip[] = [];
  for (let i = 0; i < strips; i++) {
    const x0 = -X + (projW * i) / strips;
    const x1 = -X + (projW * (i + 1)) / strips;
    const th0 = Math.asin(Math.max(-1, Math.min(1, x0 / R)));
    const th1 = Math.asin(Math.max(-1, Math.min(1, x1 / R)));
    out.push({
      u0: ((th0 + sp / 2) / sp) * srcW,
      u1: ((th1 + sp / 2) / sp) * srcW,
      x0,
      x1,
    });
  }
  return { projW, strips: out };
}

/** Lambertian-ish shade at normalized stage position t∈[0,1] for a wrap of `span` radians. */
export function wrapShadeAt(t: number, span: number): number {
  const sp = Math.min(Math.max(span, 0.02), Math.PI);
  const theta = Math.asin((2 * t - 1) * Math.sin(sp / 2));
  return Math.max(Math.cos(theta), 0.25);
}

/**
 * Is a canvas point inside the (rotated) overlay, drawn w×h px at the
 * state's center? Used to decide whether a pointer-down starts a drag.
 * Rotation in degrees, matching the UI slider.
 */
export function hitTest(
  px: number, py: number,
  state: { x: number; y: number }, w: number, h: number, rotationDeg: number
): boolean {
  const rad = (-rotationDeg * Math.PI) / 180;
  // Transform the point into the overlay's local (unrotated) space.
  const dx = px - state.x;
  const dy = py - state.y;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
}

/** Cover-fit source rectangle: crop the video so it fills the canvas. */
export function coverCrop(
  srcW: number, srcH: number, dstW: number, dstH: number
): { sx: number; sy: number; sw: number; sh: number } {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) return { sx: 0, sy: 0, sw: srcW, sh: srcH };
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio > dstRatio) {
    const sw = srcH * dstRatio;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  const sh = srcW / dstRatio;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

// ─── DOM / camera wiring ─────────────────────────────────────

interface CameraRefs {
  section: HTMLElement;
  canvas: HTMLCanvasElement;
  startBtn: HTMLButtonElement;
  stopBtn: HTMLButtonElement;
  shotBtn: HTMLButtonElement;
  hint: HTMLElement;
}

export interface CameraController {
  /** Give the preview the (new) design image. Enables the start buttons. */
  setDesign(img: HTMLImageElement): void;
  /**
   * Reflect the size panel: real-world dimensions in cm (they drive the
   * overlay's size) and the size as the page displays it, for the hint.
   */
  setTattooSize(wCm: number, hCm: number, sizeLabel: string): void;
  /** The placement Full AR follows, and the height its scale comes from. */
  setPlacement(id: string, heightCm: number): void;
  /**
   * Turn on Full AR: switch to the front camera and load the tracker
   * (`load` imports the runtime chunk and reports download progress).
   */
  startAr(load: (onProgress: (loaded: number, total: number) => void) => Promise<Tracker>): Promise<void>;
  /** Back to the standard preview; the camera keeps running. */
  stopAr(): void;
  /** True while the camera is streaming. */
  isActive(): boolean;
}

/** Full AR state while it is on. */
interface ArSession {
  tracker: Tracker;
  /** Side being followed (auto-picked unless the visitor chose one). */
  side: Side | null;
  /** Smoothed anchor, canvas px; null while the body is out of view. */
  anchor: Anchor | null;
  lastSeen: number;
  lastVideoTime: number;
  frame: number;
  /** Visitor's nudge from the anchor, cm: u across the limb, v down it. */
  offset: { u: number; v: number };
  /** Limb width at the anchor, canvas px, from the mask (drives the wrap). */
  limbWidth: number | null;
  mask: TrackerOutput["mask"];
  /** Skin pixels opaque, everything else clear, at mask resolution. */
  skin: HTMLCanvasElement | null;
  skinImg: ImageData | null;
  filters: { x: OneEuro; y: OneEuro; angle: OneEuro; scale: OneEuro; fore: OneEuro; width: OneEuro };
}

/** A body part on screen for longer than this without being found is "lost". */
const AR_LOST_MS = 600;
/** How far the design can be nudged from its anchor, cm. */
const AR_MAX_OFFSET_CM = 30;
const AR_PLACEMENT_LIST = "inner or outer forearm, upper arm, shoulder, chest, sternum, thigh or calf";

export function setupCameraPreview(
  getRotation: () => number,
  getOpacity: () => number,
  onError: (msg: string) => void,
  /** Pinch on a calibrated or tracked preview resizes the tattoo: new size in cm. */
  onResize?: (wCm: number, hCm: number) => void
): CameraController | null {
  const $ = (sel: string) => document.querySelector(sel);
  const refs: CameraRefs = {
    section: $("#ar-section") as HTMLElement,
    canvas: $("#ar-canvas") as HTMLCanvasElement,
    startBtn: $("#ar-start") as HTMLButtonElement,
    stopBtn: $("#ar-stop") as HTMLButtonElement,
    shotBtn: $("#ar-screenshot") as HTMLButtonElement,
    hint: $("#ar-hint") as HTMLElement,
  };
  if (!refs.section || !refs.canvas || !refs.startBtn) return null;

  const ctx = refs.canvas.getContext("2d");
  if (!ctx) return null;

  let design: HTMLImageElement | null = null;
  let tattooWCm = 0;
  let tattooHCm = 0;
  let sizeLabel = "";
  let placementId = "";
  let heightCm = 170;
  const wrapToggle = document.querySelector<HTMLInputElement>("#ar-wrap");
  const wrapLabel = document.querySelector<HTMLElement>("#ar-wrap-label");
  const curveSlider = document.querySelector<HTMLInputElement>("#ar-curve");
  const curveLabel = document.querySelector<HTMLElement>("#ar-curve-label");
  const removeBgToggle = document.querySelector<HTMLInputElement>("#ar-removebg");
  const removeBgLabel = document.querySelector<HTMLElement>("#ar-removebg-label");
  const calBtn = document.querySelector<HTMLButtonElement>("#ar-calibrate");
  const calPanel = document.querySelector<HTMLElement>("#ar-cal");
  const calSize = document.querySelector<HTMLInputElement>("#ar-cal-size");
  const calDone = document.querySelector<HTMLButtonElement>("#ar-cal-done");
  const calCancel = document.querySelector<HTMLButtonElement>("#ar-cal-cancel");
  const arBtn = document.querySelector<HTMLButtonElement>("#ar-full");
  const arStdBtn = document.querySelector<HTMLButtonElement>("#ar-standard");
  const flipBtn = document.querySelector<HTMLButtonElement>("#ar-flip");
  const sideSelect = document.querySelector<HTMLSelectElement>("#ar-side");
  const sideLabel = document.querySelector<HTMLElement>("#ar-side-label");
  const clothesToggle = document.querySelector<HTMLInputElement>("#ar-clothes");
  const clothesLabel = document.querySelector<HTMLElement>("#ar-clothes-label");
  const progress = document.querySelector<HTMLProgressElement>("#ar-progress");
  let wrapCanvas: HTMLCanvasElement | null = null;
  let clipCanvas: HTMLCanvasElement | null = null;
  let designProc: HTMLCanvasElement | null = null;

  /** Manual wrap curvature: slider 0–100 → span 0…π radians. */
  function curveSpan(): number {
    const pct = curveSlider ? Number(curveSlider.value) : 0;
    return (Math.min(Math.max(pct, 0), 100) / 100) * Math.PI;
  }

  // "Remove design background": flood-fill the flat backdrop of logo/
  // line-art uploads to transparent so they don't render as a dark box
  // under multiply blend; light-on-dark art (e.g. white-on-black poster
  // designs) is then inverted so the lines read as ink instead of
  // vanishing under multiply. No-op (raw design used) for photographic
  // backgrounds — see removeFlatBackground.
  function rebuildProcessedDesign(): void {
    designProc = null;
    if (!design || !removeBgToggle?.checked) return;
    try {
      const c = document.createElement("canvas");
      c.width = design.naturalWidth;
      c.height = design.naturalHeight;
      const cctx = c.getContext("2d", { willReadFrequently: true });
      if (!cctx) return;
      cctx.drawImage(design, 0, 0);
      const px = cctx.getImageData(0, 0, c.width, c.height);
      const res = removeFlatBackground(px);
      if (res.removed) {
        invertForDarkBackdrop(px, res.backdropLum);
        cctx.putImageData(px, 0, 0);
        designProc = c;
      }
    } catch {
      designProc = null; // tainted canvas or OOM: fall back to the raw design
    }
  }
  removeBgToggle?.addEventListener("change", rebuildProcessedDesign);
  let video: HTMLVideoElement | null = null;
  let stream: MediaStream | null = null;
  let raf = 0;
  // A start in flight (permission prompt open); stop() bumps the token so
  // a start it overtook releases its stream instead of keeping it.
  let starting = false;
  let startToken = 0;
  // requestVideoFrameCallback says when the camera delivered a new frame;
  // render() runs at the display's rate, often twice the camera's.
  let frameCallbacks = false;
  let frameReady = true;
  /** Camera asked for; the front one is mirrored like a mirror. */
  let facing: "environment" | "user" = "environment";
  let mirror = false;
  const state: OverlayState = { x: 0, y: 0, scale: 1 };
  // Where and how big the design was last drawn, for hit-testing.
  const drawn = { x: 0, y: 0, w: 0, h: 0, rotation: 0 };

  // Calibration
  let calibrating = false;
  let calibrated = false;
  let frameWidthCm = DEFAULT_FRAME_WIDTH_CM;
  /** Video aspect at calibration; a change (phone rotated) invalidates it. */
  let calAspect = 0;
  let notice = "";
  const card = { x: 0, y: 0, w: 0 };

  // Full AR
  let ar: ArSession | null = null;
  let arLoading = false;
  let arStatus = "";

  // Pointer tracking for drag + pinch
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchStartCard = 0;
  let pinchStartW = 0;
  let pinchStartH = 0;

  const canvasPoint = (e: PointerEvent): { x: number; y: number } => {
    const r = refs.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * refs.canvas.width,
      y: ((e.clientY - r.top) / r.height) * refs.canvas.height,
    };
  };

  /** Show exactly the controls that apply to the current mode. */
  function syncControls(): void {
    const active = stream !== null;
    refs.section.classList.toggle("ar--active", active);
    refs.section.classList.toggle("ar--tracking", ar !== null);
    refs.startBtn.hidden = active;
    refs.startBtn.disabled = !design || starting || arLoading;
    refs.stopBtn.hidden = !active;
    refs.shotBtn.hidden = !active;
    if (calBtn) calBtn.hidden = !active || ar !== null;
    for (const el of [wrapLabel, curveLabel, removeBgLabel]) if (el) el.hidden = !active;
    if (flipBtn) flipBtn.hidden = !active;
    if (arBtn) {
      arBtn.hidden = ar !== null;
      arBtn.disabled = !design || arLoading || starting;
    }
    if (arStdBtn) arStdBtn.hidden = ar === null;
    if (sideLabel) sideLabel.hidden = ar === null;
    if (clothesLabel) clothesLabel.hidden = ar === null;
    if (progress) progress.hidden = !arLoading;
  }

  function setCardWidth(px: number): void {
    const cw = refs.canvas.width;
    card.w = Math.min(Math.max(px, cw * 0.05), cw * 0.95);
    if (calSize) calSize.value = String(Math.round((card.w / cw) * 100));
  }

  function resetCalibration(): void {
    calibrated = false;
    frameWidthCm = DEFAULT_FRAME_WIDTH_CM;
    calAspect = 0;
    if (calBtn) calBtn.textContent = "Calibrate size";
  }

  function beginCalibration(): void {
    if (!stream || !video || ar) return;
    calibrating = true;
    notice = "";
    card.x = refs.canvas.width / 2;
    card.y = refs.canvas.height / 2;
    // Start from the current calibration, so recalibrating is a small nudge.
    setCardWidth(refs.canvas.width * (calibrated ? CARD_W_CM / frameWidthCm : 0.3));
    refs.section.classList.add("ar--calibrating");
    if (calPanel) calPanel.hidden = false;
    updateHint();
  }

  function endCalibration(apply: boolean): void {
    if (!calibrating) return;
    calibrating = false;
    if (apply && video && card.w > 0) {
      frameWidthCm = frameWidthFromCard(refs.canvas.width, card.w);
      calAspect = video.videoWidth / video.videoHeight;
      calibrated = true;
      state.scale = 1;
      if (calBtn) calBtn.textContent = "Recalibrate";
    }
    refs.section.classList.remove("ar--calibrating");
    if (calPanel) calPanel.hidden = true;
    updateHint();
  }

  function drawCard(c: CanvasRenderingContext2D): void {
    const w = card.w;
    const h = (w * CARD_H_CM) / CARD_W_CM;
    const r = (w * CARD_RADIUS_CM) / CARD_W_CM;
    c.save();
    c.beginPath();
    c.roundRect(card.x - w / 2, card.y - h / 2, w, h, r);
    c.lineWidth = 4;
    c.strokeStyle = "rgba(0, 0, 0, 0.55)";
    c.stroke();
    c.setLineDash([8, 5]);
    c.lineWidth = 2;
    c.strokeStyle = "#c9b0ff";
    c.stroke();
    c.restore();
  }

  /** Pinch on a calibrated or tracked preview: resize the tattoo itself, in cm. */
  function resizeTattoo(baseW: number, baseH: number, f: number): void {
    const s = scaleSize(baseW, baseH, f, MIN_TATTOO_CM, MAX_TATTOO_CM);
    onResize?.(s.w, s.h);
  }

  /**
   * Paint the design centered on c's origin, w×h, curved over `span`
   * radians of a cylinder when span > 0. Returns the drawn width. The
   * caller sets the transform, blend and alpha.
   */
  function paintDesign(c: CanvasRenderingContext2D, w: number, h: number, span: number): number {
    if (!design) return 0;
    const src: CanvasImageSource = designProc ?? design;
    if (span <= 0.02) {
      c.drawImage(src, -w / 2, -h / 2, w, h);
      return w;
    }
    // Static cylindrical illusion: strips render seam-free onto a cached
    // offscreen canvas with geometric cos(θ) shading, then composite once.
    // In the standard preview the curvature is the visitor's slider; in
    // Full AR it comes from the limb's measured width.
    const { projW, strips } = computeWrapStrips(design.naturalWidth, w, 64, span);
    const off = (wrapCanvas ??= document.createElement("canvas"));
    const offW = Math.max(2, Math.ceil(projW));
    const offH = Math.max(2, Math.ceil(h));
    if (off.width !== offW || off.height !== offH) {
      off.width = offW;
      off.height = offH;
    }
    const octx = off.getContext("2d");
    if (!octx) return w;
    octx.clearRect(0, 0, offW, offH);
    for (const s of strips) {
      octx.drawImage(src, s.u0, 0, s.u1 - s.u0, design.naturalHeight,
                     s.x0 + projW / 2, 0, s.x1 - s.x0, offH);
    }
    const g = octx.createLinearGradient(0, 0, offW, 0);
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      g.addColorStop(t, `rgba(0,0,0,${wrapShadeAt(t, span).toFixed(3)})`);
    }
    octx.globalCompositeOperation = "destination-in";
    octx.fillStyle = g;
    octx.fillRect(0, 0, offW, offH);
    octx.globalCompositeOperation = "source-over";
    c.drawImage(off, -projW / 2, -h / 2, projW, h);
    return projW;
  }

  function drawStandard(c: CanvasRenderingContext2D): void {
    if (!design) return;
    const { w, h } = overlaySize(refs.canvas.width, frameWidthCm, tattooWCm, tattooHCm,
                                 design.naturalWidth, design.naturalHeight, state.scale);
    c.save();
    c.translate(state.x, state.y);
    c.rotate((getRotation() * Math.PI) / 180);
    // Multiply blend settles the design into skin tones like real ink.
    c.globalCompositeOperation = "multiply";
    c.globalAlpha = getOpacity();
    const span = wrapToggle?.checked ? curveSpan() : 0;
    const dw = paintDesign(c, w, h, span);
    c.restore();
    Object.assign(drawn, { x: state.x, y: state.y, w: dw, h, rotation: getRotation() });
  }

  // ── Full AR ──

  const newFilters = (): ArSession["filters"] => ({
    x: new OneEuro(1.2, 0.01), y: new OneEuro(1.2, 0.01), angle: new OneEuro(1.2, 0.3),
    scale: new OneEuro(0.4, 0), fore: new OneEuro(0.6, 0), width: new OneEuro(0.6, 0),
  });

  function resetTracking(): void {
    if (!ar) return;
    ar.anchor = null;
    ar.side = null;
    ar.limbWidth = null;
    ar.lastVideoTime = -1;
    ar.filters = newFilters();
  }

  const sideChoice = (): Side | "auto" => {
    const v = sideSelect?.value;
    return v === "left" || v === "right" ? v : "auto";
  };

  /** New segmentation: keep it for measuring, and paint the skin-only mask. */
  function takeMask(mask: NonNullable<TrackerOutput["mask"]>): void {
    if (!ar) return;
    ar.mask = mask;
    const skin = (ar.skin ??= document.createElement("canvas"));
    if (skin.width !== mask.width || skin.height !== mask.height) {
      skin.width = mask.width;
      skin.height = mask.height;
    }
    const sctx = skin.getContext("2d");
    if (!sctx) return;
    if (!ar.skinImg || ar.skinImg.width !== mask.width || ar.skinImg.height !== mask.height) {
      ar.skinImg = sctx.createImageData(mask.width, mask.height);
    }
    const px = ar.skinImg.data;
    for (let i = 0; i < mask.data.length; i++) {
      px[i * 4 + 3] = mask.data[i] === MASK_CLASS.BODY_SKIN ? 255 : 0;
    }
    sctx.putImageData(ar.skinImg, 0, 0);
  }

  /** Limb width across the anchor, canvas px, from the latest mask. */
  function measureLimb(a: Anchor, crop: Crop): number | null {
    if (!ar?.mask || !video) return null;
    const { data, width: mw, height: mh } = ar.mask;
    const cw = refs.canvas.width, ch = refs.canvas.height;
    const toMask = (px: number, py: number): Pt => {
      const v = canvasToVideo(px, py, video!.videoWidth, video!.videoHeight, crop, cw, ch, mirror);
      return { x: v.x * mw, y: v.y * mh };
    };
    const STEP = 10;
    const c0 = toMask(a.x, a.y);
    const c1 = toMask(a.x + Math.cos(a.angle) * STEP, a.y + Math.sin(a.angle) * STEP);
    const len = Math.hypot(c1.x - c0.x, c1.y - c0.y);
    if (len === 0) return null;
    const run = maskRunWidth(data, mw, mh, c0.x, c0.y, (c1.x - c0.x) / len, (c1.y - c0.y) / len, isLimb);
    return run === null ? null : (run * STEP) / len;
  }

  /** Run the tracker on a new video frame and update the smoothed anchor. */
  function trackFrame(now: number, crop: Crop): void {
    if (!ar || !video) return;
    if (frameCallbacks) {
      if (!frameReady) return;
      frameReady = false;
    } else if (video.currentTime === ar.lastVideoTime) {
      return;
    }
    ar.lastVideoTime = video.currentTime;
    ar.frame++;
    const spec = AR_PLACEMENTS[placementId];
    const wantMask = !!spec && ar.frame % 2 === 0 &&
      (clothesToggle?.checked === true || wrapToggle?.checked === true);
    let out: TrackerOutput;
    try {
      out = ar.tracker.detect(video, now, wantMask);
    } catch (e) {
      endAr();
      onError(`Body tracking stopped (${(e as Error).message}). The standard preview still works.`);
      return;
    }
    if (out.mask) takeMask(out.mask);
    const cw = refs.canvas.width, ch = refs.canvas.height;
    const vw = video.videoWidth, vh = video.videoHeight;
    let raw: Anchor | null = null;
    if (spec && out.landmarks) {
      const pts = out.landmarks.map((p) => ({ ...videoToCanvas(p.x, p.y, vw, vh, crop, cw, ch, mirror), visibility: p.visibility }));
      ar.side = pickSide(spec, pts, sideChoice(), ar.side);
      raw = computeAnchor(placementId, pts, heightCm, ar.side);
    }
    if (!raw) {
      if (ar.anchor && now - ar.lastSeen > AR_LOST_MS) resetTracking();
      return;
    }
    const f = ar.filters;
    const angle = ar.anchor ? unwrapAngle(ar.anchor.angle, raw.angle) : raw.angle;
    ar.anchor = {
      x: f.x.filter(raw.x, now),
      y: f.y.filter(raw.y, now),
      angle: f.angle.filter(angle, now),
      pxPerCm: f.scale.filter(raw.pxPerCm, now),
      foreshorten: f.fore.filter(raw.foreshorten, now),
      side: raw.side,
    };
    ar.lastSeen = now;
    if (spec.kind === "limb" && out.mask) {
      const wpx = measureLimb(ar.anchor, crop);
      if (wpx !== null) ar.limbWidth = f.width.filter(wpx, now);
    }
  }

  /** Draw the skin mask over c, lined up with the video as displayed. */
  function drawSkinMask(c: CanvasRenderingContext2D, crop: Crop): void {
    if (!ar?.skin || !video) return;
    const kx = ar.skin.width / video.videoWidth, ky = ar.skin.height / video.videoHeight;
    c.save();
    if (mirror) {
      c.translate(refs.canvas.width, 0);
      c.scale(-1, 1);
    }
    c.drawImage(ar.skin, crop.sx * kx, crop.sy * ky, crop.sw * kx, crop.sh * ky,
                0, 0, refs.canvas.width, refs.canvas.height);
    c.restore();
  }

  function drawTracked(crop: Crop): void {
    if (!ar || !design || !ctx) return;
    const a = ar.anchor;
    if (!AR_PLACEMENTS[placementId] || !a) {
      // Untracked placement: the design stays where the visitor drags it.
      if (!AR_PLACEMENTS[placementId]) drawStandard(ctx);
      return;
    }
    const w = tattooWCm * a.pxPerCm;
    const h = tattooHCm * a.pxPerCm;
    const across = { x: Math.cos(a.angle), y: Math.sin(a.angle) };
    const along = { x: -Math.sin(a.angle), y: Math.cos(a.angle) };
    const du = ar.offset.u * a.pxPerCm, dv = ar.offset.v * a.pxPerCm * a.foreshorten;
    const cx = a.x + across.x * du + along.x * dv;
    const cy = a.y + across.y * du + along.y * dv;
    const span = !wrapToggle?.checked ? 0
      : ar.limbWidth ? wrapSpanFor(w, ar.limbWidth) : curveSpan();
    const clip = clothesToggle?.checked === true && ar.skin !== null;
    const cw = refs.canvas.width, ch = refs.canvas.height;
    let target = ctx;
    if (clip) {
      const cc = (clipCanvas ??= document.createElement("canvas"));
      if (cc.width !== cw || cc.height !== ch) {
        cc.width = cw;
        cc.height = ch;
      }
      target = cc.getContext("2d") ?? ctx;
      target.clearRect(0, 0, cw, ch);
    }
    target.save();
    target.translate(cx, cy);
    // Run down the limb, squash along it as much as the limb is
    // foreshortened, then apply the visitor's own rotation on the skin.
    target.rotate(a.angle);
    target.scale(1, a.foreshorten);
    target.rotate((getRotation() * Math.PI) / 180);
    if (!clip) {
      target.globalCompositeOperation = "multiply";
      target.globalAlpha = getOpacity();
    }
    const dw = paintDesign(target, w, h, span);
    target.restore();
    if (clip && clipCanvas) {
      target.globalCompositeOperation = "destination-in";
      drawSkinMask(target, crop);
      target.globalCompositeOperation = "source-over";
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = getOpacity();
      ctx.drawImage(clipCanvas, 0, 0);
      ctx.restore();
    }
    Object.assign(drawn, {
      x: cx, y: cy, w: dw, h: h * a.foreshorten,
      rotation: (a.angle * 180) / Math.PI + getRotation(),
    });
  }

  function endAr(): void {
    if (!ar) return;
    ar.tracker.close();
    ar = null;
    arStatus = "";
    syncControls();
    updateHint();
  }

  function render(): void {
    if (!video || !ctx) return;
    const now = performance.now();
    const { canvas } = refs;
    if (video.videoWidth && canvas.width !== canvas.clientWidth) {
      const prevW = canvas.width;
      canvas.width = canvas.clientWidth;
      canvas.height = Math.round((canvas.clientWidth * 3) / 4);
      if (state.x === 0 && state.y === 0) {
        state.x = canvas.width / 2;
        state.y = canvas.height / 2;
      } else if (prevW > 0) {
        // Layout changed (rotation, resize): keep positions in proportion.
        // The card is stored relative to the canvas too, so a calibration
        // (a fraction of the frame) stays valid.
        const k = canvas.width / prevW;
        state.x *= k; state.y *= k;
        card.x *= k; card.y *= k; card.w *= k;
      }
      resetTracking();
    }
    if (calibrated && video.videoHeight) {
      const aspect = video.videoWidth / video.videoHeight;
      if (Math.abs(aspect - calAspect) > 0.02) {
        resetCalibration();
        notice = "The camera view changed, so the size is approximate again.";
        updateHint();
      }
    }
    const crop = coverCrop(video.videoWidth, video.videoHeight, canvas.width, canvas.height);
    ctx.save();
    if (mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (calibrating) {
      drawCard(ctx);
    } else if (ar) {
      trackFrame(now, crop);
      drawTracked(crop);
      updateHint();
    } else {
      drawStandard(ctx);
    }
    raf = requestAnimationFrame(render);
  }

  function watchFrames(v: HTMLVideoElement): void {
    const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number })
      .requestVideoFrameCallback;
    frameCallbacks = typeof rvfc === "function";
    frameReady = true;
    if (!rvfc) return;
    const onFrame = (): void => {
      frameReady = true;
      if (video === v) rvfc.call(v, onFrame);
    };
    rvfc.call(v, onFrame);
  }

  function releaseStream(): void {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video = null;
  }

  async function start(): Promise<void> {
    if (starting || stream) return;
    starting = true;
    syncControls();
    const token = ++startToken;
    let s: MediaStream | null = null;
    try {
      try {
        s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch {
        s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      const v = document.createElement("video");
      v.srcObject = s;
      v.playsInline = true;
      v.muted = true;
      if (token === startToken) await v.play();
      if (token !== startToken) {
        s.getTracks().forEach((t) => t.stop()); // stopped while the prompt was open
        return;
      }
      stream = s;
      video = v;
      watchFrames(v);
      // Desktop webcams often don't report a facing mode; they face the
      // user, but the standard preview has always shown them unmirrored.
      mirror = (s.getVideoTracks()[0]?.getSettings().facingMode ?? facing) === "user";
    } catch {
      s?.getTracks().forEach((t) => t.stop());
      onError("Camera unavailable. Check browser permissions and try again.");
      return;
    } finally {
      starting = false;
      syncControls();
    }
    resetTracking();
    updateHint();
    raf = requestAnimationFrame(render);
  }

  function stop(): void {
    startToken++;
    releaseStream();
    endCalibration(false);
    // A new session is a new distance: the old calibration no longer holds.
    resetCalibration();
    endAr();
    // The next Start Camera is a fresh standard preview: rear camera again.
    facing = "environment";
    notice = "";
    syncControls();
    refs.hint.textContent = "";
    ctx?.clearRect(0, 0, refs.canvas.width, refs.canvas.height);
  }

  async function flip(): Promise<void> {
    facing = facing === "user" ? "environment" : "user";
    startToken++;
    releaseStream();
    endCalibration(false);
    resetCalibration();
    await start();
  }

  function screenshot(): void {
    const a = document.createElement("a");
    a.download = "tattoosafe-preview.png";
    a.href = refs.canvas.toDataURL("image/png");
    a.click();
  }

  refs.startBtn.addEventListener("click", () => void start());
  refs.stopBtn.addEventListener("click", stop);
  refs.shotBtn.addEventListener("click", screenshot);
  flipBtn?.addEventListener("click", () => void flip());
  calBtn?.addEventListener("click", beginCalibration);
  calDone?.addEventListener("click", () => endCalibration(true));
  calCancel?.addEventListener("click", () => endCalibration(false));
  calSize?.addEventListener("input", () => setCardWidth((Number(calSize.value) / 100) * refs.canvas.width));
  arStdBtn?.addEventListener("click", endAr);
  sideSelect?.addEventListener("change", resetTracking);

  refs.canvas.addEventListener("pointerdown", (e) => {
    refs.canvas.setPointerCapture(e.pointerId);
    const p = canvasPoint(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStartScale = state.scale;
      pinchStartCard = card.w;
      pinchStartW = tattooWCm;
      pinchStartH = tattooHCm;
      dragging = false;
    } else if (calibrating) {
      dragging = true; // the outline moves from anywhere on the canvas
    } else if (design && hitTest(p.x, p.y, drawn, drawn.w, drawn.h, drawn.rotation)) {
      dragging = true;
    }
  });
  refs.canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = canvasPoint(e);
    const prev = pointers.get(e.pointerId)!;
    pointers.set(e.pointerId, p);
    if (pointers.size === 2 && pinchStartDist > 0) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (calibrating) setCardWidth((pinchStartCard * dist) / pinchStartDist);
      else if (calibrated || ar) resizeTattoo(pinchStartW, pinchStartH, dist / pinchStartDist);
      else state.scale = pinchScale(pinchStartScale, pinchStartDist, dist);
    } else if (dragging) {
      const dx = p.x - prev.x, dy = p.y - prev.y;
      const a = ar?.anchor;
      if (ar && a && AR_PLACEMENTS[placementId]) {
        // Nudge in the limb's own frame, so the offset rides along with it.
        const clampCm = (v: number): number => Math.min(Math.max(v, -AR_MAX_OFFSET_CM), AR_MAX_OFFSET_CM);
        const cos = Math.cos(a.angle), sin = Math.sin(a.angle);
        ar.offset.u = clampCm(ar.offset.u + (dx * cos + dy * sin) / a.pxPerCm);
        ar.offset.v = clampCm(ar.offset.v + (-dx * sin + dy * cos) / (a.pxPerCm * a.foreshorten));
      } else {
        const target = calibrating ? card : state;
        const c = clampCenter(target.x + dx, target.y + dy, refs.canvas.width, refs.canvas.height);
        target.x = c.x;
        target.y = c.y;
      }
    }
  });
  const endPointer = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;
    if (pointers.size === 0) dragging = false;
  };
  refs.canvas.addEventListener("pointerup", endPointer);
  refs.canvas.addEventListener("pointercancel", endPointer);
  refs.canvas.addEventListener("wheel", (e) => {
    if (!stream) return;
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    if (calibrating) setCardWidth(card.w * f);
    else if (calibrated || ar) resizeTattoo(tattooWCm, tattooHCm, f);
    else state.scale = wheelScale(state.scale, e.deltaY);
  }, { passive: false });

  // Don't hold the camera open in a background tab.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (stream || starting)) stop();
  });

  function trackingHint(): string {
    if (!ar) return "";
    const spec = AR_PLACEMENTS[placementId];
    const name = (getBodyPart(placementId)?.label ?? "this placement").toLowerCase();
    if (!spec) {
      return `Full AR doesn't follow the ${name}, so drag the design into place. ` +
        `It tracks the ${AR_PLACEMENT_LIST}.`;
    }
    if (!ar.anchor) {
      return `Looking for you. Step back until ${spec.needs} are in view. ` +
        "It finds your face first, then the rest of you.";
    }
    const side = ar.anchor.side ? `, ${ar.anchor.side} side` : "";
    return `${sizeLabel}${side} · size estimated from your height · drag to adjust · pinch or scroll to resize`;
  }

  function updateHint(): void {
    if (arLoading) {
      refs.hint.textContent = arStatus;
      return;
    }
    if (!stream) return;
    const text = ar ? trackingHint()
      : notice ? `${notice} ${cameraHint({ calibrating, calibrated, sizeLabel })}`
      : cameraHint({ calibrating, calibrated, sizeLabel });
    // Called every frame in Full AR: only touch the live region on a change.
    if (refs.hint.textContent !== text) refs.hint.textContent = text;
  }

  syncControls();

  return {
    setDesign(img: HTMLImageElement): void {
      design = img;
      rebuildProcessedDesign();
      syncControls();
      if (!stream) refs.hint.textContent = "Design loaded — start the camera to preview it on your body.";
    },
    setTattooSize(wCm: number, hCm: number, label: string): void {
      tattooWCm = wCm;
      tattooHCm = hCm;
      sizeLabel = label;
      updateHint();
    },
    setPlacement(id: string, h: number): void {
      if (id !== placementId && ar) {
        resetTracking();
        ar.offset = { u: 0, v: 0 };
      }
      placementId = id;
      heightCm = h;
    },
    async startAr(load): Promise<void> {
      if (ar || arLoading || !design) return;
      arLoading = true;
      endCalibration(false);
      arStatus = "Downloading body tracking…";
      if (progress) progress.value = 0;
      syncControls();
      updateHint();
      const mb = (n: number): string => (n / 1e6).toFixed(0);
      const trackerP = load((loaded, total) => {
        arStatus = `Downloading body tracking: ${mb(loaded)} of ${mb(total)} MB`;
        if (progress) progress.value = total ? loaded / total : 0;
        if (loaded >= total) arStatus = "Starting body tracking…";
        updateHint();
      });
      trackerP.catch(() => undefined); // handled below; avoid an unhandled rejection if the camera fails first
      try {
        if (!stream || facing !== "user") {
          facing = "user";
          startToken++;
          releaseStream();
          await start();
        }
        if (!stream) {
          // Camera refused (start() said so): let the download finish quietly.
          trackerP.then((t) => t.close(), () => undefined);
          return;
        }
        const tracker = await trackerP;
        if (!stream) {
          tracker.close(); // stopped while the tracker was loading
          return;
        }
        ar = {
          tracker, side: null, anchor: null, lastSeen: 0, lastVideoTime: -1, frame: 0,
          offset: { u: 0, v: 0 }, limbWidth: null, mask: null, skin: null, skinImg: null, filters: newFilters(),
        };
      } catch (e) {
        onError(`Full AR couldn't start on this device (${(e as Error).message}). The standard preview still works.`);
      } finally {
        arLoading = false;
        arStatus = "";
        syncControls();
        updateHint();
      }
    },
    stopAr: endAr,
    isActive: () => stream !== null,
  };
}
