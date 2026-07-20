#!/usr/bin/env node
/* check-data-freshness.mjs — verify every rate-dependent dataset is
 * current. Run by .github/workflows/annual-data-check.yml (Jan 20) and
 * runnable locally: `node scripts/check-data-freshness.mjs`.
 *
 * Datasets are read PROGRAMMATICALLY wherever a module boundary exists:
 * data/tax.ts and the tool engines are imported directly (Node strips
 * types natively, ≥22.18) and their exported values inspected — no
 * grepping source text. The two remaining regex checks target inline
 * <script> constants in tools that predate the shared data layer; they
 * are marked INLINE-HTML below and retire when those tools migrate to
 * bundled TS + data/ at launch prep (see docs/automation.md).
 *
 * Exit code 0 = everything current; 1 = stale (report on stdout as
 * Markdown, consumed by the workflow's issue-opening step).
 * CHECK_YEAR env var overrides the expected year (for testing).
 */
import { readFileSync } from "node:fs";
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

/* ── IRS mileage rate JSON ── */
const mileage = JSON.parse(readFileSync(join(root, "scripts/maintenance/data/mileage_rate.json"), "utf8"));
expect(mileage.current_year === year, "IRS mileage rate",
  `mileage_rate.json current_year=${mileage.current_year}, expected ${year}`);

/* ── INLINE-HTML (regex until the finance tools' TS refactor) ── */
// Side Hustle Reality's inline IRS_MILE must match the JSON.
const shr = readFileSync(join(root, "tools/side-hustle-reality/frontend/src/index.html"), "utf8");
const mMile = shr.match(/IRS_MILE = ([0-9.]+)/);
expect(mMile && Number(mMile[1]) === mileage.current_rate, "Side Hustle Reality mileage",
  `IRS_MILE=${mMile ? mMile[1] : "none"} vs JSON ${mileage.current_rate}`);

// Is My Raise Real's inline CPI table must include last year's average.
const imrr = readFileSync(join(root, "tools/is-my-raise-real/frontend/src/index.html"), "utf8");
expect(new RegExp(`${year - 1}\\s*:`).test(imrr), "CPI table",
  `is-my-raise-real has no ${year - 1} CPI entry`);

if (stale.length) {
  console.log(`## Annual data refresh incomplete for ${year}\n`);
  console.log(stale.join("\n"));
  console.log("\nRun the annual data refresh (see docs/automation.md) and update the entries above.");
  process.exit(1);
}
console.log("All datasets current.");
