/**
 * What Is My Time Worth? — Unit Tests
 */

import { describe, it, expect } from "vitest";
import {
  calcFederalIncomeTax,
  calcStateTax,
  calcFICA,
  calculateRealWage,
  calculateDecision,
  compareJobs,
  fmtCurrency,
  fmtPercent,
  fmtHoursMinutes,
  fmtNumber,
  STATE_TAX_RATES,
  DECISION_PRESETS,
  type WageInputs,
  type JobInputs,
} from "../engine";

// ─── Defaults ────────────────────────────────────────────────

const baseWageInputs: WageInputs = {
  annualGrossSalary: 65_000,
  filingStatus: "single",
  stateTaxRate: 0.0495,
  dailyCommuteCost: 15,
  monthlyClothing: 50,
  dailyMealCost: 8,
  monthlyChildcare: 0,
  monthlyOtherCosts: 0,
  dailyCommuteMinutes: 50,
  dailyGetReadyMinutes: 30,
  dailyDecompressionMinutes: 45,
  weeklyUnpaidOvertime: 3,
  workDaysPerWeek: 5,
  vacationDays: 10,
  holidays: 8,
  sickDays: 5,
};

const baseJobA: JobInputs = {
  label: "Current Job",
  annualSalary: 65_000,
  stateTaxRate: 0.0495,
  dailyCommuteCost: 15,
  dailyCommuteMinutes: 50,
  monthlyClothing: 50,
  dailyMealCost: 8,
  monthlyChildcare: 0,
  monthlyOtherCosts: 0,
  dailyGetReadyMinutes: 30,
  dailyDecompressionMinutes: 45,
  weeklyUnpaidOvertime: 3,
  vacationDays: 10,
  holidays: 8,
  sickDays: 5,
};

const baseJobB: JobInputs = {
  label: "Remote Offer",
  annualSalary: 60_000,
  stateTaxRate: 0,
  dailyCommuteCost: 0,
  dailyCommuteMinutes: 0,
  monthlyClothing: 0,
  dailyMealCost: 5,
  monthlyChildcare: 0,
  monthlyOtherCosts: 50,
  dailyGetReadyMinutes: 10,
  dailyDecompressionMinutes: 20,
  weeklyUnpaidOvertime: 1,
  vacationDays: 15,
  holidays: 10,
  sickDays: 5,
};

// ─── Tax Tests ───────────────────────────────────────────────

describe("calcFederalIncomeTax", () => {
  it("returns 0 for income below standard deduction", () => {
    expect(calcFederalIncomeTax(10_000, "single")).toBe(0);
  });

  it("returns 0 for zero income", () => {
    expect(calcFederalIncomeTax(0, "single")).toBe(0);
  });

  it("calculates 10% bracket correctly (single)", () => {
    const tax = calcFederalIncomeTax(25_000, "single");
    expect(tax).toBe(1040);
  });

  it("handles six-figure income", () => {
    const tax = calcFederalIncomeTax(120_000, "single");
    expect(tax).toBeGreaterThan(15_000);
    expect(tax).toBeLessThan(25_000);
  });

  it("MFJ brackets are wider than single", () => {
    const single = calcFederalIncomeTax(100_000, "single");
    const mfj = calcFederalIncomeTax(100_000, "mfj");
    expect(mfj).toBeLessThan(single);
  });

  it("MFJ returns 0 below MFJ standard deduction", () => {
    expect(calcFederalIncomeTax(25_000, "mfj")).toBe(0);
  });

  it("never returns negative", () => {
    expect(calcFederalIncomeTax(-5_000, "single")).toBe(0);
  });

  it("handles very high income", () => {
    const tax = calcFederalIncomeTax(1_000_000, "single");
    expect(tax).toBeGreaterThan(300_000);
  });
});

describe("calcStateTax", () => {
  it("returns 0 for zero rate", () => {
    expect(calcStateTax(100_000, 0)).toBe(0);
  });

  it("returns 0 for negative rate", () => {
    expect(calcStateTax(100_000, -0.05)).toBe(0);
  });

  it("returns 0 for zero income", () => {
    expect(calcStateTax(0, 0.05)).toBe(0);
  });

  it("calculates IL flat tax", () => {
    expect(calcStateTax(100_000, 0.0495)).toBe(4950);
  });
});

