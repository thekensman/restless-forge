/**
 * TattooSafe — Main Application
 * AR camera preview, sizing controls, and reactive UI.
 *
 * All dimensions are held canonically in CM; the single "Units" dropdown
 * only changes how values are DISPLAYED (inputs, sliders, max-area text,
 * silhouette labels, camera hint). Switching units never rewrites the
 * canonical values, so switching back shows exactly what was entered.
 */
import {
  BODY_PARTS, getBodyPart, maxTattooDimensions, checkFit,
  ftInToCm, cmToIn, inToCm, generateSilhouetteSvg,
  COMPLEXITY, HOURLY_RATES, calculatePrice, fmtPriceRange, fmtTime,
  MIN_TATTOO_CM, MAX_TATTOO_CM,
  type ComplexityKey, type ArtistKey,
} from "./engine";
import { setupCameraPreview, type CameraController } from "./camera";

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const input = (sel: string) => document.querySelector<HTMLInputElement>(sel);

type Units = "metric" | "imperial";

let units: Units = "metric";
let heightCm = 170;
// Default fits the default placement (inner forearm, 7.6 cm wide at 170 cm).
let tattooWCm = 6;
let tattooHCm = 10;
/** h/w of the uploaded design, once one is loaded. */
let designRatio: number | null = null;
/** Active h/w ratio while the aspect lock is on. */
let lockedRatio: number | null = null;
let camera: CameraController | null = null;

const MIN_HEIGHT_CM = 100;
const MAX_HEIGHT_CM = 250;
const clampCm = (v: number): number => Math.min(Math.max(v, MIN_TATTOO_CM), MAX_TATTOO_CM);
const displayStep = (): number => (units === "imperial" ? 0.25 : 0.5);
const toDisplay = (cm: number): number => {
  const v = units === "imperial" ? cmToIn(cm) : cm;
  const step = displayStep();
  return Math.round(v / step) * step;
};
const fromDisplay = (v: number): number => (units === "imperial" ? inToCm(v) : v);
const unitLabel = (): "cm" | "in" => (units === "imperial" ? "in" : "cm");
/** A length as the inputs show it, so every label agrees with them. */
const fmtLen = (cm: number): string => `${toDisplay(cm)} ${unitLabel()}`;
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

/** Show the canonical height in whichever unit is active. */
function setHeightInputs(): void {
  const totalIn = Math.round(cmToIn(heightCm));
  const ft = input("#height-ft"), inch = input("#height-in"), cm = input("#height-input");
  if (ft) ft.value = String(Math.floor(totalIn / 12));
  if (inch) inch.value = String(totalIn % 12);
  if (cm) cm.value = String(Math.round(heightCm));
  for (const el of [ft, inch, cm]) el?.removeAttribute("aria-invalid");
}

/**
 * Height typed: accept it only inside the plausible adult range, so a
 * half-typed "17" doesn't briefly turn every placement into a 1000%
 * oversize. Out-of-range input is flagged and ignored until fixed; on
 * blur the last accepted height is put back.
 */
function onHeightEdit(): void {
  let cm: number;
  let fields: Array<HTMLInputElement | null>;
  if (units === "imperial") {
    const ft = parseFloat(input("#height-ft")?.value ?? "") || 0;
    const inches = parseFloat(input("#height-in")?.value ?? "") || 0;
    cm = ftInToCm(ft, inches);
    fields = [input("#height-ft"), input("#height-in")];
  } else {
    cm = parseFloat(input("#height-input")?.value ?? "");
    fields = [input("#height-input")];
  }
  const ok = Number.isFinite(cm) && cm >= MIN_HEIGHT_CM && cm <= MAX_HEIGHT_CM;
  for (const el of fields) el?.setAttribute("aria-invalid", String(!ok));
  if (!ok) return;
  heightCm = cm;
  updateSizeInfo();
}

