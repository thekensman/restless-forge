/* ForgeImage — Canvas wiring around engine.ts.
   A shared preview stage shows the live OUTPUT of the active operation:
   resize renders the resized result, crop overlays a draggable rect on
   the source, convert renders the actual encoded bytes. */

import {
  resizeDims,
  centeredAspectCrop,
  coverCropForPreset,
  targetSizeQuality,
  fitWithin,
  dragCropRect,
  hitCropHandle,
  fmtBytes,
  CropRect,
  CropHandle,
  ASPECT_PRESETS,
  FORMATS,
  SOCIAL_PRESETS,
} from "./engine";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const STAGE_MAX_W = 600;
const STAGE_MAX_H = 420;

let img: HTMLImageElement | null = null;
let srcName = "image";
let activeOp = "resize";
let cropRect: CropRect | null = null;
let dragging: { handle: CropHandle; lastX: number; lastY: number } | null = null;
let convertTimer = 0;

const status = (msg: string, isError = false): void => {
  const el = $("op-status");
  el.textContent = msg;
  el.classList.toggle("is-error", isError);
};
const clearDownloads = (): void => {
  $("op-downloads").innerHTML = "";
};
const caption = (msg: string): void => {
  $("stage-caption").textContent = msg;
};

function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encoding failed"))), mime, quality),
  );
}

function draw(sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): HTMLCanvasElement {
  if (!img) throw new Error("Pick an image first");
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(dw));
  c.height = Math.max(1, Math.round(dh));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

function offerBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.className = "op-download";
  a.textContent = `⬇ ${filename} (${fmtBytes(blob.size)})`;
  $("op-downloads").appendChild(a);
}

const baseName = (): string => srcName.replace(/\.[^.]+$/, "");

async function runOp(label: string, fn: () => Promise<void>): Promise<void> {
  clearDownloads();
  status(`${label}…`);
  try {
    await fn();
    status("Done — download below.");
  } catch (e) {
    status(e instanceof Error ? e.message : String(e), true);
  }
}

/* ── resize state ── */
function readResizeDims(): { w: number; h: number } {
  const w = Number($<HTMLInputElement>("rs-width").value) || img?.naturalWidth || 1;
  const h = Number($<HTMLInputElement>("rs-height").value) || img?.naturalHeight || 1;
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

function setResize(w: number, h: number): void {
  $<HTMLInputElement>("rs-width").value = String(Math.round(w));
  $<HTMLInputElement>("rs-height").value = String(Math.round(h));
  $<HTMLInputElement>("rs-width-slider").value = String(Math.round(w));
  $<HTMLInputElement>("rs-height-slider").value = String(Math.round(h));
  $("rs-width-out").textContent = String(Math.round(w));
  $("rs-height-out").textContent = String(Math.round(h));
}

function onResizeAxis(axis: "width" | "height", value: number): void {
  if (!img) return;
  const lock = $<HTMLInputElement>("rs-lock").checked;
  const cur = readResizeDims();
  if (axis === "width") {
    const d = lock ? resizeDims({ w: img.naturalWidth, h: img.naturalHeight }, { width: value }) : { w: value, h: cur.h };
    setResize(d.w, d.h);
  } else {
    const d = lock ? resizeDims({ w: img.naturalWidth, h: img.naturalHeight }, { height: value }) : { w: cur.w, h: value };
    setResize(d.w, d.h);
  }
  renderStage();
}

/* ── stage rendering ── */
function stageCtx(): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = $<HTMLCanvasElement>("stage");
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  return { c, ctx };
}

function renderStage(): void {
  const empty = $("stage-empty");
  const { c, ctx } = stageCtx();
  if (!img) {
    c.classList.remove("is-visible");
    empty.hidden = false;
    caption("");
    return;
  }
  empty.hidden = true;
  c.classList.add("is-visible");
  c.classList.toggle("is-cropping", activeOp === "crop");

  if (activeOp === "resize") {
    const target = readResizeDims();
    const fit = fitWithin(target, STAGE_MAX_W, STAGE_MAX_H);
    c.width = fit.w;
    c.height = fit.h;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, fit.w, fit.h);
    caption(`Output: ${target.w} × ${target.h} px${fit.scale < 1 ? ` (preview at ${(fit.scale * 100).toFixed(0)}%)` : ""}`);
    return;
  }

  // Default: source image fitted to the stage (crop adds its overlay).
  const fit = fitWithin({ w: img.naturalWidth, h: img.naturalHeight }, STAGE_MAX_W, STAGE_MAX_H);
  c.width = fit.w;
  c.height = fit.h;
  ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, fit.w, fit.h);

  if (activeOp === "crop" && cropRect) {
    const s = fit.scale;
    const r = { x: cropRect.x * s, y: cropRect.y * s, w: cropRect.w * s, h: cropRect.h * s };
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, c.width, r.y);
    ctx.fillRect(0, r.y + r.h, c.width, c.height - r.y - r.h);
    ctx.fillRect(0, r.y, r.x, r.h);
    ctx.fillRect(r.x + r.w, r.y, c.width - r.x - r.w, r.h);
    ctx.strokeStyle = "#58c470";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
    ctx.fillStyle = "#58c470";
    for (const [hx, hy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
      ctx.fillRect(hx - 5, hy - 5, 10, 10);
    }
    caption("");
    $("cr-meta").textContent = `Selection: ${Math.round(cropRect.w)} × ${Math.round(cropRect.h)} px at (${Math.round(cropRect.x)}, ${Math.round(cropRect.y)})`;
    return;
  }

  caption(`${img.naturalWidth} × ${img.naturalHeight} px`);
  if (activeOp === "convert") scheduleConvertPreview();
}