describe("calcFICA", () => {
  it("returns 0 for zero income", () => {
    expect(calcFICA(0)).toBe(0);
  });

  it("returns 0 for negative income", () => {
    expect(calcFICA(-5000)).toBe(0);
  });

  it("calculates employee FICA on modest income", () => {
    const fica = calcFICA(65_000);
    // 6.2% SS + 1.45% Medicare = 7.65%
    expect(fica).toBeCloseTo(65_000 * 0.0765, -1);
  });

  it("caps Social Security at wage base", () => {
    const fica200k = calcFICA(200_000);
    const fica300k = calcFICA(300_000);
    // Difference should be Medicare only on the extra 100k
    const diff = fica300k - fica200k;
    expect(diff).toBeLessThan(3000); // Only Medicare + surtax
  });

  it("adds additional Medicare above $200k", () => {
    const ficaAt200k = calcFICA(200_000);
    const ficaAt250k = calcFICA(250_000);
    // Extra should include 0.9% surtax on 50k = $450 + regular Medicare on 50k
    const diff = ficaAt250k - ficaAt200k;
    expect(diff).toBeGreaterThan(1100); // 1.45% + 0.9% on 50k
  });
});

// ─── Real Wage Tests ─────────────────────────────────────────

describe("calculateRealWage", () => {
  it("produces a reasonable real wage for default inputs", () => {
    const result = calculateRealWage(baseWageInputs);
    expect(result.realHourlyWage).toBeGreaterThan(10);
    expect(result.realHourlyWage).toBeLessThan(30);
  });

  it("real wage is always less than advertised wage", () => {
    const result = calculateRealWage(baseWageInputs);
    expect(result.realHourlyWage).toBeLessThan(result.advertisedHourlyWage);
  });

  it("advertised wage is salary / 2080", () => {
    const result = calculateRealWage(baseWageInputs);
    expect(result.advertisedHourlyWage).toBeCloseTo(65_000 / 2080, 1);
  });

  it("wage gap is positive when there are work costs", () => {
    const result = calculateRealWage(baseWageInputs);
    expect(result.wageGapDollars).toBeGreaterThan(0);
    expect(result.wageGapPercent).toBeGreaterThan(0);
  });

  it("zero commute increases real wage", () => {
    const noCommute = calculateRealWage({
      ...baseWageInputs,
      dailyCommuteCost: 0,
      dailyCommuteMinutes: 0,
    });
    const withCommute = calculateRealWage(baseWageInputs);
    expect(noCommute.realHourlyWage).toBeGreaterThan(withCommute.realHourlyWage);
  });

  it("higher decompression lowers real wage", () => {
    const lowDecomp = calculateRealWage({
      ...baseWageInputs,
      dailyDecompressionMinutes: 0,
    });
    const highDecomp = calculateRealWage({
      ...baseWageInputs,
      dailyDecompressionMinutes: 120,
    });
    expect(highDecomp.realHourlyWage).toBeLessThan(lowDecomp.realHourlyWage);
  });

  it("remote worker scenario (no commute, low costs)", () => {
    const remote = calculateRealWage({
      ...baseWageInputs,
      dailyCommuteCost: 0,
      dailyCommuteMinutes: 0,
      monthlyClothing: 0,
      dailyMealCost: 3,
      dailyGetReadyMinutes: 10,
      dailyDecompressionMinutes: 15,
      weeklyUnpaidOvertime: 0,
    });
    expect(remote.realHourlyWage).toBeGreaterThan(20);
    expect(remote.wageGapPercent).toBeLessThan(0.35);
  });

  it("high-income scenario", () => {
    const high = calculateRealWage({
      ...baseWageInputs,
      annualGrossSalary: 250_000,
    });
    expect(high.realHourlyWage).toBeGreaterThan(50);
    expect(high.totalTax).toBeGreaterThan(60_000);
  });

  it("handles zero salary gracefully", () => {
    const zero = calculateRealWage({
      ...baseWageInputs,
      annualGrossSalary: 0,
    });
    expect(zero.realHourlyWage).toBeLessThanOrEqual(0);
    expect(zero.advertisedHourlyWage).toBe(0);
  });

  it("calculates working days correctly", () => {
    const result = calculateRealWage(baseWageInputs);
    // 52*5 - 10 - 8 - 5 = 237
    expect(result.workingDaysPerYear).toBe(237);
  });

  it("total work hours includes all time categories", () => {
    const result = calculateRealWage(baseWageInputs);
    expect(result.totalWorkHoursPerYear).toBeGreaterThan(
      result.contractedHoursPerYear
    );
    expect(result.commuteHoursPerYear).toBeGreaterThan(0);
    expect(result.getReadyHoursPerYear).toBeGreaterThan(0);
    expect(result.decompressionHoursPerYear).toBeGreaterThan(0);
  });

  it("remote wage boost is positive when commute exists", () => {
    const result = calculateRealWage(baseWageInputs);
    expect(result.remoteWageBoost).toBeGreaterThan(0);
  });

  it("hours per $100 is reasonable", () => {
    const result = calculateRealWage(baseWageInputs);
    expect(result.hoursPer100Dollars).toBeGreaterThan(3);
    expect(result.hoursPer100Dollars).toBeLessThan(10);
  });

  // Property: adding any cost never increases real wage
  it("adding work costs never increases real wage", () => {
    const base = calculateRealWage(baseWageInputs);
    const moreCost = calculateRealWage({
      ...baseWageInputs,
      monthlyOtherCosts: 200,
    });
    expect(moreCost.realHourlyWage).toBeLessThanOrEqual(base.realHourlyWage);
  });

  it("adding work time never increases real wage", () => {
    const base = calculateRealWage(baseWageInputs);
    const moreTime = calculateRealWage({
      ...baseWageInputs,
      weeklyUnpaidOvertime: 10,
    });
    expect(moreTime.realHourlyWage).toBeLessThanOrEqual(base.realHourlyWage);
  });
});

