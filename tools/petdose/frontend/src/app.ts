/**
 * PetDose — Main Application
 * Dose calculator UI wired to engine.ts. All processing in browser.
 * A dismissable safety disclaimer gates first use each session.
 */
import {
  MEDICATIONS, calculateDose, getMedicationsForSpecies, lbsToKg, kgToLbs,
} from "./engine";

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);

// ─── Safety disclaimer modal ─────────────────────────────────

const SAFETY_KEY = "petdose-safety-acknowledged";

function setupSafetyModal(): void {
  const modal = $("#safety-modal");
  const dismiss = $("#safety-dismiss");
  if (!modal || !dismiss) return;
  let acknowledged = false;
  try {
    // sessionStorage on purpose: the disclaimer reappears every new visit.
    acknowledged = sessionStorage.getItem(SAFETY_KEY) === "1";
  } catch { /* storage blocked — keep showing the modal */ }
  if (acknowledged) {
    modal.style.display = "none";
    return;
  }
  document.body.classList.add("safety-locked");
  dismiss.addEventListener("click", () => {
    modal.style.display = "none";
    document.body.classList.remove("safety-locked");
    try { sessionStorage.setItem(SAFETY_KEY, "1"); } catch { /* non-fatal */ }
  });
  dismiss.focus();
}

// ─── Calculator ──────────────────────────────────────────────

function currentWeightKg(): number {
  const val = parseFloat(($("#weight-input") as HTMLInputElement)?.value) || 0;
  const unit = ($("#weight-unit") as HTMLSelectElement)?.value;
  return unit === "kg" ? val : lbsToKg(val);
}

function populateMedications(): void {
  const species = ($("#species-select") as HTMLSelectElement)?.value ?? "dog";
  const sel = $("#med-select") as HTMLSelectElement | null;
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = "";
  for (const med of getMedicationsForSpecies(species)) {
    const opt = document.createElement("option");
    opt.value = med.id;
    opt.textContent = med.name;
    sel.appendChild(opt);
  }
  if ([...sel.options].some((o) => o.value === current)) sel.value = current;
}

function render(): void {
  const species = ($("#species-select") as HTMLSelectElement)?.value ?? "dog";
  const medId = ($("#med-select") as HTMLSelectElement)?.value;
  const weightKg = currentWeightKg();
  const out = $("#output-area");
  const note = $("#weight-note");
  if (!out) return;

  const unit = ($("#weight-unit") as HTMLSelectElement)?.value;
  if (note) {
    note.textContent = unit === "kg"
      ? `${kgToLbs(weightKg)} lbs`
      : `${weightKg} kg`;
  }

  if (!medId || weightKg <= 0) {
    out.textContent = "Enter your pet's weight and pick a medication.";
    return;
  }

  const med = MEDICATIONS.find((m) => m.id === medId);
  const result = calculateDose(medId, species, weightKg);
  if (!med || !result) {
    out.textContent = "This medication has no reference range for the selected species.";
    return;
  }

  const doseLine = result.unit
    ? `${result.dose} ${result.unit} per dose`
    : `${result.dose}`;

  out.innerHTML = [
    `<p class="dose-result__dose"><strong>${med.name}</strong></p>`,
    `<p class="dose-result__line">${doseLine} · ${result.frequency}</p>`,
    result.maxDailyNote ? `<p class="dose-result__cap">⚠ ${result.maxDailyNote}</p>` : "",
    result.tablets ? `<p class="dose-result__line">${result.tablets}</p>` : "",
    result.warnings?.length
      ? `<ul class="dose-result__warnings">${result.warnings.map((w: string) => `<li>${w}</li>`).join("")}</ul>`
      : "",
    `<p class="dose-result__disclaimer">${result.vetDisclaimer}</p>`,
  ].join("");
}

document.addEventListener("DOMContentLoaded", () => {
  setupSafetyModal();
  populateMedications();
  $("#species-select")?.addEventListener("change", () => { populateMedications(); render(); });
  ["#weight-input", "#weight-unit", "#med-select"].forEach((sel) => {
    $(sel)?.addEventListener("input", render);
    $(sel)?.addEventListener("change", render);
  });
  render();
});
