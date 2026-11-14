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
  AR_PLACEMENTS, LM, MASK_CLASS, OneEuro, canvasToVideo, computeAnchor, isLimb, maskRunWidth, pickSide,
  unwrapAngle, videoToCanvas, wrapSpanFor, type Anchor, type Crop, type Landmark, type Pt, type Side,
} from "./ar-anchor";
import {
  CHEEK_LANDMARK, affineFromTriangles, cmPerUv, compose, designToUv, faceAxes, facingSign, uvOf, windingOf,
} from "./ar-face";
import {
  PALM_POINTS, backFacing, computeRolledStrips, forearmFace, handCenterCm, handLengthCm, isHandPlacement,
  limbRadiusCm, nearestPoint, palmAffine, palmFacing, palmNormal, pickHand, rollAbout, rolledShadeAt, sideGate,
  toVideoPx, wrapPi, wristAnchor, type HandObservation,
} from "./ar-hand";
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

/**
 * What to tell a visitor whose camera did not start, from the error
 * getUserMedia rejected with.
 *
 * Every failure used to produce one sentence, "Camera unavailable. Check
 * browser permissions and try again.", in a toast that closed after four
 * seconds and left the page exactly as it was. A refused permission is the
 * commonest way a camera tool fails on a phone, and the cases need different
 * advice: a visitor who blocked the camera has to change a browser setting, one
 * inside an app's built-in browser has to leave it, and one with no camera can
 * stop trying. The text stays in the status line under the preview until the
 * camera starts.
 */
export function cameraErrorMessage(err: unknown): string {
  const name = err instanceof Error || (typeof err === "object" && err !== null && "name" in err)
    ? String((err as { name: unknown }).name)
    : "";
  const rest = " The size check and price estimate above work without the camera.";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "The camera is blocked for this page. Allow it in your browser's site settings " +
      "(the icon beside the address), then press Start Camera again." + rest;
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device." + rest;
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera could not be started. Another app or tab may be using it: " +
      "close that, then press Start Camera again." + rest;
  }
  // No navigator.mediaDevices at all: an app's built-in browser, or a page not
  // served over HTTPS.
  return "This browser will not open the camera here. Browsers built into other apps often " +
    "refuse: open this page in Safari or Chrome and try again." + rest;
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
  /**
   * Clothing clear, everything else opaque, at mask resolution. The clip
   * removes only what the segmenter calls clothes, so a mask that comes back
   * wrong hides nothing instead of everything.
   */
  uncovered: HTMLCanvasElement | null;
  uncoveredImg: ImageData | null;
  /** ?ar-debug: the categories tinted, drawn over the feed. */
  tint: HTMLCanvasElement | null;
  filters: {
    x: OneEuro; y: OneEuro; angle: OneEuro; scale: OneEuro; fore: OneEuro; width: OneEuro;
    roll: OneEuro; facing: OneEuro;
  };
  /** Face placement: the 478 smoothed landmarks in canvas px, null while no face is found. */
  face: Pt[] | null;
  faceFilters: OneEuro[] | null;
  /** Where the design's middle sits on the face, in the mesh's UV space. */
  faceCenter: Pt | null;
  /** Face model download/start status, for the hint; "" once ready. */
  faceStatus: string;
  /** Hand and wrist placements: the hand being followed, its five palm points smoothed, canvas px. */
  hand: { side: Side; palm: Pt[] } | null;
  handFilters: OneEuro[] | null;
  /** Hand model download/start status; "" once ready. Shown for the hand and wrist placements only. */
  handStatus: string;
  /** Wrist: the palm's turn about the arm, radians (0 = palm to the camera); null until a hand is found. */
  roll: number | null;
  /** Forearm: how squarely the palm of the followed arm faces the camera, -1…1; null while no hand is matched. */
  palmFacing: number | null;
  palmSeen: number;
  /** The design is on the side turned away from the camera, so nothing is drawn. */
  hidden: boolean;
}

const FACE = "face";
const HAND = "hand";
const WRIST = "wrist";

/** A body part on screen for longer than this without being found is "lost". */
const AR_LOST_MS = 600;
/** How far the design can be nudged from its anchor, cm. */
const AR_MAX_OFFSET_CM = 30;
/** A forearm keeps the side it last showed for this long after its hand goes out of view. */
const AR_SIDE_HOLD_MS = 3000;
/**
 * `?ar-debug` in the page URL tints the segmentation over the feed (skin
 * peach, clothes blue, face pink, hair brown), to check on a real device that
 * the mask lines up with the picture.
 */