// ─── Decision Calculator Tests ───────────────────────────────

describe("calculateDecision", () => {
  it("recommends hiring when time cost exceeds hire cost", () => {
    const result = calculateDecision({
      realHourlyWage: 30,
      taskDescription: "Clean house",
      hoursToComplete: 3,
      costToHire: 60,
      enjoyment: "neutral",
    });
    // 3 * 30 = $90 vs $60 → hire
    expect(result.verdict).toBe("hire");
    expect(result.savings).toBeCloseTo(30, 0);
  });

  it("recommends DIY when time cost is less than hire cost", () => {
    const result = calculateDecision({
      realHourlyWage: 15,
      taskDescription: "Mow lawn",
      hoursToComplete: 1,
      costToHire: 50,
      enjoyment: "neutral",
    });
    // 1 * 15 = $15 vs $50 → DIY
    expect(result.verdict).toBe("diy");
    expect(result.savings).toBeCloseTo(35, 0);
  });

  it("enjoyment 'avoid' increases effective time cost by 50%", () => {
    const result = calculateDecision({
      realHourlyWage: 20,
      taskDescription: "Taxes",
      hoursToComplete: 8,
      costToHire: 250,
      enjoyment: "avoid",
    });
    // 8 * 20 = $160, × 1.5 = $240 vs $250 → DIY by $10
    expect(result.adjustedTimeCost).toBeCloseTo(240, 0);
    expect(result.enjoymentMultiplier).toBe(1.5);
  });

  it("enjoyment 'love' decreases effective time cost by 70%", () => {
    const result = calculateDecision({
      realHourlyWage: 30,
      taskDescription: "Cook dinner",
      hoursToComplete: 1.5,
      costToHire: 35,
      enjoyment: "love",
    });
    // 1.5 * 30 = $45, × 0.3 = $13.50 vs $35 → DIY
    expect(result.adjustedTimeCost).toBeCloseTo(13.5, 0);
    expect(result.verdict).toBe("diy");
  });

  it("handles zero time gracefully", () => {
    const result = calculateDecision({
      realHourlyWage: 25,
      taskDescription: "",
      hoursToComplete: 0,
      costToHire: 50,
      enjoyment: "neutral",
    });
    expect(result.diyTimeCost).toBe(0);
    expect(result.verdict).toBe("diy");
  });

  it("handles zero hire cost gracefully", () => {
    const result = calculateDecision({
      realHourlyWage: 25,
      taskDescription: "",
      hoursToComplete: 2,
      costToHire: 0,
      enjoyment: "neutral",
    });
    expect(result.verdict).toBe("hire");
  });
});

// ─── Job Comparison Tests ────────────────────────────────────

