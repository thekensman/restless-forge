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

import { removeFlatBackground, invertForDarkBackdrop, MIN_TATTOO_CM, MAX_TATTOO_CM } from "./engine";

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
  /** Give the preview the (new) design image. Enables the start button. */
  setDesign(img: HTMLImageElement): void;
  /**
   * Reflect the size panel: real-world dimensions in cm (they drive the
   * overlay's size) and the size as the page displays it, for the hint.
   */
  setTattooSize(wCm: number, hCm: number, sizeLabel: string): void;
  /** True while the camera is streaming. */
  isActive(): boolean;
}

export function setupCameraPreview(
  getRotation: () => number,
  getOpacity: () => number,
  onError: (msg: string) => void,
  /** Pinch on a calibrated preview resizes the tattoo: new size in cm. */
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
  let wrapCanvas: HTMLCanvasElement | null = null;
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
  const state: OverlayState = { x: 0, y: 0, scale: 1 };
  // Size the design was last drawn at (wrapped width when curved), for hit-testing.
  let drawnW = 0;
  let drawnH = 0;

  // Calibration
  let calibrating = false;
  let calibrated = false;
  let frameWidthCm = DEFAULT_FRAME_WIDTH_CM;
  /** Video aspect at calibration; a change (phone rotated) invalidates it. */
  let calAspect = 0;
  let notice = "";
  const card = { x: 0, y: 0, w: 0 };

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
    if (!stream || !video) return;
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

  /** Pinch on a calibrated preview: resize the tattoo itself, in cm. */
  function resizeTattoo(baseW: number, baseH: number, f: number): void {
    const s = scaleSize(baseW, baseH, f, MIN_TATTOO_CM, MAX_TATTOO_CM);
    onResize?.(s.w, s.h);
  }

  function render(): void {
    if (!video || !ctx) return;
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
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);

    if (calibrating) {
      drawCard(ctx);
    } else if (design) {
      const { w, h } = overlaySize(canvas.width, frameWidthCm, tattooWCm, tattooHCm,
                                   design.naturalWidth, design.naturalHeight, state.scale);
      drawnW = w;
      drawnH = h;
      ctx.save();
      ctx.translate(state.x, state.y);
      ctx.rotate((getRotation() * Math.PI) / 180);
      const alpha = getOpacity();
      const src: CanvasImageSource = designProc ?? design;
      // Multiply blend settles the design into skin tones like real ink.
      ctx.globalCompositeOperation = "multiply";
      const span = curveSpan();
      if (wrapToggle?.checked && span > 0.02) {
        // Static cylindrical illusion: the design is projected onto a
        // cylinder whose curvature the user sets with the curve slider
        // (this is a manual try-on aid, NOT limb tracking — the tool has
        // no ML and can't detect the actual limb). Strips render seam-free
        // onto a cached offscreen canvas with geometric cos(θ) shading and
        // composite once.
        const { projW, strips } = computeWrapStrips(design.naturalWidth, w, 64, span);
        drawnW = projW;
        const off = (wrapCanvas ??= document.createElement("canvas"));
        const offW = Math.max(2, Math.ceil(projW));
        const offH = Math.max(2, Math.ceil(h));
        if (off.width !== offW || off.height !== offH) {
          off.width = offW;
          off.height = offH;
        }
        const octx = off.getContext("2d");
        if (octx) {
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
          ctx.globalAlpha = alpha;
          ctx.drawImage(off, -projW / 2, -h / 2, projW, h);
        }
      } else {
        ctx.globalAlpha = alpha;
        ctx.drawImage(src, -w / 2, -h / 2, w, h);
      }
      ctx.restore();
    }
    raf = requestAnimationFrame(render);
  }

  async function start(): Promise<void> {
    if (starting || stream) return;
    starting = true;
    refs.startBtn.disabled = true;
    const token = ++startToken;
    let s: MediaStream | null = null;
    try {
      try {
        s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 } },
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
    } catch {
      s?.getTracks().forEach((t) => t.stop());
      onError("Camera unavailable. Check browser permissions and try again.");
      return;
    } finally {
      starting = false;
      refs.startBtn.disabled = !design;
    }
    refs.section.classList.add("ar--active");
    refs.startBtn.hidden = true;
    refs.stopBtn.hidden = false;
    refs.shotBtn.hidden = false;
    if (calBtn) calBtn.hidden = false;
    if (wrapLabel) wrapLabel.hidden = false;
    if (curveLabel) curveLabel.hidden = false;
    if (removeBgLabel) removeBgLabel.hidden = false;
    updateHint();
    raf = requestAnimationFrame(render);
  }

  function stop(): void {
    startToken++;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video = null;
    endCalibration(false);
    // A new session is a new distance: the old calibration no longer holds.
    resetCalibration();
    notice = "";
    refs.section.classList.remove("ar--active");
    refs.startBtn.hidden = false;
    refs.stopBtn.hidden = true;
    refs.shotBtn.hidden = true;
    if (calBtn) calBtn.hidden = true;
    if (wrapLabel) wrapLabel.hidden = true;
    if (curveLabel) curveLabel.hidden = true;
    if (removeBgLabel) removeBgLabel.hidden = true;
    refs.hint.textContent = "";
    ctx?.clearRect(0, 0, refs.canvas.width, refs.canvas.height);
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
  calBtn?.addEventListener("click", beginCalibration);
  calDone?.addEventListener("click", () => endCalibration(true));
  calCancel?.addEventListener("click", () => endCalibration(false));
  calSize?.addEventListener("input", () => setCardWidth((Number(calSize.value) / 100) * refs.canvas.width));

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
    } else if (design && hitTest(p.x, p.y, state, drawnW, drawnH, getRotation())) {
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
      else if (calibrated) resizeTattoo(pinchStartW, pinchStartH, dist / pinchStartDist);
      else state.scale = pinchScale(pinchStartScale, pinchStartDist, dist);
    } else if (dragging) {
      const target = calibrating ? card : state;
      const c = clampCenter(target.x + (p.x - prev.x), target.y + (p.y - prev.y), refs.canvas.width, refs.canvas.height);
      target.x = c.x;
      target.y = c.y;
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
    else if (calibrated) resizeTattoo(tattooWCm, tattooHCm, f);
    else state.scale = wheelScale(state.scale, e.deltaY);
  }, { passive: false });

  // Don't hold the camera open in a background tab.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (stream || starting)) stop();
  });

  function updateHint(): void {
    if (!stream) return;
    const hint = cameraHint({ calibrating, calibrated, sizeLabel });
    refs.hint.textContent = notice ? `${notice} ${hint}` : hint;
  }

  return {
    setDesign(img: HTMLImageElement): void {
      design = img;
      rebuildProcessedDesign();
      refs.startBtn.disabled = starting;
      if (!stream) refs.hint.textContent = "Design loaded — start the camera to preview it on your body.";
    },
    setTattooSize(wCm: number, hCm: number, label: string): void {
      tattooWCm = wCm;
      tattooHCm = hCm;
      sizeLabel = label;
      updateHint();
    },
    isActive: () => stream !== null,
  };
}