/** Convert tab: render the ACTUAL encoded output into the stage (debounced). */
function scheduleConvertPreview(): void {
  window.clearTimeout(convertTimer);
  convertTimer = window.setTimeout(async () => {
    if (!img || activeOp !== "convert") return;
    try {
      const f = FORMATS.find((x) => x.id === $<HTMLSelectElement>("cv-format").value)!;
      const q = Number($<HTMLInputElement>("cv-quality").value) / 100;
      const full = draw(0, 0, img.naturalWidth, img.naturalHeight, img.naturalWidth, img.naturalHeight);
      const blob = await toBlob(full, f.mime, f.lossy ? q : undefined);
      const url = URL.createObjectURL(blob);
      const preview = new Image();
      preview.onload = () => {
        if (activeOp !== "convert") return;
        const { c, ctx } = stageCtx();
        const fit = fitWithin({ w: preview.naturalWidth, h: preview.naturalHeight }, STAGE_MAX_W, STAGE_MAX_H);
        c.width = fit.w;
        c.height = fit.h;
        ctx.drawImage(preview, 0, 0, fit.w, fit.h);
        caption(`${f.label}${f.lossy ? ` @ ${Math.round(q * 100)}%` : ""} → ${fmtBytes(blob.size)}`);
        URL.revokeObjectURL(url);
      };
      preview.src = url;
    } catch {
      /* stage keeps last frame */
    }
  }, 180);
}

/* ── crop pointer interaction ── */
function stagePoint(e: PointerEvent): { x: number; y: number; scale: number } {
  const c = $<HTMLCanvasElement>("stage");
  const r = c.getBoundingClientRect();
  const fit = fitWithin({ w: img!.naturalWidth, h: img!.naturalHeight }, STAGE_MAX_W, STAGE_MAX_H);
  const x = ((e.clientX - r.left) / r.width) * c.width;
  const y = ((e.clientY - r.top) / r.height) * c.height;
  return { x, y, scale: fit.scale };
}

function currentAspect(): { w: number; h: number } | null {
  const id = $<HTMLSelectElement>("cr-aspect").value;
  const a = ASPECT_PRESETS.find((x) => x.id === id);
  return a ? { w: a.w, h: a.h } : null;
}

function initCropPointer(): void {
  const c = $<HTMLCanvasElement>("stage");
  c.addEventListener("pointerdown", (e) => {
    if (activeOp !== "crop" || !img || !cropRect) return;
    const p = stagePoint(e);
    const dispRect = {
      x: cropRect.x * p.scale, y: cropRect.y * p.scale,
      w: cropRect.w * p.scale, h: cropRect.h * p.scale,
    };
    const handle = hitCropHandle(p.x, p.y, dispRect, 12);
    if (!handle) return;
    dragging = { handle, lastX: p.x, lastY: p.y };
    c.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  c.addEventListener("pointermove", (e) => {
    if (!dragging || !img || !cropRect) return;
    const p = stagePoint(e);
    const dx = (p.x - dragging.lastX) / p.scale;
    const dy = (p.y - dragging.lastY) / p.scale;
    dragging.lastX = p.x;
    dragging.lastY = p.y;
    cropRect = dragCropRect(cropRect, dragging.handle, dx, dy,
      { w: img.naturalWidth, h: img.naturalHeight }, currentAspect());
    renderStage();
  });
  const stop = (): void => {
    dragging = null;
  };
  c.addEventListener("pointerup", stop);
  c.addEventListener("pointercancel", stop);
}

function resetCropRect(): void {
  if (!img) return;
  const dims = { w: img.naturalWidth, h: img.naturalHeight };
  const a = currentAspect();
  cropRect = a
    ? centeredAspectCrop(dims, a.w, a.h)
    : { x: Math.round(dims.w * 0.1), y: Math.round(dims.h * 0.1), w: Math.round(dims.w * 0.8), h: Math.round(dims.h * 0.8) };
}

/* ── tabs + wiring ── */
function initTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".op-tab");
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.toggle("is-active", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      });
      document.querySelectorAll<HTMLElement>(".op-panel").forEach((p) => {
        p.hidden = p.id !== `panel-${tab.dataset.op}`;
      });
      activeOp = tab.dataset.op ?? "resize";
      if (activeOp === "crop" && !cropRect) resetCropRect();
      status("");
      clearDownloads();
      renderStage();
    }),
  );
}