describe("compareJobs", () => {
  it("lower salary remote job can beat higher salary commute job", () => {
    const result = compareJobs(baseJobA, baseJobB);
    // Job B: $60k remote, no commute, no tax state, more vacation
    // Job A: $65k, 50min commute, IL tax
    expect(result.jobB.realHourlyWage).toBeGreaterThan(
      result.jobA.realHourlyWage
    );
    expect(result.winner).toBe("b");
  });

  it("identical jobs produce a tie", () => {
    const result = compareJobs(baseJobA, { ...baseJobA, label: "Same Job" });
    expect(result.winner).toBe("tie");
    expect(Math.abs(result.wageDifference)).toBeLessThan(0.5);
  });

  it("returns both full wage results", () => {
    const result = compareJobs(baseJobA, baseJobB);
    expect(result.jobA.grossAnnual).toBe(65_000);
    expect(result.jobB.grossAnnual).toBe(60_000);
    expect(result.jobA.totalWorkHoursPerYear).toBeGreaterThan(0);
    expect(result.jobB.totalWorkHoursPerYear).toBeGreaterThan(0);
  });

  it("hours difference reflects commute/overtime delta", () => {
    const result = compareJobs(baseJobA, baseJobB);
    // Job A has 50min commute + 3hr OT, Job B has 0 commute + 1hr OT + more PTO
    expect(result.hoursDifference).toBeGreaterThan(100);
  });

  it("days difference is hours / 8", () => {
    const result = compareJobs(baseJobA, baseJobB);
    expect(result.daysDifference).toBeCloseTo(
      result.hoursDifference / 8,
      1
    );
  });

  it("respects filing status parameter", () => {
    const single = compareJobs(baseJobA, baseJobB, "single");
    const mfj = compareJobs(baseJobA, baseJobB, "mfj");
    // MFJ has lower taxes → higher real wages for both
    expect(mfj.jobA.realHourlyWage).toBeGreaterThan(
      single.jobA.realHourlyWage
    );
  });
});

// ─── Formatting Tests ────────────────────────────────────────

describe("fmtCurrency", () => {
  it("formats positive values", () => {
    expect(fmtCurrency(1234)).toBe("$1,234");
  });

  it("formats with decimals", () => {
    expect(fmtCurrency(24.53, 2)).toBe("$24.53");
  });

  it("handles Infinity", () => {
    expect(fmtCurrency(Infinity)).toBe("—");
  });

  it("handles zero", () => {
    expect(fmtCurrency(0)).toBe("$0");
  });
});

describe("fmtPercent", () => {
  it("formats decimal as percentage", () => {
    expect(fmtPercent(0.35)).toBe("35.0%");
  });

  it("handles Infinity", () => {
    expect(fmtPercent(Infinity)).toBe("—");
  });
});

describe("fmtHoursMinutes", () => {
  it("formats hours only", () => {
    expect(fmtHoursMinutes(3)).toBe("3hrs");
  });

  it("formats 1 hour singular", () => {
    expect(fmtHoursMinutes(1)).toBe("1hr");
  });

  it("formats hours and minutes", () => {
    expect(fmtHoursMinutes(2.5)).toBe("2hr 30min");
  });

  it("formats minutes only", () => {
    expect(fmtHoursMinutes(0.75)).toBe("45min");
  });

  it("handles Infinity", () => {
    expect(fmtHoursMinutes(Infinity)).toBe("—");
  });
});

describe("fmtNumber", () => {
  it("formats with commas", () => {
    expect(fmtNumber(1896)).toBe("1,896");
  });

  it("handles Infinity", () => {
    expect(fmtNumber(Infinity)).toBe("—");
  });
});

// ─── Data Validation ─────────────────────────────────────────

describe("STATE_TAX_RATES", () => {
  it("has 51 entries", () => {
    expect(STATE_TAX_RATES.length).toBe(51);
  });

  it("all rates are in valid range", () => {
    for (const s of STATE_TAX_RATES) {
      expect(s.rate).toBeGreaterThanOrEqual(0);
      expect(s.rate).toBeLessThan(0.15);
    }
  });

  it("includes no-tax states", () => {
    const noTax = STATE_TAX_RATES.filter(
      (s) => s.rate === 0 && s.id !== "none"
    ).map((s) => s.id);
    expect(noTax).toContain("TX");
    expect(noTax).toContain("FL");
    expect(noTax).toContain("WA");
  });
});

describe("DECISION_PRESETS", () => {
  it("has 6 presets", () => {
    expect(DECISION_PRESETS.length).toBe(6);
  });

  it("all presets have positive hours and costs", () => {
    for (const p of DECISION_PRESETS) {
      expect(p.hours).toBeGreaterThan(0);
      expect(p.cost).toBeGreaterThan(0);
    }
  });
});
