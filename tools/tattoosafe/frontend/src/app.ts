/**
 * TattooSafe — Main Application
 * AR camera preview, sizing controls, and reactive UI.
 *
 * All dimensions are held canonically in CM; the single "Units" dropdown
 * only changes how values are DISPLAYED (inputs, sliders, max-area text,
 * silhouette labels, camera hint) and converts them on switch.
 */
import {
  BODY_PARTS, getBodyPart, maxTattooDimensions, checkFit,
  ftInToCm, cmToIn, inToCm, generateSilhouetteSvg,
  COMPLEXITY, HOURLY_RATES, calculatePrice, fmtPriceRange, fmtTime,
  type ComplexityKey, type ArtistKey,
} from "./engine";
import { setupCameraPreview, type CameraController } from "./camera";

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const input = (sel: string) => document.querySelector<HTMLInputElement>(sel);

type Units = "metric" | "imperial";

let units: Units = "metric";
let heightCm = 170;
let tattooWCm = 8;
let tattooHCm = 12;
/** h/w of the uploaded design, once one is loaded. */
let designRatio: number | null = null;
/** Active h/w ratio while the aspect lock is on. */
let lockedRatio: number | null = null;
let camera: CameraController | null = null;

const MIN_CM = 0.5;
const MAX_CM = 100;
const clampCm = (v: number): number => Math.min(Math.max(v, MIN_CM), MAX_CM);
const displayStep = (): number => (units === "imperial" ? 0.25 : 0.5);
const toDisplay = (cm: number): number => {
  const v = units === "imperial" ? cmToIn(cm) : cm;
  const step = displayStep();
  return Math.round(v / step) * step;
};
const fromDisplay = (v: number): number => (units === "imperial" ? inToCm(v) : v);
const unitLabel = (): "cm" | "in" => (units === "imperial" ? "in" : "cm");
const round1 = (v: number): number => Math.round(v * 10) / 10;

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

/** Write the canonical cm sizes into all four size controls (current unit). */
function setSizeInputs(except?: HTMLInputElement | null): void {
  const pairs: Array<[HTMLInputElement | null, number]> = [
    [input("#tattoo-width"), tattooWCm],
    [input("#tattoo-width-range"), tattooWCm],
    [input("#tattoo-height"), tattooHCm],
    [input("#tattoo-height-range"), tattooHCm],
  ];
  for (const [el, cm] of pairs) {
    if (el && el !== except) el.value = String(toDisplay(cm));
  }
}

/** One size control changed: update canonical cm, apply the aspect lock. */
function onSizeEdit(dim: "w" | "h", raw: number, source?: HTMLInputElement | null): void {
  if (!Number.isFinite(raw) || raw <= 0) return;
  const cm = clampCm(fromDisplay(raw));
  if (dim === "w") {
    tattooWCm = cm;
    if (lockedRatio) tattooHCm = clampCm(cm * lockedRatio);
  } else {
    tattooHCm = cm;
    if (lockedRatio) tattooWCm = clampCm(cm / lockedRatio);
  }
  setSizeInputs(source);
  updateSizeInfo();
}

function onHeightEdit(): void {
  if (units === "imperial") {
    const ft = parseFloat(input("#height-ft")?.value ?? "") || 0;
    const inches = parseFloat(input("#height-in")?.value ?? "") || 0;
    const cm = ftInToCm(ft, inches);
    if (Number.isFinite(cm) && cm > 0) heightCm = cm;
  } else {
    const v = parseFloat(input("#height-input")?.value ?? "");
    if (Number.isFinite(v) && v > 0) heightCm = v;
  }
  updateSizeInfo();
}

/** Reflect the current unit system in every control, converting values. */
function applyUnits(): void {
  const imp = units === "imperial";
  const metricRow = $("#height-metric");
  const imperialRow = $("#height-imperial");
  if (metricRow) metricRow.style.display = imp ? "none" : "";
  if (imperialRow) imperialRow.style.display = imp ? "" : "none";
  if (imp) {
    const totalIn = Math.round(cmToIn(heightCm));
    const ft = input("#height-ft"), inch = input("#height-in");
    if (ft) ft.value = String(Math.floor(totalIn / 12));
    if (inch) inch.value = String(totalIn % 12);
    heightCm = ftInToCm(Math.floor(totalIn / 12), totalIn % 12);
  } else {
    const h = input("#height-input");
    heightCm = Math.round(heightCm);
    if (h) h.value = String(heightCm);
  }
  // Snap the canonical sizes to what the (rounded) inputs will show, so
  // the silhouette labels, price, and inputs all agree after a switch.
  tattooWCm = clampCm(fromDisplay(toDisplay(tattooWCm)));
  tattooHCm = clampCm(fromDisplay(toDisplay(tattooHCm)));

  for (const el of [input("#tattoo-width"), input("#tattoo-height")]) {
    if (!el) continue;
    el.min = imp ? "0.25" : String(MIN_CM);
    el.max = imp ? "40" : String(MAX_CM);
    el.step = String(displayStep());
  }
  for (const el of [input("#tattoo-width-range"), input("#tattoo-height-range")]) {
    if (!el) continue;
    el.min = imp ? "0.25" : String(MIN_CM);
    el.max = imp ? "24" : "60";
    el.step = String(displayStep());
  }
  const wu = $("#width-unit-label"), hu = $("#height-unit-label");
  if (wu) wu.textContent = unitLabel();
  if (hu) hu.textContent = unitLabel();
  setSizeInputs();
  updateSizeInfo();
}

