/* Main TypeScript entry for PromptDrop. Vite bundles this into dist/. */
import {
  TASK_TYPES,
  calcWater,
  compare,
  showerSeconds,
  fmtLiters,
  fmtBand,
  fmtEnergy,
  Usage,
} from "./engine";

const DEFAULTS: Usage = { chat: 15, reasoning: 2, image: 1, video: 0 };

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

function buildInputs(): void {
  const wrap = $("usage-fields");
  wrap.innerHTML = TASK_TYPES.map(
    (t) => `
    <label class="field" for="in-${t.id}">
      <span class="field__label">${t.label}</span>
      <input type="number" id="in-${t.id}" min="0" max="10000" step="1"
             value="${DEFAULTS[t.id] ?? 0}" inputmode="numeric">
      <span class="field__unit">${t.unit}</span>
    </label>`,
  ).join("");
}

function readUsage(): Usage {
  const usage: Usage = {};
  for (const t of TASK_TYPES) {
    const el = document.getElementById(`in-${t.id}`) as HTMLInputElement | null;
    usage[t.id] = el ? Math.max(0, Number(el.value) || 0) : 0;
  }
  return usage;
}

function fmtShower(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)} seconds`;
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)} minutes`;
  return `${(seconds / 3600).toFixed(1)} hours`;
}

function fmtCount(n: number): string {
  if (n >= 100) return Math.round(n).toLocaleString("en-US");
  if (n >= 1) return n.toFixed(1);
  if (n >= 0.01) return n.toFixed(2);
  return "< 0.01";
}

function render(): void {
  const r = calcWater(readUsage());

  $("annual-typical").textContent = fmtLiters(r.totalLPerYear.typical);
  $("annual-range").textContent =
    `plausible range: ${fmtBand(r.totalLPerYear)} / year`;

  const on = r.onsiteLPerDay.typical;
  const off = r.offsiteLPerDay.typical;
  const total = on + off;
  $("seg-onsite").style.width = total > 0 ? `${(on / total) * 100}%` : "0%";
  $("seg-offsite").style.width = total > 0 ? `${(off / total) * 100}%` : "0%";
  $("onsite-day").textContent = fmtLiters(on);
  $("offsite-day").textContent = fmtLiters(off);
  $("energy-day").textContent = fmtEnergy(r.energyWhPerDay.typical);

  $("shower-line").textContent =
    `A full year of this usage ≈ ${fmtShower(showerSeconds(r.totalLPerYear.typical))} ` +
    `of showering.`;

  $("comparisons").innerHTML = compare(r.totalLPerYear.typical)
    .map(
      (c) =>
        `<li>${c.lifecycle ? "◦ " : ""}${fmtCount(c.count)} × ${c.label}</li>`,
    )
    .join("");
}

function init(): void {
  buildInputs();
  for (const t of TASK_TYPES) {
    document
      .getElementById(`in-${t.id}`)
      ?.addEventListener("input", render);
  }
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
