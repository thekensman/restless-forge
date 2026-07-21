#!/usr/bin/env node
/* check-data-freshness.mjs — verify every rate-dependent dataset is
 * current. Run by .github/workflows/annual-data-check.yml (Jan 20) and
 * runnable locally: `node scripts/check-data-freshness.mjs`.
 *
 * Every dataset is read PROGRAMMATICALLY: the shared data modules
 * (data/tax.ts, data/mileage.ts, data/cpi.ts) and the tool engines are
 * imported directly (Node strips types natively, ≥22.18) and their
 * exported values inspected — no grepping or regexing source text.
 *
 * Exit code 0 = everything current; 1 = stale (report on stdout as
 * Markdown, consumed by the workflow's issue-opening step).
 * CHECK_YEAR env var overrides the expected year (for testing).
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const year = Number(process.env.CHECK_YEAR) || new Date().getFullYear();
const stale = [];
const expect = (cond, label, detail) => {
  if (!cond) stale.push(`- **${label}** — ${detail}`);
};

/* ── shared tax data: import the real module ── */
const tax = await import(join(root, "data/tax.ts"));
expect(tax.CURRENT_TAX_YEAR === year, "Shared tax data",
  `data/tax.ts CURRENT_TAX_YEAR=${tax.CURRENT_TAX_YEAR}, expected ${year}`);
expect(tax.TAX_YEARS[tax.CURRENT_TAX_YEAR] !== undefined, "Shared tax data",
  `TAX_YEARS has no entry for CURRENT_TAX_YEAR ${tax.CURRENT_TAX_YEAR}`);

/* ── PromptDrop water-footprint sources: exported stamp ── */
const promptdrop = await import(join(root, "tools/promptdrop/frontend/src/engine.ts"));
expect(promptdrop.DATA_VERIFIED_YEAR === year, "PromptDrop water data",
  `DATA_VERIFIED_YEAR=${promptdrop.DATA_VERIFIED_YEAR}, expected ${year}`);

/* ── PetDose dosing sanity pass: exported stamp (values vet-gated) ── */
const petdose = await import(join(root, "tools/petdose/frontend/src/engine.ts"));
expect(petdose.DATA_VERIFIED_YEAR === year, "PetDose dosing data",
  `DATA_VERIFIED_YEAR=${petdose.DATA_VERIFIED_YEAR}, expected ${year}`);

/* ── IRS mileage rate: shared data/mileage.ts ── */
const mileage = await import(join(root, "data/mileage.ts"));
expect(mileage.CURRENT_MILEAGE_YEAR === year, "IRS mileage rate",
  `data/mileage.ts CURRENT_MILEAGE_YEAR=${mileage.CURRENT_MILEAGE_YEAR}, expected ${year}`);
expect(mileage.MILEAGE_RATES[mileage.CURRENT_MILEAGE_YEAR] !== undefined, "IRS mileage rate",
  `MILEAGE_RATES has no entry for ${mileage.CURRENT_MILEAGE_YEAR}`);

/* ── CPI: shared data/cpi.ts must include last year's annual average ── */
const cpi = await import(join(root, "data/cpi.ts"));
expect(cpi.CPI_ANNUAL[year - 1] !== undefined, "CPI table",
  `data/cpi.ts has no ${year - 1} annual-average entry`);

if (stale.length) {
  console.log(`## Annual data refresh incomplete for ${year}\n`);
  console.log(stale.join("\n"));
  console.log("\nRun the annual data refresh (see docs/automation.md) and update the entries above.");
  process.exit(1);
}
console.log("All datasets current.");
