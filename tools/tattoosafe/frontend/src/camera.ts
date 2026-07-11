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
  /** Reflect the size panel: real-world dimensions drive the overlay's base size. */
  setTattooSize(wCm: number, hCm: number, placementLabel: string): void;
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
  const wrapToggle = document.querySelector<HTMLInputElement>("#ar-wrap");
  const wrapLabel = document.querySelector<HTMLElement>("#ar-wrap-label");
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
      // Multiply blend settles the design into skin tones like real ink.
      ctx.globalCompositeOperation = "multiply";
      if (wrapToggle?.checked) {
        // Cylindrical illusion without tracking: vertical strips compress
        // toward the edges (sin mapping) and fade slightly, as if the design
        // wraps around a limb. Cheap, dependency-free, runs per frame.
        const STRIPS = 32;
        const srcW = design.naturalWidth / STRIPS;
        for (let i = 0; i < STRIPS; i++) {
          const t0 = i / STRIPS, t1 = (i + 1) / STRIPS, tm = (t0 + t1) / 2;
          const x0 = (Math.sin((t0 - 0.5) * Math.PI) / 2 + 0.5) * w;
          const x1 = (Math.sin((t1 - 0.5) * Math.PI) / 2 + 0.5) * w;
          ctx.globalAlpha = alpha * (0.45 + 0.55 * Math.cos((tm - 0.5) * Math.PI));
          ctx.drawImage(design, i * srcW, 0, srcW, design.naturalHeight,
                        -w / 2 + x0, -h / 2, Math.max(x1 - x0, 0.5), h);
        }
      } else {
        ctx.globalAlpha = alpha;
        ctx.drawImage(design, -w / 2, -h / 2, w, h);
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
    const size = tattooWCm > 0 ? `${tattooWCm} × ${tattooHCm} cm${placement ? " on " + placement : ""} · ` : "";
    refs.hint.textContent = `${size}drag to position · pinch to calibrate scale · sliders set angle & opacity`;
  }

  return {
    setDesign(img: HTMLImageElement): void {
      design = img;
      refs.startBtn.disabled = false;
      if (!stream) refs.hint.textContent = "Design loaded — start the camera to preview it on your body.";
    },
    setTattooSize(wCm: number, hCm: number, placementLabel: string): void {
      tattooWCm = wCm;
      tattooHCm = hCm;
      placement = placementLabel;
      updateHint();
    },
    isActive: () => stream !== null,
  };
}