const AR_DEBUG = typeof location !== "undefined" && new URLSearchParams(location.search).has("ar-debug");
const DEBUG_TINT: Record<number, [number, number, number, number]> = {
  1: [140, 80, 20, 110], 2: [255, 170, 120, 110], 3: [255, 110, 150, 110], 4: [60, 120, 255, 110],
};
const AR_PLACEMENT_LIST = "inner or outer forearm, upper arm, shoulder, wrist, back of the hand, chest, sternum, thigh, calf or face";

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
  let decalCanvas: HTMLCanvasElement | null = null;
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
  /** Why the camera did not start, shown until it does. "" when there is nothing to say. */
  let cameraError = "";

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
    // On the face the mesh does the curving, the back of a hand is flat, and
    // neither has clothing to clip. The wrist's curve comes from its own size.
    const flatAr = ar !== null && (placementId === FACE || placementId === HAND);
    if (wrapLabel) wrapLabel.hidden = !active || flatAr;
    if (curveLabel) curveLabel.hidden = !active || flatAr || (ar !== null && placementId === WRIST);
    if (removeBgLabel) removeBgLabel.hidden = !active;
    if (flipBtn) flipBtn.hidden = !active;
    if (arBtn) {
      arBtn.hidden = ar !== null;
      arBtn.disabled = !design || arLoading || starting;
    }
    if (arStdBtn) arStdBtn.hidden = ar === null;
    if (sideLabel) sideLabel.hidden = ar === null;
    if (clothesLabel) clothesLabel.hidden = ar === null || flatAr;
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
    roll: new OneEuro(1.2, 0.3), facing: new OneEuro(1, 0.3),
  });

  // ?ar-debug: how long each model took on its last frames, ms (a running average), read through tsAr().
  const debugMs: Record<string, number> = {};
  function timed<T>(label: string, run: () => T): T {
    if (!AR_DEBUG) return run();
    const t0 = performance.now();
    const out = run();
    const ms = performance.now() - t0;
    debugMs[label] = label in debugMs ? debugMs[label] * 0.8 + ms * 0.2 : ms;
    return out;
  }

  function resetTracking(): void {
    if (!ar) return;
    ar.anchor = null;
    ar.side = null;
    ar.limbWidth = null;
    ar.lastVideoTime = -1;
    ar.filters = newFilters();
    ar.face = null;
    ar.faceFilters = null;
    ar.hand = null;
    ar.handFilters = null;
    ar.roll = null;
    ar.palmFacing = null;
    ar.hidden = false;
  }

  const sideChoice = (): Side | "auto" => {
    const v = sideSelect?.value;
    return v === "left" || v === "right" ? v : "auto";
  };

  /** New segmentation: keep it for measuring, and paint the clip mask. */
  function takeMask(mask: NonNullable<TrackerOutput["mask"]>): void {
    if (!ar) return;
    ar.mask = mask;
    const cv = (ar.uncovered ??= document.createElement("canvas"));
    if (cv.width !== mask.width || cv.height !== mask.height) {
      cv.width = mask.width;
      cv.height = mask.height;
    }
    const cctx = cv.getContext("2d");
    if (!cctx) return;
    if (!ar.uncoveredImg || ar.uncoveredImg.width !== mask.width || ar.uncoveredImg.height !== mask.height) {
      ar.uncoveredImg = cctx.createImageData(mask.width, mask.height);
    }
    const px = ar.uncoveredImg.data;
    for (let i = 0; i < mask.data.length; i++) {
      px[i * 4 + 3] = mask.data[i] === MASK_CLASS.CLOTHES ? 0 : 255;
    }
    cctx.putImageData(ar.uncoveredImg, 0, 0);
    if (AR_DEBUG) {
      const t = (ar.tint ??= document.createElement("canvas"));
      t.width = mask.width;
      t.height = mask.height;
      const tctx = t.getContext("2d");
      if (!tctx) return;
      const img = tctx.createImageData(mask.width, mask.height);
      for (let i = 0; i < mask.data.length; i++) {
        const c = DEBUG_TINT[mask.data[i]];
        if (c) img.data.set(c, i * 4);
      }
      tctx.putImageData(img, 0, 0);
    }
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
    if (placementId === FACE) {
      trackFace(now, crop);
      return;
    }
    if (isHandPlacement(placementId)) {
      trackHand(now, crop);
      return;
    }
    const spec = AR_PLACEMENTS[placementId];
    const wantMask = !!spec && ar.frame % 2 === 0 &&
      (clothesToggle?.checked === true || wrapToggle?.checked === true);
    let out: TrackerOutput;
    try {
      const session = ar, v = video;
      out = timed(wantMask ? "pose+mask" : "pose", () => session.tracker.detect(v, now, { pose: true, mask: wantMask }));
    } catch (e) {
      endAr();
      onError(`Body mapping stopped (${(e as Error).message}). The standard preview still works.`);
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
      // Which side of the arm is showing changes slowly: the hand model looks every
      // fourth frame, on one the segmenter (even frames) leaves free.
      if (raw && ar.side && forearmFace(placementId) && ar.frame % 4 === 1) trackForearmSide(now, crop, pts, ar.side);
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

  /** Start the hand model's download once; the hand and wrist hints report on it. */
  function ensureHand(session: ArSession): void {
    if (session.handStatus) return; // on its way, or failed (said once, until another placement is picked)
    session.handStatus = "Downloading hand mapping…";
    const mb = (n: number): string => (n / 1e6).toFixed(1);
    session.tracker.loadHand((loaded, total) => {
      session.handStatus = loaded >= total ? "Starting hand mapping…"
        : `Downloading hand mapping: ${mb(loaded)} of ${mb(total)} MB`;
    }).then(() => { session.handStatus = ""; }).catch((e: Error) => {
      session.handStatus = `Hand mapping couldn't start on this device (${e.message}). ` +
        "Pick another placement, or switch to the standard preview.";
    });
  }

  /**
   * Back of the hand and wrist: follow the hand itself. The body model is not
   * run, so nothing else has to be in view.
   */
  function trackHand(now: number, crop: Crop): void {
    if (!ar || !video) return;
    const session = ar;
    if (!session.tracker.handReady()) {
      ensureHand(session);
      return;
    }
    const wrist = placementId === WRIST;
    let hands: HandObservation[];
    try {
      // A sleeve can cover a wrist; nothing covers the back of a hand.
      if (wrist && clothesToggle?.checked === true && session.frame % 2 === 0) {
        const v = video;
        const out = timed("mask", () => session.tracker.detect(v, now, { pose: false, mask: true }));
        if (out.mask) takeMask(out.mask);
      }
      const v = video;
      // One hand to follow unless the visitor named a side: then the other one has to be told apart.
      const maxHands = sideChoice() === "auto" ? 1 : 2;
      hands = timed("hand", () => session.tracker.detectHands(v, now, maxHands));
    } catch (e) {
      endAr();
      onError(`Hand mapping stopped (${(e as Error).message}). The standard preview still works.`);
      return;
    }
    const i = pickHand(hands, sideChoice(), session.hand?.side ?? null);
    if (i < 0) {
      if (session.hand && now - session.lastSeen > AR_LOST_MS) resetTracking();
      return;
    }
    const h = hands[i];
    const cw = refs.canvas.width, ch = refs.canvas.height;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (session.hand && session.hand.side !== h.side) {
      // The other hand took over: don't glide the design across from the first.
      session.handFilters = null;
      session.filters = newFilters();
      session.roll = null;
    }
    const f = (session.handFilters ??= PALM_POINTS.flatMap(() => [new OneEuro(1.5, 0.02), new OneEuro(1.5, 0.02)]));
    const palm = PALM_POINTS.map((idx, k) => {
      const c = videoToCanvas(h.lm[idx].x, h.lm[idx].y, vw, vh, crop, cw, ch, mirror);
      return { x: f[2 * k].filter(c.x, now), y: f[2 * k + 1].filter(c.y, now) };
    });
    session.hand = { side: h.side, palm };
    session.lastSeen = now;
    if (!wrist) return;
    const m = palmAffine(palm, h.side, heightCm);
    const a = m && wristAnchor(palm, m, h.side, heightCm);
    const n = palmNormal(toVideoPx(h.lm, vw, vh), h.side);
    if (!a || !n) return;
    session.anchor = a;
    const raw = rollAbout({ x: mirror ? -n.x : n.x, y: n.y, z: n.z }, a.angle);
    session.roll = session.filters.roll.filter(session.roll === null ? raw : unwrapAngle(session.roll, raw), now);
  }

  /**
   * Inner and outer forearm: the body model cannot tell which side of the arm
   * is showing, but the hand on the end of it can. Finds the hand at the
   * followed arm's wrist and notes which way its palm faces. Until the hand
   * model has loaded, and whenever the hand is too small or out of view, the
   * design shows on whichever side faces the camera, as it always did.
   *
   * Which hand it is (left or right) is the hand model's own reading, taken
   * from the hand close up. The body model's naming of the arm is only the
   * fallback: on a photo of crossed arms it called a right arm the left one,
   * which turned the palm into the back of the hand and hid the design.
   */
  function trackForearmSide(now: number, crop: Crop, pts: Landmark[], side: Side): void {
    if (!ar || !video) return;
    const session = ar;
    if (!session.tracker.handReady()) {
      ensureHand(session);
      return;
    }
    const s = side === "left" ? 0 : 1;
    const elbow = pts[[LM.L_ELBOW, LM.R_ELBOW][s]], wrist = pts[[LM.L_WRIST, LM.R_WRIST][s]];
    const vw = video.videoWidth, vh = video.videoHeight;
    let hands: HandObservation[] = [];
    try {
      const v = video;
      hands = timed("hand", () => session.tracker.detectHands(v, now, 2));
    } catch {
      // The forearm works without its side; the body model reports its own failures.
    }
    const at = hands.map((h) => videoToCanvas(h.lm[0].x, h.lm[0].y, vw, vh, crop, refs.canvas.width, refs.canvas.height, mirror));
    const i = nearestPoint(at, wrist, 0.5 * Math.hypot(elbow.x - wrist.x, elbow.y - wrist.y));
    const n = i >= 0 ? palmNormal(toVideoPx(hands[i].lm, vw, vh), hands[i].score >= 0.8 ? hands[i].side : side) : null;
    if (n) {
      session.palmFacing = session.filters.facing.filter(palmFacing(n), now);
      session.palmSeen = now;
    } else if (session.palmFacing !== null && now - session.palmSeen > AR_SIDE_HOLD_MS) {
      session.palmFacing = null;
      session.filters.facing.reset();
    }
  }

  /** Face placement: load the face model once, then follow the face mesh. */
  function trackFace(now: number, crop: Crop): void {
    if (!ar || !video) return;
    const session = ar;
    if (!session.tracker.faceReady()) {
      if (!session.faceStatus) {
        session.faceStatus = "Downloading face mapping…";
        const mb = (n: number): string => (n / 1e6).toFixed(1);
        session.tracker.loadFace((loaded, total) => {
          session.faceStatus = loaded >= total ? "Starting face mapping…"
            : `Downloading face mapping: ${mb(loaded)} of ${mb(total)} MB`;
        }).then(() => { session.faceStatus = ""; }).catch((e: Error) => {
          // Stays in the hint (no retry loop) until another placement is picked.
          session.faceStatus = `Face mapping couldn't start on this device (${e.message}). ` +
            "Pick another placement, or switch to the standard preview.";
        });
      }
      return;
    }
    let lm: { x: number; y: number }[] | null;
    try {
      lm = session.tracker.detectFace(video, now);
    } catch (e) {
      endAr();
      onError(`Face mapping stopped (${(e as Error).message}). The standard preview still works.`);
      return;
    }
    if (!lm) {
      if (session.face && now - session.lastSeen > AR_LOST_MS) {
        session.face = null;
        session.faceFilters = null;
      }
      return;
    }
    const cw = refs.canvas.width, ch = refs.canvas.height;
    const vw = video.videoWidth, vh = video.videoHeight;
    const f = (session.faceFilters ??= Array.from({ length: lm.length * 2 }, () => new OneEuro(1.5, 0.02)));
    session.face = lm.map((p, i) => {
      const c = videoToCanvas(p.x, p.y, vw, vh, crop, cw, ch, mirror);
      return { x: f[2 * i].filter(c.x, now), y: f[2 * i + 1].filter(c.y, now) };
    });
    session.lastSeen = now;
    if (!session.faceCenter) {
      const side = sideChoice() === "right" ? "right" : "left";
      session.faceCenter = uvOf(session.tracker.faceMesh, CHEEK_LANDMARK[side]);
    }
  }

  // The design, at most 512 px across, for drawing it hundreds of times a frame.
  let faceSrc: { from: CanvasImageSource; c: HTMLCanvasElement } | null = null;
  function faceSource(): HTMLCanvasElement | null {
    if (!design) return null;
    const from: CanvasImageSource = designProc ?? design;
    if (faceSrc?.from === from) return faceSrc.c;
    const k = Math.min(1, 512 / Math.max(design.naturalWidth, design.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(design.naturalWidth * k));
    c.height = Math.max(1, Math.round(design.naturalHeight * k));
    c.getContext("2d")?.drawImage(from, 0, 0, c.width, c.height);
    faceSrc = { from, c };
    return c;
  }

  /**
   * Face placement: lay the design out in the mesh's texture space and draw
   * each mesh triangle's piece of it onto the live face, so it bends over the
   * cheekbone, nose and brow. Triangles go to an offscreen canvas first, each
   * clipped a fraction of a pixel wide so no hairline seams show, and the
   * result is multiplied onto the frame once.
   */
  function drawFace(): void {
    if (!ar || !ctx) return;
    const pts = ar.face, center = ar.faceCenter, src = faceSource();
    if (!pts || !center || !src) return;
    const mesh = ar.tracker.faceMesh;
    const scale = cmPerUv(mesh, center.x, center.y) ?? { u: 16, v: 20 };
    const toUv = designToUv(src.width, src.height, center, tattooWCm, tattooHCm, getRotation(), scale, mirror);
    // UV box the design covers, to skip triangles it can't touch.
    const corners = [[0, 0], [src.width, 0], [0, src.height], [src.width, src.height]].map(([x, y]) => ({
      x: toUv[0] * x + toUv[2] * y + toUv[4], y: toUv[1] * x + toUv[3] * y + toUv[5],
    }));
    const u0 = Math.min(...corners.map((p) => p.x)), u1 = Math.max(...corners.map((p) => p.x));
    const v0 = Math.min(...corners.map((p) => p.y)), v1 = Math.max(...corners.map((p) => p.y));
    const sign = facingSign(mesh, pts);
    const cw = refs.canvas.width, ch = refs.canvas.height;
    const cc = (clipCanvas ??= document.createElement("canvas"));
    if (cc.width !== cw || cc.height !== ch) {
      cc.width = cw;
      cc.height = ch;
    }
    const c = cc.getContext("2d");
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const PAD = 0.6;
    for (let t = 0; t < mesh.tri.length / 3; t++) {
      const i0 = mesh.tri[3 * t], i1 = mesh.tri[3 * t + 1], i2 = mesh.tri[3 * t + 2];
      const a = uvOf(mesh, i0), b = uvOf(mesh, i1), d = uvOf(mesh, i2);
      if (Math.max(a.x, b.x, d.x) < u0 || Math.min(a.x, b.x, d.x) > u1 ||
          Math.max(a.y, b.y, d.y) < v0 || Math.min(a.y, b.y, d.y) > v1) continue;
      const p0 = pts[i0], p1 = pts[i1], p2 = pts[i2];
      if (windingOf(p0, p1, p2) !== sign) continue; // faces away
      const m = affineFromTriangles(a, b, d, p0, p1, p2);
      if (!m) continue;
      const cx = (p0.x + p1.x + p2.x) / 3, cy = (p0.y + p1.y + p2.y) / 3;
      const grow = (p: Pt): Pt => {
        const dx = p.x - cx, dy = p.y - cy, l = Math.hypot(dx, dy) || 1;
        return { x: p.x + (dx / l) * PAD, y: p.y + (dy / l) * PAD };
      };
      const g0 = grow(p0), g1 = grow(p1), g2 = grow(p2);
      c.save();
      c.beginPath();
      c.moveTo(g0.x, g0.y);
      c.lineTo(g1.x, g1.y);
      c.lineTo(g2.x, g2.y);
      c.closePath();
      c.clip();
      c.setTransform(...compose(m, toUv));
      c.drawImage(src, 0, 0);
      c.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = getOpacity();
    ctx.drawImage(cc, 0, 0);
    ctx.restore();
  }

  /** Draw a mask-sized canvas over c, lined up with the video as displayed. */
  function drawMaskCanvas(c: CanvasRenderingContext2D, m: HTMLCanvasElement | null, crop: Crop): void {
    if (!m || !video) return;
    const kx = m.width / video.videoWidth, ky = m.height / video.videoHeight;
    c.save();
    if (mirror) {
      c.translate(refs.canvas.width, 0);
      c.scale(-1, 1);
    }
    c.drawImage(m, crop.sx * kx, crop.sy * ky, crop.sw * kx, crop.sh * ky,
                0, 0, refs.canvas.width, refs.canvas.height);
    c.restore();
  }

  /**
   * Back of the hand: the design is laid out in centimetres on the back of
   * the hand and carried to the screen by the transform fitted to the wrist
   * and knuckles, so it turns, tilts and foreshortens with the hand. Nothing
   * is drawn while the palm is showing.
   */
  function drawHand(): void {
    if (!ar || !ctx || !design) return;
    const h = ar.hand;
    const m = h && palmAffine(h.palm, h.side, heightCm);
    if (!h || !m) return;
    const facing = backFacing(m, mirror);
    ar.hidden = facing <= 0.05;
    if (ar.hidden) return;
    const c0 = handCenterCm(h.side, heightCm);
    // Flipped in a mirrored view so the design reads the right way round, as on the face.
    const toCm = designToUv(design.naturalWidth, design.naturalHeight,
      { x: c0.x + ar.offset.u, y: c0.y + ar.offset.v }, tattooWCm, tattooHCm, getRotation(), { u: 1, v: 1 }, mirror);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    // Fades out as the hand comes edge on, where the knuckles stop being reliable.
    ctx.globalAlpha = getOpacity() * Math.min(1, facing / 0.3);
    ctx.setTransform(...compose(m, toCm));
    ctx.drawImage(designProc ?? design, 0, 0);
    ctx.restore();
  }

  /**
   * Paint the design on a limb that has turned: c's origin is on the limb's
   * axis, x runs across it. The design's middle is `turn` radians round the
   * limb from the side facing the camera, so it slides toward the edge as the
   * limb turns and is gone once it is round the back. Curved, it wraps the
   * limb; flat, it stays a flat sticker that narrows as it turns away.
   * Returns the x range drawn, or null when nothing is in view.
   */
  function paintRolled(
    c: CanvasRenderingContext2D, w: number, h: number, radius: number, turn: number, curved: boolean
  ): { x0: number; x1: number } | null {
    if (!design) return null;
    const src: CanvasImageSource = designProc ?? design;
    const r = (getRotation() * Math.PI) / 180;
    // The rotated design's bounding box: what the limb carries round.
    const bw = Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r));
    const bh = Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r));
    if (!curved) {
      const facing = Math.cos(turn);
      if (facing <= 0.02) return null;
      const x = radius * Math.sin(turn);
      c.save();
      c.translate(x, 0);
      c.scale(facing, 1);
      c.rotate(r);
      c.globalAlpha *= Math.min(1, facing / 0.3);
      c.drawImage(src, -w / 2, -h / 2, w, h);
      c.restore();
      return { x0: x - (bw * facing) / 2, x1: x + (bw * facing) / 2 };
    }
    // The design, turned as the visitor set it, on a canvas of its own; strips of that wrap the limb.
    const k = Math.min(1, 1024 / Math.max(bw, bh, 1));
    const decal = (decalCanvas ??= document.createElement("canvas"));
    const dw = Math.max(2, Math.ceil(bw * k)), dh = Math.max(2, Math.ceil(bh * k));
    if (decal.width !== dw || decal.height !== dh) {
      decal.width = dw;
      decal.height = dh;
    }
    const dctx = decal.getContext("2d");
    if (!dctx) return null;
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.clearRect(0, 0, dw, dh);
    dctx.translate(dw / 2, dh / 2);
    dctx.scale(k, k);
    dctx.rotate(r);
    dctx.drawImage(src, -w / 2, -h / 2, w, h);
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    const pieces = computeRolledStrips(dw, bw, radius, turn, 64);
    const off = (wrapCanvas ??= document.createElement("canvas"));
    const octx = off.getContext("2d");
    if (!pieces.length || !octx) return null;
    for (const p of pieces) {
      const pw = p.x1 - p.x0;
      const offW = Math.max(2, Math.ceil(pw)), offH = Math.max(2, Math.ceil(bh));
      if (off.width !== offW || off.height !== offH) {
        off.width = offW;
        off.height = offH;
      }
      octx.globalCompositeOperation = "source-over";
      octx.clearRect(0, 0, offW, offH);
      for (const st of p.strips) {
        if (st.u1 - st.u0 < 1e-6) continue;
        octx.drawImage(decal, st.u0, 0, st.u1 - st.u0, dh, ((st.x0 - p.x0) / pw) * offW, 0, ((st.x1 - st.x0) / pw) * offW, offH);
      }
      const g = octx.createLinearGradient(0, 0, offW, 0);
      for (let i = 0; i <= 8; i++) {
        g.addColorStop(i / 8, `rgba(0,0,0,${rolledShadeAt(p.x0 + (pw * i) / 8, radius).toFixed(3)})`);
      }
      octx.globalCompositeOperation = "destination-in";
      octx.fillStyle = g;
      octx.fillRect(0, 0, offW, offH);
      octx.globalCompositeOperation = "source-over";
      c.drawImage(off, p.x0, -bh / 2, pw, bh);
    }
    return { x0: Math.min(...pieces.map((p) => p.x0)), x1: Math.max(...pieces.map((p) => p.x1)) };
  }

  /** Radius of the wrist, cm, for the height entered. */
  const wristRadiusCm = (): number => limbRadiusCm(getBodyPart(WRIST)?.circumferenceCm ?? 17, heightCm);

  function drawTracked(crop: Crop): void {
    if (!ar || !design || !ctx) return;
    if (placementId === FACE) {
      drawFace();
      return;
    }
    if (placementId === HAND) {
      drawHand();
      return;
    }
    const a = ar.anchor;
    const followed = placementId in AR_PLACEMENTS || placementId === WRIST;
    if (!followed || !a) {
      // Untracked placement: the design stays where the visitor drags it.
      if (!followed) drawStandard(ctx);
      return;
    }
    // A forearm design is on one side of the arm: gone while the other side is showing.
    const face = forearmFace(placementId);
    const vis = face && ar.palmFacing !== null ? sideGate(face === "palm" ? ar.palmFacing : -ar.palmFacing) : 1;
    ar.hidden = vis <= 0;
    if (ar.hidden) return;
    const alpha = getOpacity() * vis;
    const w = tattooWCm * a.pxPerCm;
    const h = tattooHCm * a.pxPerCm;
    const across = { x: Math.cos(a.angle), y: Math.sin(a.angle) };
    const along = { x: -Math.sin(a.angle), y: Math.cos(a.angle) };
    // The wrist turns with the hand, so there the nudge across the limb goes round it instead.
    const rolled = placementId === WRIST && ar.roll !== null;
    const du = rolled ? 0 : ar.offset.u * a.pxPerCm, dv = ar.offset.v * a.pxPerCm * a.foreshorten;
    const cx = a.x + across.x * du + along.x * dv;
    const cy = a.y + across.y * du + along.y * dv;
    const span = !wrapToggle?.checked ? 0
      : ar.limbWidth ? wrapSpanFor(w, ar.limbWidth) : curveSpan();
    const clip = clothesToggle?.checked === true && ar.uncovered !== null;
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
    if (target === ctx) {
      target.globalCompositeOperation = "multiply";
      target.globalAlpha = alpha;
    }
    let mid = 0, dw = 0;
    if (rolled) {
      const radiusCm = wristRadiusCm();
      const ext = paintRolled(target, w, h, radiusCm * a.pxPerCm, wrapPi((ar.roll ?? 0) + ar.offset.u / radiusCm),
                              wrapToggle?.checked === true);
      ar.hidden = ext === null;
      if (ext) {
        mid = (ext.x0 + ext.x1) / 2;
        dw = ext.x1 - ext.x0;
      }
    } else {
      target.rotate((getRotation() * Math.PI) / 180);
      dw = paintDesign(target, w, h, span);
    }
    target.restore();
    if (target !== ctx) {
      target.globalCompositeOperation = "destination-in";
      drawMaskCanvas(target, ar.uncovered, crop);
      target.globalCompositeOperation = "source-over";
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = alpha;
      ctx.drawImage(clipCanvas!, 0, 0);
      ctx.restore();
    }
    Object.assign(drawn, {
      x: cx + across.x * mid, y: cy + across.y * mid, w: dw, h: h * a.foreshorten,
      rotation: (a.angle * 180) / Math.PI + (rolled ? 0 : getRotation()),
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
      if (AR_DEBUG) drawMaskCanvas(ctx, ar.tint, crop);
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
      cameraError = "";
      watchFrames(v);
      // Desktop webcams often don't report a facing mode; they face the
      // user, but the standard preview has always shown them unmirrored.
      mirror = (s.getVideoTracks()[0]?.getSettings().facingMode ?? facing) === "user";
    } catch (e) {
      s?.getTracks().forEach((t) => t.stop());
      // Said twice on purpose: the toast is where the eye is, and it closes;
      // the status line under the preview keeps the advice on the page.
      cameraError = cameraErrorMessage(e);
      onError(cameraError);
      refs.hint.textContent = cameraError;
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
    cameraError = "";
    syncControls();
    refs.hint.textContent = idleHint();
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
  sideSelect?.addEventListener("change", () => {
    resetTracking();
    if (ar) ar.faceCenter = null; // back to the cheek on the chosen side
  });

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
    } else if (calibrating || (ar && (placementId === FACE || isHandPlacement(placementId)))) {
      dragging = true; // the card outline, or the design on a face, hand or wrist, moves from anywhere
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
      if (ar && placementId === FACE) {
        // Move across the face in texture space, whichever way the head is turned.
        const ax = ar.face && ar.faceCenter ? faceAxes(ar.tracker.faceMesh, ar.face) : null;
        if (ax && ar.faceCenter) {
          const clamp01 = (v: number): number => Math.min(Math.max(v, 0.02), 0.98);
          ar.faceCenter = {
            x: clamp01(ar.faceCenter.x + (dx * ax.eu.x + dy * ax.eu.y) / ax.su),
            y: clamp01(ar.faceCenter.y + (dx * ax.ev.x + dy * ax.ev.y) / ax.sv),
          };
        }
      } else if (ar && placementId === HAND) {
        // Move over the back of the hand in its own centimetres, whichever way it is turned.
        const m = ar.hand && palmAffine(ar.hand.palm, ar.hand.side, heightCm);
        const det = m ? m[0] * m[3] - m[1] * m[2] : 0;
        if (m && Math.abs(det) > 1e-6) {
          const lim = handLengthCm(heightCm);
          const clampCm = (v: number): number => Math.min(Math.max(v, -lim), lim);
          ar.offset.u = clampCm(ar.offset.u + (m[3] * dx - m[2] * dy) / det);
          ar.offset.v = clampCm(ar.offset.v + (-m[1] * dx + m[0] * dy) / det);
        }
      } else if (ar && a && (AR_PLACEMENTS[placementId] || placementId === WRIST)) {
        // Nudge in the limb's own frame, so the offset rides along with it.
        const clampCm = (v: number): number => Math.min(Math.max(v, -AR_MAX_OFFSET_CM), AR_MAX_OFFSET_CM);
        const cos = Math.cos(a.angle), sin = Math.sin(a.angle);
        const du = (dx * cos + dy * sin) / a.pxPerCm;
        // Sideways on the wrist goes round it: keep the offset within one turn.
        ar.offset.u = placementId === WRIST ? wrapPi((ar.offset.u + du) / wristRadiusCm()) * wristRadiusCm()
          : clampCm(ar.offset.u + du);
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
    if (placementId === FACE) {
      if (ar.faceStatus) return ar.faceStatus;
      if (!ar.face) return "Looking for your face. Hold the phone at arm's length, facing you.";
      return `${sizeLabel} · mapped onto your face · size based on an average face · drag to move · pinch or scroll to resize`;
    }
    if (isHandPlacement(placementId)) {
      if (ar.handStatus) return ar.handStatus;
      const wrist = placementId === WRIST;
      if (!ar.hand) {
        return wrist ? "Looking for your hand. Hold your wrist and hand up to the camera; your face doesn't need to be in view."
          : "Looking for your hand. Hold it up to the camera, fingers apart; your face doesn't need to be in view.";
      }
      if (ar.hidden) {
        return wrist ? "The design is round the other side of your wrist. Turn your wrist over, or drag sideways to bring the design round."
          : "That's your palm. Turn the back of your hand to the camera.";
      }
      return wrist
        ? `${sizeLabel}, ${ar.hand.side} wrist · size estimated from your height · drag sideways to move it round your wrist · pinch or scroll to resize`
        : `${sizeLabel}, ${ar.hand.side} hand · size estimated from your height · drag to move · pinch or scroll to resize`;
    }
    const spec = AR_PLACEMENTS[placementId];
    const name = (getBodyPart(placementId)?.label ?? "this placement").toLowerCase();
    if (!spec) {
      return `Full AR doesn't follow the ${name}, so drag the design into place. ` +
        `It follows the ${AR_PLACEMENT_LIST}.`;
    }
    if (!ar.anchor) {
      return `Looking for you. Step back until ${spec.needs} are in view. ` +
        "It finds your face first, then the rest of you.";
    }
    if (ar.hidden) {
      return forearmFace(placementId) === "palm"
        ? "That's the outer side of your forearm. Turn your palm to the camera to see the design."
        : "That's the inner side of your forearm. Turn the back of your hand to the camera to see the design.";
    }
    const side = ar.anchor.side ? `, ${ar.anchor.side} side` : "";
    return `${sizeLabel}${side} · size estimated from your height · drag to adjust · pinch or scroll to resize`;
  }

  /** The status line while the camera is off. */
  function idleHint(): string {
    if (cameraError) return cameraError;
    return design ? "Design loaded — start the camera to preview it on your body." : "";
  }

  function updateHint(): void {
    if (arLoading) {
      refs.hint.textContent = arStatus;
      return;
    }
    if (!stream) {
      // Written rather than left alone: when Full AR's camera was refused the
      // line stayed on "Downloading body mapping…" for good, promising a
      // download that had been abandoned.
      const idle = idleHint();
      if (refs.hint.textContent !== idle) refs.hint.textContent = idle;
      return;
    }
    const text = ar ? trackingHint()
      : notice ? `${notice} ${cameraHint({ calibrating, calibrated, sizeLabel })}`
      : cameraHint({ calibrating, calibrated, sizeLabel });
    // Called every frame in Full AR: only touch the live region on a change.
    if (refs.hint.textContent !== text) refs.hint.textContent = text;
  }

  syncControls();
  // ?ar-debug: the live Full AR state, for checking a device from its console.
  if (AR_DEBUG) {
    (window as unknown as { tsAr: () => unknown }).tsAr = () => ar && {
      placementId, delegate: ar.tracker.delegate, side: ar.side, anchor: ar.anchor,
      faceCenter: ar.faceCenter, faceStatus: ar.faceStatus, mirror,
      frame: ar.frame, ms: debugMs, hand: ar.hand, handStatus: ar.handStatus, roll: ar.roll, palmFacing: ar.palmFacing, hidden: ar.hidden, offset: ar.offset,
      facePoints: ar.face && { 10: ar.face[10], 152: ar.face[152], 234: ar.face[234], 454: ar.face[454], 1: ar.face[1] },
    };
  }

  return {
    setDesign(img: HTMLImageElement): void {
      design = img;
      rebuildProcessedDesign();
      syncControls();
      if (!stream) refs.hint.textContent = idleHint();
    },
    setTattooSize(wCm: number, hCm: number, label: string): void {
      tattooWCm = wCm;
      tattooHCm = hCm;
      sizeLabel = label;
      updateHint();
    },
    setPlacement(id: string, h: number): void {
      const changed = id !== placementId;
      if (changed && ar) {
        resetTracking();
        ar.offset = { u: 0, v: 0 };
        ar.faceCenter = null;
        if (!ar.tracker.faceReady()) ar.faceStatus = "";
        if (!ar.tracker.handReady()) ar.handStatus = "";
      }
      placementId = id;
      heightCm = h;
      if (changed) syncControls();
    },
    async startAr(load): Promise<void> {
      if (ar || arLoading || !design) return;
      arLoading = true;
      endCalibration(false);
      arStatus = "Downloading body mapping…";
      if (progress) progress.value = 0;
      syncControls();
      updateHint();
      const mb = (n: number): string => (n / 1e6).toFixed(0);
      const trackerP = load((loaded, total) => {
        arStatus = `Downloading body mapping: ${mb(loaded)} of ${mb(total)} MB`;
        if (progress) progress.value = total ? loaded / total : 0;
        if (loaded >= total) arStatus = "Starting body mapping…";
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
          offset: { u: 0, v: 0 }, limbWidth: null, mask: null, uncovered: null, uncoveredImg: null, tint: null, filters: newFilters(),
          face: null, faceFilters: null, faceCenter: null, faceStatus: "",
          hand: null, handFilters: null, handStatus: "", roll: null, palmFacing: null, palmSeen: 0, hidden: false,
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