/** Reflect the current unit system in every control. Display only. */
function applyUnits(): void {
  const imp = units === "imperial";
  const metricRow = $("#height-metric");
  const imperialRow = $("#height-imperial");
  if (metricRow) metricRow.style.display = imp ? "none" : "";
  if (imperialRow) imperialRow.style.display = imp ? "" : "none";
  setHeightInputs();

  for (const el of [input("#tattoo-width"), input("#tattoo-height")]) {
    if (!el) continue;
    el.min = imp ? "0.25" : String(MIN_TATTOO_CM);
    el.max = imp ? "40" : String(MAX_TATTOO_CM);
    el.step = String(displayStep());
  }
  for (const el of [input("#tattoo-width-range"), input("#tattoo-height-range")]) {
    if (!el) continue;
    el.min = imp ? "0.25" : String(MIN_TATTOO_CM);
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
    container.innerHTML = generateSilhouetteSvg(bpId, heightCm, tattooWCm, tattooHCm, {
      rotation, opacity, unit: unitLabel(), labels: { w: fmtLen(tattooWCm), h: fmtLen(tattooHCm) },
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
  camera?.setPlacement(bpId, heightCm);
  camera?.setTattooSize(tattooWCm, tattooHCm,
    `${toDisplay(tattooWCm)} × ${toDisplay(tattooHCm)} ${unitLabel()}${bp ? " on " + bp.label : ""}`);
}

/**
 * Rotation and opacity have a second copy under the camera, so they can be
 * adjusted while watching the feed on a phone. Both copies stay in sync.
 */
function linkRanges(mainSel: string, quickSel: string, valueSel: string): void {
  const main = input(mainSel), quick = input(quickSel), value = $(valueSel);
  const apply = (from: HTMLInputElement, to: HTMLInputElement | null): void => {
    if (to) to.value = from.value;
    if (value) value.textContent = from.value;
    updateSizeInfo();
  };
  main?.addEventListener("input", () => apply(main, quick));
  quick?.addEventListener("input", () => apply(quick, main));
}

/**
 * Full AR asks first: the notice says what downloads and what the tracking
 * needs, and only "Download and start" imports the runtime chunk.
 */
function setupFullAr(): void {
  const dialog = document.querySelector<HTMLDialogElement>("#ar-dialog");
  const begin = (): void => {
    void camera?.startAr((onProgress) => import("./ar-tracking").then((m) => m.createTracker(onProgress)));
  };
  $("#ar-full")?.addEventListener("click", () => {
    if (typeof dialog?.showModal !== "function") {
      if (window.confirm("Full AR downloads about 30 MB the first time and runs body mapping on this device. It needs to see your face. Continue?")) begin();
      return;
    }
    dialog.returnValue = "";
    dialog.showModal();
  });
  dialog?.addEventListener("close", () => { if (dialog.returnValue === "go") begin(); });
}

function setupFileUpload(): void {
  const dz = $("#drop-zone"), fi = input("#file-input");
  if (!dz || !fi) return;
  dz.addEventListener("click", () => fi.click());
  dz.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fi.click(); }
  });
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
  for (const s of ["#body-part-select", "#complexity-select", "#artist-select"]) {
    $(s)?.addEventListener("input", updateSizeInfo);
    $(s)?.addEventListener("change", updateSizeInfo);
  }
  linkRanges("#rotation-range", "#ar-rotation", "#rotation-value");
  linkRanges("#opacity-range", "#ar-opacity", "#opacity-value");
  // Height (both unit variants).
  for (const s of ["#height-input", "#height-ft", "#height-in"]) {
    $(s)?.addEventListener("input", onHeightEdit);
    $(s)?.addEventListener("change", setHeightInputs);
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

  setupFileUpload();
  setupFullAr();
  camera = setupCameraPreview(
    () => parseFloat(input("#rotation-range")?.value ?? "") || 0,
    () => (parseFloat(input("#opacity-range")?.value ?? "") || 85) / 100,
    showError,
    // Pinch on a calibrated or tracked preview resizes the tattoo: same path as typing it.
    (wCm, hCm) => {
      tattooWCm = clampCm(wCm);
      tattooHCm = clampCm(hCm);
      setSizeInputs();
      updateSizeInfo();
    },
  );
  setSizeInputs();
  updateSizeInfo();
});
