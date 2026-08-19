/**
 * TattooSafe — tier-1 camera preview.
 *
 * Live camera feed on a canvas with the uploaded design composited on top.
 * Manual placement: drag to move, pinch (or wheel) to resize, existing
 * rotation/opacity sliders apply live. No body tracking — the user lines
 * the design up against their own reflection, then screenshots it.
 *
 * Pure geometry helpers are exported for unit tests; DOM/media wiring is
 * in setupCameraPreview().
 */

import { removeFlatBackground, invertForDarkBackdrop } from "./engine";

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

export interface WrapStrip {
  /** Source x range, in design pixels. */
  u0: number;
  u1: number;
  /** Destination x range, centered on 0, in display pixels. */
  x0: number;
  x1: number;
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
  const X = R * Math.sin(sp / 2);
  const projW = 2 * X;
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
 * Is a canvas point inside the (rotated) overlay? Used to decide whether a
 * pointer-down starts a drag. Rotation in degrees, matching the UI slider.
 */
export function hitTest(
  px: number, py: number,
  state: OverlayState, imgW: number, imgH: number, canvasW: number, rotationDeg: number
): boolean {
  const { w, h } = drawSize(imgW, imgH, canvasW, state.scale);
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
   * Reflect the size panel: real-world dimensions (always cm — they drive
   * the overlay's base size) plus the unit the size hint should display.
   */
  setTattooSize(wCm: number, hCm: number, placementLabel: string, displayUnit?: "cm" | "in"): void;
  /** True while the camera is streaming. */
  isActive(): boolean;
}

export function setupCameraPreview(
  getRotation: () => number,
  getOpacity: () => number,
  onError: (msg: string) => void
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
  // Real-world tattoo size from the settings panel. The camera can't know
  // true scale without a reference object, so we assume the visible frame is
  // ~VIEW_WIDTH_CM across at typical arm's-length framing; pinch refines it.
  const VIEW_WIDTH_CM = 50;
  let tattooWCm = 0;
  let tattooHCm = 0;
  let placement = "";
  let hintUnit: "cm" | "in" = "cm";
  const wrapToggle = document.querySelector<HTMLInputElement>("#ar-wrap");
  const wrapLabel = document.querySelector<HTMLElement>("#ar-wrap-label");
  const curveSlider = document.querySelector<HTMLInputElement>("#ar-curve");
  const curveLabel = document.querySelector<HTMLElement>("#ar-curve-label");
  const removeBgToggle = document.querySelector<HTMLInputElement>("#ar-removebg");
  const removeBgLabel = document.querySelector<HTMLElement>("#ar-removebg-label");
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
  const state: OverlayState = { x: 0, y: 0, scale: 1 };

  // Pointer tracking for drag + pinch
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let pinchStartDist = 0;
  let pinchStartScale = 1;

  const canvasPoint = (e: PointerEvent): { x: number; y: number } => {
    const r = refs.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * refs.canvas.width,
      y: ((e.clientY - r.top) / r.height) * refs.canvas.height,
    };
  };

  function render(): void {
    if (!video || !ctx) return;
    const { canvas } = refs;
    if (video.videoWidth && canvas.width !== canvas.clientWidth) {
      canvas.width = canvas.clientWidth;
      canvas.height = Math.round((canvas.clientWidth * 3) / 4);
      if (state.x === 0 && state.y === 0) {
        state.x = canvas.width / 2;
        state.y = canvas.height / 2;
      }
    }
    const crop = coverCrop(video.videoWidth, video.videoHeight, canvas.width, canvas.height);
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);

    if (design) {
      let w: number, h: number;
      if (tattooWCm > 0) {
        // cm-driven: overlay width maps the declared size onto the assumed frame width
        w = canvas.width * (tattooWCm / VIEW_WIDTH_CM) * state.scale;
        h = tattooHCm > 0 ? (w * tattooHCm) / tattooWCm
                          : (w * design.naturalHeight) / design.naturalWidth;
      } else {
        ({ w, h } = drawSize(design.naturalWidth, design.naturalHeight, canvas.width, state.scale));
      }
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
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
        audio: false,
      });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch {
        onError("Camera unavailable. Check browser permissions and try again.");
        return;
      }
    }
    video = document.createElement("video");
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    await video.play();
    refs.section.classList.add("ar--active");
    refs.startBtn.hidden = true;
    refs.stopBtn.hidden = false;
    refs.shotBtn.hidden = false;
    if (wrapLabel) wrapLabel.hidden = false;
    if (curveLabel) curveLabel.hidden = false;
    if (removeBgLabel) removeBgLabel.hidden = false;
    updateHint();
    raf = requestAnimationFrame(render);
  }

  function stop(): void {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video = null;
    refs.section.classList.remove("ar--active");
    refs.startBtn.hidden = false;
    refs.stopBtn.hidden = true;
    refs.shotBtn.hidden = true;
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

  refs.canvas.addEventListener("pointerdown", (e) => {
    refs.canvas.setPointerCapture(e.pointerId);
    const p = canvasPoint(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStartScale = state.scale;
      dragging = false;
    } else if (design && hitTest(p.x, p.y, state, design.naturalWidth, design.naturalHeight, refs.canvas.width, getRotation())) {
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
      state.scale = pinchScale(pinchStartScale, pinchStartDist, Math.hypot(a.x - b.x, a.y - b.y));
    } else if (dragging) {
      const c = clampCenter(state.x + (p.x - prev.x), state.y + (p.y - prev.y), refs.canvas.width, refs.canvas.height);
      state.x = c.x;
      state.y = c.y;
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
    state.scale = wheelScale(state.scale, e.deltaY);
  }, { passive: false });

  // Don't hold the camera open in a background tab.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && stream) stop();
  });

  function updateHint(): void {
    if (!stream) return;
    const fmt = (cm: number): number =>
      Math.round((hintUnit === "in" ? cm / 2.54 : cm) * 10) / 10;
    const size = tattooWCm > 0
      ? `${fmt(tattooWCm)} × ${fmt(tattooHCm)} ${hintUnit}${placement ? " on " + placement : ""} · `
      : "";
    refs.hint.textContent = `${size}drag to position · pinch to calibrate scale · curve slider bends the design around a limb (manual)`;
  }

  return {
    setDesign(img: HTMLImageElement): void {
      design = img;
      rebuildProcessedDesign();
      refs.startBtn.disabled = false;
      if (!stream) refs.hint.textContent = "Design loaded — start the camera to preview it on your body.";
    },
    setTattooSize(wCm: number, hCm: number, placementLabel: string, displayUnit: "cm" | "in" = "cm"): void {
      tattooWCm = wCm;
      tattooHCm = hCm;
      placement = placementLabel;
      hintUnit = displayUnit;
      updateHint();
    },
    isActive: () => stream !== null,
  };
}
