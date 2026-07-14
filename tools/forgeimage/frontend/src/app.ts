/* ForgeImage — Canvas wiring around engine.ts. */

import {
  resizeDims,
  centeredAspectCrop,
  coverCropForPreset,
  targetSizeQuality,
  fmtBytes,
  ASPECT_PRESETS,
  FORMATS,
  SOCIAL_PRESETS,
} from "./engine";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

let img: HTMLImageElement | null = null;
let srcName = "image";

const status = (msg: string, isError = false): void => {
  const el = $("op-status");
  el.textContent = msg;
  el.classList.toggle("is-error", isError);
};

const clearDownloads = (): void => {
  $("op-downloads").innerHTML = "";
};

function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encoding failed"))), mime, quality),
  );
}

function draw(sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): HTMLCanvasElement {
  if (!img) throw new Error("Pick an image first");
  const c = document.createElement("canvas");
  c.width = dw;
  c.height = dh;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
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
      status("");
      clearDownloads();
    }),
  );
}

function init(): void {
  initTabs();

  $<HTMLSelectElement>("cr-aspect").innerHTML = ASPECT_PRESETS.map(
    (a) => `<option value="${a.id}">${a.label}</option>`,
  ).join("");
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
    };
    el.onerror = () => status("Could not read that image.", true);
    el.src = url;
  });

  $("rs-run").addEventListener("click", () =>
    runOp("Resizing", async () => {
      if (!img) throw new Error("Pick an image first");
      const spec = {
        width: Number($<HTMLInputElement>("rs-width").value) || undefined,
        height: Number($<HTMLInputElement>("rs-height").value) || undefined,
        percent: Number($<HTMLInputElement>("rs-percent").value) || undefined,
        lock: $<HTMLInputElement>("rs-lock").checked,
      };
      if (spec.width === undefined && spec.height === undefined && spec.percent === undefined)
        throw new Error("Enter a width, height, or percent");
      const d = resizeDims({ w: img.naturalWidth, h: img.naturalHeight }, spec);
      const c = draw(0, 0, img.naturalWidth, img.naturalHeight, d.w, d.h);
      offerBlob(await toBlob(c, "image/png"), `${baseName()}-${d.w}x${d.h}.png`);
    }),
  );

  $("cr-run").addEventListener("click", () =>
    runOp("Cropping", async () => {
      if (!img) throw new Error("Pick an image first");
      const a = ASPECT_PRESETS.find((x) => x.id === $<HTMLSelectElement>("cr-aspect").value)!;
      const r = centeredAspectCrop({ w: img.naturalWidth, h: img.naturalHeight }, a.w, a.h);
      const c = draw(r.x, r.y, r.w, r.h, r.w, r.h);
      offerBlob(await toBlob(c, "image/png"), `${baseName()}-crop-${a.label.replace(":", "x")}.png`);
    }),
  );

  $("cv-run").addEventListener("click", () =>
    runOp("Converting", async () => {
      if (!img) throw new Error("Pick an image first");
      const f = FORMATS.find((x) => x.id === $<HTMLSelectElement>("cv-format").value)!;
      const q = Number($<HTMLInputElement>("cv-quality").value) / 100;
      const c = draw(0, 0, img.naturalWidth, img.naturalHeight, img.naturalWidth, img.naturalHeight);
      const blob = await toBlob(c, f.mime, f.lossy ? q : undefined);
      offerBlob(blob, `${baseName()}.${f.ext}`);
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
