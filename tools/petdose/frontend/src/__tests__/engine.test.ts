/**
 * PetDose — dosing engine tests.
 * These assert the actual reference math; treat any change here as
 * safety-sensitive and re-verify against the published sources.
 */
import { describe, it, expect } from "vitest";
import {
  MEDICATIONS, calculateDose, getMedicationsForSpecies, lbsToKg, kgToLbs,
} from "../engine";

describe("weight conversion", () => {
  it("round-trips lbs and kg", () => {
    expect(lbsToKg(22)).toBeCloseTo(9.98, 1);
    expect(kgToLbs(10)).toBeCloseTo(22.05, 1);
  });
});

describe("species gating", () => {
  it("Cerenia is dog-only", () => {
    expect(calculateDose("cerenia", "cat", 4)).toBeNull();
    expect(getMedicationsForSpecies("cat").map((m: { id: string }) => m.id)).not.toContain("cerenia");
  });
  it("unknown medication returns null", () => {
    expect(calculateDose("nope", "dog", 10)).toBeNull();
  });
});

describe("mg/kg dosing", () => {
  it("Cerenia 10 kg dog → 20 mg once daily", () => {
    const r = calculateDose("cerenia", "dog", 10)!;
    expect(r.dose).toBe(20);
    expect(r.unit).toBe("mg");
    expect(r.maxDaily).toBe(1);
  });
  it("Metronidazole 4 kg cat → 40 mg per dose", () => {
    const r = calculateDose("metronidazole", "cat", 4)!;
    expect(r.dose).toBe(40);
  });
});

describe("max daily cap", () => {
  it("is stated for every non-topical medication result", () => {
    for (const med of MEDICATIONS.filter((m: { isTopical?: boolean }) => !m.isTopical)) {
      for (const species of med.species) {
        const r = calculateDose(med.id, species, 8)!;
        expect(r.maxDailyNote, `${med.id}/${species}`).toBeTruthy();
        expect(r.maxDailyNote).toMatch(/24 hours/);
      }
    }
  });
  it("computes the daily total from per-dose amount", () => {
    // Benadryl dog: 2 mg/kg × 8 kg = 16 mg per dose, max 3/day → 48 mg
    const r = calculateDose("benadryl", "dog", 8)!;
    expect(r.maxDailyNote).toContain("3 doses");
    expect(r.maxDailyNote).toContain("48mg");
  });
});

describe("tablet guidance", () => {
  it("never reports zero tablets for tiny doses", () => {
    // 2.5 kg cat on metronidazole → 25 mg, smallest tablet 250 mg.
    // 25 < 250/4 → must route to liquid/compounded guidance, not "0 tablets".
    const r = calculateDose("metronidazole", "cat", 2.5)!;
    expect(r.tablets).toMatch(/liquid or compounded/);
    expect(r.tablets).not.toMatch(/^0 ×/);
  });
  it("quarter-rounds practical splits", () => {
    // 10 kg dog Benadryl → 20 mg; 25 mg tablets → 0.75 × 25 = 18.75 mg
    const r = calculateDose("benadryl", "dog", 10)!;
    expect(r.tablets).toContain("0.75 × 25mg");
  });
});

describe("topical products", () => {
  it("Frontline maps weight bands", () => {
    const r = calculateDose("frontline", "dog", 15)!;
    expect(r.dose).toBe("1.34ml");
  });
  it("out-of-range weight routes to the vet", () => {
    const r = calculateDose("frontline", "cat", 20)!;
    expect(r.dose).toMatch(/Consult vet/);
  });
});

describe("safety surface", () => {
  it("every result carries warnings and a vet disclaimer", () => {
    for (const med of MEDICATIONS) {
      for (const species of med.species) {
        const r = calculateDose(med.id, species, 8)!;
        expect(r.vetDisclaimer, med.id).toMatch(/veterinarian/);
        expect(r.warnings.length, med.id).toBeGreaterThan(0);
      }
    }
  });
});
