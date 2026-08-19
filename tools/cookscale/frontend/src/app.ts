/**
 * CookScale — Main Application
 * Ingredient converter, pan scaler, and oven-temp UI wired to engine.ts.
 */
import {
  DENSITIES, PAN_PRESETS,
  convertVolume, convertWeight, volumeToWeight, weightToVolume,
  panScaleFactor, adjustBakeTime, fToC, cToF,
} from "./engine";

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);

const VOLUME_UNITS: Record<string, string> = {
  tsp: "tsp", tbsp: "tbsp", cup: "cups", fl_oz: "fl oz",
  ml: "ml", l: "L", pint: "pints", quart: "quarts", gallon: "gallons",
};
const WEIGHT_UNITS: Record<string, string> = { g: "g", kg: "kg", oz: "oz", lb: "lb" };
const isVolume = (u: string) => u in VOLUME_UNITS;

// ─── Ingredient converter ────────────────────────────────────

function populateConverter(): void {
  for (const id of ["cv-from", "cv-to"]) {
    const sel = $(`#${id}`) as HTMLSelectElement;
    if (!sel) return;
    for (const [group, units] of [["Volume", VOLUME_UNITS], ["Weight", WEIGHT_UNITS]] as const) {
      const og = document.createElement("optgroup");
      og.label = group;
      for (const [val, label] of Object.entries(units)) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = label;
        og.appendChild(opt);
      }
      sel.appendChild(og);
    }
  }
  ($("#cv-from") as HTMLSelectElement).value = "cup";
  ($("#cv-to") as HTMLSelectElement).value = "g";

  const ing = $("#cv-ingredient") as HTMLSelectElement;
  for (const name of Object.keys(DENSITIES)) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    ing.appendChild(opt);
  }
}

function renderConversion(): void {
  const amount = parseFloat(($("#cv-amount") as HTMLInputElement).value) || 0;
  const from = ($("#cv-from") as HTMLSelectElement).value;
  const to = ($("#cv-to") as HTMLSelectElement).value;
  const ingredient = ($("#cv-ingredient") as HTMLSelectElement).value;
  const out = $("#cv-result");
  if (!out) return;

  const fromLabel = VOLUME_UNITS[from] ?? WEIGHT_UNITS[from];
  const toLabel = VOLUME_UNITS[to] ?? WEIGHT_UNITS[to];
  let result: number | null;

  if (isVolume(from) === isVolume(to)) {
    result = isVolume(from) ? convertVolume(amount, from, to) : convertWeight(amount, from, to);
  } else if (isVolume(from)) {
    // volume → weight: normalise to cups, apply density, convert to target
    const cups = convertVolume(amount, from, "cup");
    const grams = volumeToWeight(cups, ingredient);
    result = grams === null ? null : convertWeight(grams, "g", to);
  } else {
    const grams = convertWeight(amount, from, "g");
    const cups = weightToVolume(grams, ingredient);
    result = cups === null ? null : convertVolume(cups, "cup", to);
  }

  out.textContent = result === null
    ? "Pick an ingredient — cups ↔ grams needs its density."
    : `${amount} ${fromLabel} of ${ingredient} = ${result} ${toLabel}`;
}

// ─── Pan scaler ──────────────────────────────────────────────

function populatePans(): void {
  for (const id of ["pan-from", "pan-to"]) {
    const sel = $(`#${id}`) as HTMLSelectElement;
    if (!sel) return;
    for (const [key, preset] of Object.entries(PAN_PRESETS)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = (preset as { label: string }).label;
      sel.appendChild(opt);
    }
  }
  ($("#pan-from") as HTMLSelectElement).value = "round_8";
  ($("#pan-to") as HTMLSelectElement).value = "rect_9x13";
}

function renderPan(): void {
  const fromKey = ($("#pan-from") as HTMLSelectElement).value;
  const toKey = ($("#pan-to") as HTMLSelectElement).value;
  const mins = parseFloat(($("#bake-mins") as HTMLInputElement).value) || 0;
  const out = $("#pan-result");
  if (!out) return;
  const presets = PAN_PRESETS as Record<string, { shape: string; label: string; dims: { width: number; height: number; depth?: number } }>;
  const from = presets[fromKey];
  const to = presets[toKey];
  if (!from || !to) return;

  const factor = panScaleFactor(from.shape, from.dims, to.shape, to.dims);
  const lines = [
    `<p class="scale-result__factor">Multiply every ingredient by <strong>${factor}×</strong></p>`,
    `<p class="scale-result__line">${from.label} → ${to.label}</p>`,
  ];
  if (mins > 0) {
    const adjusted = adjustBakeTime(mins, factor);
    lines.push(`<p class="scale-result__line">Bake time: ~<strong>${adjusted} min</strong> (was ${mins}) — start checking 10 minutes early; ovens lie.</p>`);
  }
  out.innerHTML = lines.join("");
}

// ─── Oven temperature (two-way) ──────────────────────────────

function setupTemp(): void {
  const f = $("#temp-f") as HTMLInputElement;
  const c = $("#temp-c") as HTMLInputElement;
  if (!f || !c) return;
  f.addEventListener("input", () => { c.value = String(fToC(parseFloat(f.value) || 0)); });
  c.addEventListener("input", () => { f.value = String(cToF(parseFloat(c.value) || 0)); });
}

document.addEventListener("DOMContentLoaded", () => {
  populateConverter();
  populatePans();
  setupTemp();
  ["#cv-amount", "#cv-from", "#cv-to", "#cv-ingredient"].forEach((sel) => {
    $(sel)?.addEventListener("input", renderConversion);
    $(sel)?.addEventListener("change", renderConversion);
  });
  ["#pan-from", "#pan-to", "#bake-mins"].forEach((sel) => {
    $(sel)?.addEventListener("input", renderPan);
    $(sel)?.addEventListener("change", renderPan);
  });
  renderConversion();
  renderPan();
});