function updateSizeInfo(): void {
  const bpId = ($("#body-part-select") as HTMLSelectElement)?.value ?? "";
  const bp = getBodyPart(bpId);
  const descEl = $("#body-part-desc");
  if (descEl && bp) descEl.textContent = bp.description;
  const maxDims = maxTattooDimensions(bpId, heightCm);
  const maxEl = $("#max-dimensions");
  if (maxEl && maxDims) {
    maxEl.textContent = units === "imperial"
      ? `Max area: ${round1(cmToIn(maxDims.maxWidthCm))} × ${round1(cmToIn(maxDims.maxHeightCm))} in`
      : `Max area: ${maxDims.maxWidthCm} × ${maxDims.maxHeightCm} cm`;
  }
  const fit = checkFit(bpId, heightCm, tattooWCm, tattooHCm);
  const fitEl = $("#fit-indicator");
  if (fitEl) {
    fitEl.textContent = fit.fits
      ? `✓ Fits (${fit.widthPct}% width, ${fit.heightPct}% height)`
      : `⚠ Oversized (${fit.widthPct}% width, ${fit.heightPct}% height)`;
    fitEl.className = "fit-indicator " + (fit.fits ? "fit-indicator--ok" : "fit-indicator--warn");
  }
  const rotation = parseFloat(input("#rotation-range")?.value ?? "") || 0;
  const opacity = (parseFloat(input("#opacity-range")?.value ?? "") || 85) / 100;
  const container = $("#silhouette-preview");
  if (container) {
    container.innerHTML = generateSilhouetteSvg(bpId, heightCm, round1(tattooWCm), round1(tattooHCm), {
      rotation, opacity, unit: unitLabel(),
    });
  }

  // Live price estimate — the size panel drives it directly.
  const complexity = (($("#complexity-select") as HTMLSelectElement)?.value || "moderate_detail") as ComplexityKey;
  const artist = (($("#artist-select") as HTMLSelectElement)?.value || "experienced") as ArtistKey;
  const price = calculatePrice(tattooWCm, tattooHCm, complexity, bpId, artist);
  const rangeEl = $("#price-range"), detailEl = $("#price-detail");
  if (rangeEl && detailEl && price.high > 0) {
    rangeEl.textContent = fmtPriceRange(price.low, price.high);
    detailEl.textContent =
      `${price.areaSqIn} sq in · ~${fmtTime(price.totalMinutes)} across ` +
      `${price.sessions} session${price.sessions !== 1 ? "s" : ""} · pain: ${price.painLevel}`;
  }

  // Reflect the size settings in the camera preview.
  camera?.setTattooSize(round1(tattooWCm), round1(tattooHCm), bp?.label ?? "", unitLabel());
}

function setupFileUpload(): void {
  const dz = $("#drop-zone"), fi = input("#file-input");
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
    designRatio = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : null;
    if (designRatio && input("#aspect-lock")?.checked) {
      lockedRatio = designRatio;
      tattooHCm = clampCm(tattooWCm * lockedRatio);
      setSizeInputs();
      updateSizeInfo();
    }
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

  // Panel controls that only need a recompute.
  for (const s of ["#body-part-select", "#rotation-range", "#opacity-range", "#complexity-select", "#artist-select"]) {
    $(s)?.addEventListener("input", updateSizeInfo);
    $(s)?.addEventListener("change", updateSizeInfo);
  }
  // Height (both unit variants).
  for (const s of ["#height-input", "#height-ft", "#height-in"]) {
    $(s)?.addEventListener("input", onHeightEdit);
  }
  // Unified unit switch.
  $("#unit-select")?.addEventListener("change", () => {
    units = (($("#unit-select") as HTMLSelectElement).value === "imperial") ? "imperial" : "metric";
    applyUnits();
  });
  // Tattoo size: numbers + sliders, two-way synced.
  const wNum = input("#tattoo-width"), hNum = input("#tattoo-height");
  const wRange = input("#tattoo-width-range"), hRange = input("#tattoo-height-range");
  wNum?.addEventListener("input", () => onSizeEdit("w", parseFloat(wNum.value), wNum));
  hNum?.addEventListener("input", () => onSizeEdit("h", parseFloat(hNum.value), hNum));
  wRange?.addEventListener("input", () => onSizeEdit("w", parseFloat(wRange.value)));
  hRange?.addEventListener("input", () => onSizeEdit("h", parseFloat(hRange.value)));
  // Aspect lock: prefer the uploaded design's ratio, else freeze the current one.
  const lock = input("#aspect-lock");
  lock?.addEventListener("change", () => {
    if (lock.checked) {
      lockedRatio = designRatio ?? tattooHCm / tattooWCm;
      tattooHCm = clampCm(tattooWCm * lockedRatio);
      setSizeInputs();
      updateSizeInfo();
    } else {
      lockedRatio = null;
    }
  });

  $("#rotation-range")?.addEventListener("input", e => { const v = (e.target as HTMLInputElement).value; const el = $("#rotation-value"); if (el) el.textContent = v; });
  $("#opacity-range")?.addEventListener("input", e => { const v = (e.target as HTMLInputElement).value; const el = $("#opacity-value"); if (el) el.textContent = v; });
  setupFileUpload();
  camera = setupCameraPreview(
    () => parseFloat(input("#rotation-range")?.value ?? "") || 0,
    () => (parseFloat(input("#opacity-range")?.value ?? "") || 85) / 100,
    showError,
  );
  updateSizeInfo();
});
