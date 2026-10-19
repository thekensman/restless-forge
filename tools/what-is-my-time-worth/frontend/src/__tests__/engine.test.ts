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
  taxTooltips,
  TAX_YEAR,
  STATES,
  allowanceAt,
  DECISION_PRESETS,
  type WageInputs,
  type JobInputs,
} from "../engine";
import { TAX } from "../../../../../data/tax";

// ─── Defaults ────────────────────────────────────────────────

const baseWageInputs: WageInputs = {
  annualGrossSalary: 65_000,
  filingStatus: "single",
  stateId: "IL",
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
  stateId: "IL",
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
  stateId: "none",
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
    // Tax year 2026: 25,000 − 16,100 standard deduction = 8,900 taxable,
    // entirely within the 10% bracket (≤ 12,400) → 890.
    const tax = calcFederalIncomeTax(25_000, "single");
    expect(tax).toBe(890);
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
  // Each expected value is worked by hand from data/tax.ts (2026).
  const tax = (gross: number, state: string, status: "single" | "mfj" = "single") =>
    calcStateTax(gross, state, status);

  it("returns 0 with no state, a state without wage tax, or no income", () => {
    expect(tax(100_000, "none")).toBe(0);
    expect(tax(100_000, "TX")).toBe(0);
    expect(tax(100_000, "WA")).toBe(0);
    expect(tax(0, "CA")).toBe(0);
  });

  it("California, single, $105,000: brackets, then the exemption credit", () => {
    // 105,000 − 5,706 = 99,294 taxable. 1% × 11,079 = 110.79; 2% × 15,185 =
    // 303.70; 4% × 15,188 = 607.52; 6% × 16,090 = 965.40; 8% × 15,182 =
    // 1,214.56; 9.3% × 26,570 = 2,471.01. Total 5,672.98 − 153 credit.
    expect(tax(105_000, "CA")).toBe(5519.98);
  });

  it("California, married filing jointly, $105,000", () => {
    // 105,000 − 11,412 = 93,588. 1% × 22,158 = 221.58; 2% × 30,370 = 607.40;
    // 4% × 30,376 = 1,215.04; 6% × 10,684 = 641.04. Total 2,685.06 − 306.
    expect(tax(105_000, "CA", "mfj")).toBe(2379.06);
  });

  it("New York, single, $85,000", () => {
    // 85,000 − 8,000 = 77,000. 3.9% × 8,500 = 331.50; 4.4% × 3,200 = 140.80;
    // 5.15% × 2,200 = 113.30; 5.4% × 63,100 = 3,407.40.
    expect(tax(85_000, "NY")).toBe(3993);
  });

  it("Oregon, single, $60,000", () => {
    // 60,000 − 2,910 = 57,090. 4.75% × 4,550 = 216.125; 6.75% × 6,850 =
    // 462.375; 8.75% × 45,690 = 3,997.875. Total 4,676.375 − 263 credit.
    expect(tax(60_000, "OR")).toBeCloseTo(4413.38, 1);
  });

  it("Oregon drops the exemption credit over $100,000", () => {
    // 100,001 − 2,910 = 97,091: 216.125 + 462.375 + 8.75% × 85,691.
    expect(tax(100_001, "OR")).toBeCloseTo(216.125 + 462.375 + 0.0875 * 85_691, 1);
  });

  it("Minnesota, single, $75,000", () => {
    // 75,000 − 15,300 = 59,700. 5.35% × 33,310 = 1,782.085; 6.8% × 26,390 = 1,794.52.
    expect(tax(75_000, "MN")).toBeCloseTo(3576.61, 1);
  });

  it("New Jersey, single, $90,000: no standard deduction, $1,000 exemption", () => {
    // 89,000. 1.4% × 20,000 = 280; 1.75% × 15,000 = 262.50; 3.5% × 5,000 =
    // 175; 5.525% × 35,000 = 1,933.75; 6.37% × 14,000 = 891.80.
    expect(tax(90_000, "NJ")).toBe(3543.05);
  });

  it("Pennsylvania, $65,000: flat, no deduction", () => {
    expect(tax(65_000, "PA")).toBe(1995.5); // 3.07% × 65,000
  });

  it("Illinois, single, $65,000: flat, with exemption", () => {
    expect(tax(65_000, "IL")).toBe(3072.71); // 4.95% × (65,000 − 2,925)
  });

  it("Illinois drops the exemption over $250,000", () => {
    expect(tax(250_001, "IL")).toBe(12375.05); // 4.95% × 250,001
  });

  it("Massachusetts, $1.2 million: the surtax as a top bracket", () => {
    // 1,200,000 − 4,400 = 1,195,600. 5% × 1,083,150 = 54,157.50; 9% × 112,450 = 10,120.50.
    expect(tax(1_200_000, "MA")).toBe(64278);
  });

  it("South Carolina, single, $65,000: the deduction phases out", () => {
    // Deduction 15,000 × (1 − 25,000 / 55,000) = 8,181.82; taxable 56,818.18.
    // 1.99% × 30,000 = 597; 5.21% × 26,818.18 = 1,397.23.
    expect(tax(65_000, "SC")).toBeCloseTo(1994.23, 1);
  });

  it("Utah, single, $65,000: the credit phases out", () => {
    // 4.45% × 65,000 = 2,892.50; credit 966 − 1.3% × 46,787 = 357.77.
    expect(tax(65_000, "UT")).toBeCloseTo(2534.73, 1);
  });

  it("Wisconsin, single, $65,000: the deduction phases out", () => {
    // Deduction 13,960 − 12% × 44,880 = 8,574.40; taxable 65,000 − 8,574.40 − 700
    // = 55,725.60. 3.5% × 15,110 = 528.85; 4.4% × 36,840 = 1,620.96; 5.3% × 3,775.60 = 200.11.
    expect(tax(65_000, "WI")).toBeCloseTo(2349.92, 1);
  });

  it("Ohio, $65,000: $332 plus 2.75% over $26,050", () => {
    // Exemption 2,150 (income over $40,000); taxable 62,850; 2.75% × 36,800 = 1,012.
    expect(tax(65_000, "OH")).toBe(1344);
  });

  it("Arkansas uses one table up to $94,700 and another above it", () => {
    // 65,000 − 2,470 = 62,530: 2% × 5,600 + 3% × 4,800 + 3.4% × 10,400 +
    // 3.7% × 36,130 = 1,946.41, less the $29 credit.
    expect(tax(65_000, "AR")).toBeCloseTo(1917.41, 1);
    // 150,000 − 2,470 = 147,530: 2% × 4,700 + 3.7% × 142,830 = 5,378.71, less 29.
    expect(tax(150_000, "AR")).toBeCloseTo(5349.71, 1);
  });

  it("Connecticut, single, $40,000: the exemption shrinks dollar for dollar", () => {
    // Exemption 15,000 − 10,000 = 5,000; 35,000 taxable: 2% × 10,000 + 4.5% × 25,000.
    expect(tax(40_000, "CT")).toBe(1325);
  });

  it("Maryland, single, $130,000: the exemption steps down", () => {
    // 130,000 − 3,350 − 800 = 125,850. 20 + 30 + 40 + 4.75% × 97,000 = 4,607.50
    // + 5% × 25,000 = 1,250 + 5.25% × 850 = 44.625.
    expect(tax(130_000, "MD")).toBeCloseTo(5992.13, 1);
  });

  it("never goes below zero when a credit exceeds the tax", () => {
    expect(tax(1_000, "CA")).toBe(0);
  });
});

