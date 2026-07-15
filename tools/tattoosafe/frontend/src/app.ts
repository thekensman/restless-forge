/**
 * TattooSafe — Main Application
 * AR camera preview, sizing controls, and reactive UI.
 */
import {
  BODY_PARTS, getBodyPart, maxTattooDimensions, checkFit,
  ftInToCm, generateSilhouetteSvg,
  COMPLEXITY, HOURLY_RATES, calculatePrice, fmtPriceRange, fmtTime,
  type ComplexityKey, type ArtistKey,
} from "./engine";
import { setupCameraPreview, type CameraController } from "./camera";

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);

let heightCm = 170;
let camera: CameraController | null = null;

function showError(msg: string): void {
  const toast = $("#error-toast"), text = $("#error-msg");
  if (!toast || !text) return;
  text.textContent = msg;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 4000);
}

function populateBodyParts(): void {
  const sel = $("select#body-part-select") as HTMLSelectElement | null;
  if (!sel) return;
  sel.innerHTML = "";
  const groups: Record<string, string> = { arm: "Arms", torso: "Torso", leg: "Legs", other: "Other" };
  for (const [key, label] of Object.entries(groups)) {
    const og = document.createElement("optgroup");
    og.label = label;
    BODY_PARTS.filter(bp => bp.group === key).forEach(bp => {
      const opt = document.createElement("option");
      opt.value = bp.id; opt.textContent = bp.label;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  }
  sel.dispatchEvent(new Event("change"));
}

function populatePricingSelects(): void {
  const cx = $("select#complexity-select") as HTMLSelectElement | null;
  const ar = $("select#artist-select") as HTMLSelectElement | null;
  if (cx) {
    for (const [key, c] of Object.entries(COMPLEXITY)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = (c as { label: string; desc: string }).label + " — " + (c as { desc: string }).desc;
      cx.appendChild(opt);
    }
    cx.value = "moderate_detail";
  }
  if (ar) {
    for (const [key, r] of Object.entries(HOURLY_RATES)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = (r as { label: string }).label;
      ar.appendChild(opt);
    }
    ar.value = "experienced";
  }
}

function updateHeight(): void {
  const unit = ($("#height-unit") as HTMLSelectElement)?.value;
  if (unit === "ft") {
    const ft = parseFloat(($("#height-ft") as HTMLInputElement)?.value) || 0;
    const inches = parseFloat(($("#height-in") as HTMLInputElement)?.value) || 0;
    heightCm = ftInToCm(ft, inches);
  } else {
    heightCm = parseFloat(($("#height-input") as HTMLInputElement)?.value) || 170;
  }
  updateSizeInfo();
}

function updateSizeInfo(): void {
  const bpId = ($("#body-part-select") as HTMLSelectElement)?.value ?? "";
  const w = parseFloat(($("#tattoo-width") as HTMLInputElement)?.value) || 8;
  const h = parseFloat(($("#tattoo-height") as HTMLInputElement)?.value) || 12;
  const bp = getBodyPart(bpId);
  const descEl = $("#body-part-desc");
  if (descEl && bp) descEl.textContent = bp.description;
  const maxDims = maxTattooDimensions(bpId, heightCm);
  const maxEl = $("#max-dimensions");
  if (maxEl && maxDims) maxEl.textContent = `Max area: ${maxDims.maxWidthCm} × ${maxDims.maxHeightCm} cm`;
  const fit = checkFit(bpId, heightCm, w, h);
  const fitEl = $("#fit-indicator");
  if (fitEl) {
    fitEl.textContent = fit.fits
      ? `✓ Fits (${fit.widthPct}% width, ${fit.heightPct}% height)`
      : `⚠ Oversized (${fit.widthPct}% width, ${fit.heightPct}% height)`;
    fitEl.className = "fit-indicator " + (fit.fits ? "fit-indicator--ok" : "fit-indicator--warn");
  }
  const rotation = parseFloat(($("#rotation-range") as HTMLInputElement)?.value) || 0;
  const opacity = (parseFloat(($("#opacity-range") as HTMLInputElement)?.value) || 85) / 100;
  const container = $("#silhouette-preview");
  if (container) container.innerHTML = generateSilhouetteSvg(bpId, heightCm, w, h, { rotation, opacity });

  // Live price estimate — the size panel drives it directly.
  const complexity = (($("#complexity-select") as HTMLSelectElement)?.value || "moderate_detail") as ComplexityKey;
  const artist = (($("#artist-select") as HTMLSelectElement)?.value || "experienced") as ArtistKey;
  const price = calculatePrice(w, h, complexity, bpId, artist);
  const rangeEl = $("#price-range"), detailEl = $("#price-detail");
  if (rangeEl && detailEl && price.high > 0) {
    rangeEl.textContent = fmtPriceRange(price.low, price.high);
    detailEl.textContent =
      `${price.areaSqIn} sq in · ~${fmtTime(price.totalMinutes)} across ` +
      `${price.sessions} session${price.sessions !== 1 ? "s" : ""} · pain: ${price.painLevel}`;
  }

  // Reflect the size settings in the camera preview.
  camera?.setTattooSize(w, h, bp?.label ?? "", bp?.circumferenceCm);
}

function setupFileUpload(): void {
  const dz = $("#drop-zone"), fi = $("input#file-input") as HTMLInputElement | null;
  if (!dz || !fi) return;
  dz.addEventListener("click", () => fi.click());
  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("upload__circle--active"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("upload__circle--active"));
  dz.addEventListener("drop", e => { e.preventDefault(); dz.classList.remove("upload__circle--active"); if ((e as DragEvent).dataTransfer?.files.length) handleFile((e as DragEvent).dataTransfer!.files[0]); });
  fi.addEventListener("change", () => { if (fi.files?.length) handleFile(fi.files[0]); });
}

function handleFile(file: File): void {
  const ok = ["image/jpeg","image/png","image/webp","image/bmp","image/gif"];
  if (!ok.includes(file.type)) {
    showError("Unsupported file type — use JPG, PNG, WebP, BMP, or GIF.");
    return;
  }
  const fn = $("#file-name");
  if (fn) fn.textContent = file.name;
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    camera?.setDesign(img);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    showError("Couldn't read that image — try a different file.");
  };
  img.src = url;
}

document.addEventListener("DOMContentLoaded", () => {
  populateBodyParts();
  populatePricingSelects();
  const inputs = "#body-part-select,#tattoo-width,#tattoo-height,#rotation-range,#opacity-range,#height-input,#height-ft,#height-in,#height-unit,#complexity-select,#artist-select";
  inputs.split(",").forEach(s => {
    $(s)?.addEventListener("input", updateSizeInfo);
    $(s)?.addEventListener("change", updateSizeInfo);
  });
  $("#height-unit")?.addEventListener("change", () => {
    const imp = $("#height-imperial");
    const cm = $("#height-input")?.parentElement;
    const isImp = ($("#height-unit") as HTMLSelectElement)?.value === "ft";
    if (imp) imp.style.display = isImp ? "" : "none";
    if (cm) cm.style.display = isImp ? "none" : "";
    updateHeight();
  });
  $("#rotation-range")?.addEventListener("input", e => { const v = (e.target as HTMLInputElement).value; const el = $("#rotation-value"); if (el) el.textContent = v; });
  $("#opacity-range")?.addEventListener("input", e => { const v = (e.target as HTMLInputElement).value; const el = $("#opacity-value"); if (el) el.textContent = v; });
  setupFileUpload();
  camera = setupCameraPreview(
    () => parseFloat(($("#rotation-range") as HTMLInputElement)?.value) || 0,
    () => (parseFloat(($("#opacity-range") as HTMLInputElement)?.value) || 85) / 100,
    showError,
  );
  updateSizeInfo();
});