function init(): void {
  initTabs();
  initCropPointer();

  $<HTMLSelectElement>("cr-aspect").innerHTML =
    `<option value="free">Free</option>` +
    ASPECT_PRESETS.map((a) => `<option value="${a.id}">${a.label}</option>`).join("");
  $<HTMLSelectElement>("cv-format").innerHTML = FORMATS.map(
    (f) => `<option value="${f.id}">${f.label}</option>`,
  ).join("");
  $("social-list").innerHTML = SOCIAL_PRESETS.map(
    (p) => `<li>${p.label} — ${p.w}×${p.h}</li>`,
  ).join("");

  $<HTMLInputElement>("img-file").addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    srcName = f.name;
    const url = URL.createObjectURL(f);
    const el = new Image();
    el.onload = () => {
      img = el;
      $("img-meta").textContent = `${f.name}: ${el.naturalWidth}×${el.naturalHeight}, ${fmtBytes(f.size)}`;
      // seed resize controls: sliders span 1..2x natural size
      for (const [slider, max] of [
        ["rs-width-slider", el.naturalWidth * 2],
        ["rs-height-slider", el.naturalHeight * 2],
      ] as const) {
        $<HTMLInputElement>(slider).max = String(Math.max(16, Math.round(max)));
      }
      setResize(el.naturalWidth, el.naturalHeight);
      resetCropRect();
      renderStage();
    };
    el.onerror = () => status("Could not read that image.", true);
    el.src = url;
  });

  // resize: slider ↔ number, live preview
  $("rs-width-slider").addEventListener("input", () =>
    onResizeAxis("width", Number($<HTMLInputElement>("rs-width-slider").value)));
  $("rs-height-slider").addEventListener("input", () =>
    onResizeAxis("height", Number($<HTMLInputElement>("rs-height-slider").value)));
  $("rs-width").addEventListener("input", () =>
    onResizeAxis("width", Number($<HTMLInputElement>("rs-width").value) || 1));
  $("rs-height").addEventListener("input", () =>
    onResizeAxis("height", Number($<HTMLInputElement>("rs-height").value) || 1));
  $("rs-lock").addEventListener("change", () => {
    if ($<HTMLInputElement>("rs-lock").checked && img) {
      onResizeAxis("width", readResizeDims().w);
    }
  });

  $("rs-run").addEventListener("click", () =>
    runOp("Resizing", async () => {
      if (!img) throw new Error("Pick an image first");
      const d = readResizeDims();
      const c = draw(0, 0, img.naturalWidth, img.naturalHeight, d.w, d.h);
      offerBlob(await toBlob(c, "image/png"), `${baseName()}-${d.w}x${d.h}.png`);
    }),
  );

  $("cr-aspect").addEventListener("change", () => {
    resetCropRect();
    renderStage();
  });
  $("cr-run").addEventListener("click", () =>
    runOp("Cropping", async () => {
      if (!img || !cropRect) throw new Error("Pick an image first");
      const r = cropRect;
      const c = draw(r.x, r.y, r.w, r.h, r.w, r.h);
      offerBlob(await toBlob(c, "image/png"), `${baseName()}-crop-${Math.round(r.w)}x${Math.round(r.h)}.png`);
    }),
  );

  $("cv-format").addEventListener("change", () => renderStage());
  $("cv-quality").addEventListener("input", () => scheduleConvertPreview());
  $("cv-run").addEventListener("click", () =>
    runOp("Converting", async () => {
      if (!img) throw new Error("Pick an image first");
      const f = FORMATS.find((x) => x.id === $<HTMLSelectElement>("cv-format").value)!;
      const q = Number($<HTMLInputElement>("cv-quality").value) / 100;
      const c = draw(0, 0, img.naturalWidth, img.naturalHeight, img.naturalWidth, img.naturalHeight);
      offerBlob(await toBlob(c, f.mime, f.lossy ? q : undefined), `${baseName()}.${f.ext}`);
    }),
  );

  $("cp-run").addEventListener("click", () =>
    runOp("Compressing", async () => {
      if (!img) throw new Error("Pick an image first");
      const target = Number($<HTMLInputElement>("cp-target").value) * 1024;
      const c = draw(0, 0, img.naturalWidth, img.naturalHeight, img.naturalWidth, img.naturalHeight);
      const res = await targetSizeQuality(async (q) => (await toBlob(c, "image/jpeg", q)).size, target);
      if (!res) throw new Error("Can't reach that size — try resizing smaller first");
      const blob = await toBlob(c, "image/jpeg", res.quality);
      offerBlob(blob, `${baseName()}-compressed.jpg`);
      status(`Done — quality ${(res.quality * 100).toFixed(0)}%, ${fmtBytes(blob.size)}.`);
    }),
  );

  $("social-run").addEventListener("click", () =>
    runOp("Generating sizes", async () => {
      if (!img) throw new Error("Pick an image first");
      for (const p of SOCIAL_PRESETS) {
        const r = coverCropForPreset({ w: img.naturalWidth, h: img.naturalHeight }, p);
        const c = draw(r.x, r.y, r.w, r.h, p.w, p.h);
        offerBlob(await toBlob(c, "image/jpeg", 0.88), `${baseName()}-${p.id}.jpg`);
      }
    }),
  );

  renderStage();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