describe("allowanceAt", () => {
  it("applies steps, then the phase-out floor", () => {
    const a = { amount: 100, steps: [{ over: 10, amount: 50 }], phaseOut: { start: 20, rate: 1, floor: 5 } };
    expect(allowanceAt(a, 10)).toBe(100);
    expect(allowanceAt(a, 11)).toBe(50);
    expect(allowanceAt(a, 30)).toBe(40);
    expect(allowanceAt(a, 100)).toBe(5);
    expect(allowanceAt(undefined, 100)).toBe(0);
    expect(allowanceAt(7, 1e9)).toBe(7);
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

describe("TAX.states", () => {
  const brackets = TAX.states.flatMap((s) => [s.brackets.single, s.brackets.mfj]);

  it("has the 50 states and DC, each once", () => {
    const ids = TAX.states.map((s) => s.id);
    expect(ids.length).toBe(51);
    expect(new Set(ids).size).toBe(51);
    expect(ids).toContain("DC");
    expect(STATES.map((s) => s.id)).toEqual(ids);
  });

  it("brackets ascend and end at Infinity", () => {
    for (const b of brackets) {
      if (b.length === 0) continue;
      for (let i = 1; i < b.length; i++) expect(b[i].limit).toBeGreaterThan(b[i - 1].limit);
      expect(b[b.length - 1].limit).toBe(Infinity);
    }
  });

  it("every rate is at least 0 and below 15%", () => {
    for (const b of brackets) {
      for (const { rate } of b) {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThan(0.15);
      }
    }
  });

  it("joint thresholds are at or above single ones", () => {
    for (const s of TAX.states) {
      const { single, mfj } = s.brackets;
      if (single.length !== mfj.length) continue;
      single.forEach((b, i) => expect(mfj[i].limit).toBeGreaterThanOrEqual(b.limit));
    }
  });

  it("states without a wage income tax have no brackets", () => {
    const none = TAX.states.filter((s) => s.brackets.single.length === 0).map((s) => s.id);
    expect(none.sort()).toEqual(["AK", "FL", "NH", "NV", "SD", "TN", "TX", "WA", "WY"]);
  });
});

describe("taxTooltips", () => {
  // The breakdown's tooltips once quoted a wage base a year out of date.
  // They are now built from the data the calculation uses.
  it("quotes the tax year and the Social Security wage base in use", () => {
    const tips = taxTooltips();
    expect(tips.federal).toContain(String(TAX_YEAR));
    expect(tips.fica).toContain(fmtCurrency(TAX.ssWageBase));
    expect(tips.fica).toContain(fmtCurrency(TAX.medicareSurtaxThreshold));
    expect(tips.fica).toContain("6.2%");
    expect(tips.fica).toContain("1.45%");
  });
});

describe("DECISION_PRESETS", () => {
  it("has presets with unique ids", () => {
    expect(DECISION_PRESETS.length).toBeGreaterThan(0);
    const ids = DECISION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all presets have positive hours and costs", () => {
    for (const p of DECISION_PRESETS) {
      expect(p.hours).toBeGreaterThan(0);
      expect(p.cost).toBeGreaterThan(0);
    }
  });
});
