import { describe, it, expect } from "vitest";
import {
  TASK_TYPES,
  WUE,
  EWIF,
  calcWater,
  compare,
  showerSeconds,
  fmtLiters,
  fmtBand,
  fmtEnergy,
  COMPARISONS,
} from "../engine";

describe("data integrity", () => {
  it("every task type has an ordered low ≤ typical ≤ high energy band", () => {
    for (const t of TASK_TYPES) {
      expect(t.energyWh.low).toBeGreaterThan(0);
      expect(t.energyWh.low).toBeLessThanOrEqual(t.energyWh.typical);
      expect(t.energyWh.typical).toBeLessThanOrEqual(t.energyWh.high);
    }
  });

  it("water intensity bands are ordered", () => {
    for (const b of [WUE, EWIF]) {
      expect(b.low).toBeLessThanOrEqual(b.typical);
      expect(b.typical).toBeLessThanOrEqual(b.high);
    }
  });

  it("task ids are unique", () => {
    const ids = TASK_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("published-figure bracketing", () => {
  it("typical chat prompt water lands in the published single-digit-mL zone", () => {
    // Google disclosed 0.26 mL/prompt (their accounting); UC Riverside-era
    // estimates run 10-50 mL incl. generation water. Our combined typical
    // must sit between those goalposts.
    const r = calcWater({ chat: 1 });
    const mL = r.totalLPerDay.typical * 1000;
    expect(mL).toBeGreaterThan(0.2);
    expect(mL).toBeLessThan(10);
  });

  it("low bound is at or below Google's five-drops figure", () => {
    const r = calcWater({ chat: 1 });
    expect(r.totalLPerDay.low * 1000).toBeLessThanOrEqual(0.26);
  });

  it("high bound reaches the bottle-adjacent headline zone", () => {
    const r = calcWater({ chat: 1 });
    expect(r.totalLPerDay.high * 1000).toBeGreaterThan(10);
  });
});

describe("calcWater", () => {
  it("zero usage → zero water", () => {
    const r = calcWater({});
    expect(r.totalLPerDay.typical).toBe(0);
    expect(r.totalLPerYear.high).toBe(0);
  });

  it("negative and unknown inputs are ignored safely", () => {
    const r = calcWater({ chat: -5, bogus: 100 });
    expect(r.totalLPerDay.high).toBe(0);
  });

  it("scales linearly with usage", () => {
    const one = calcWater({ chat: 1 });
    const ten = calcWater({ chat: 10 });
    expect(ten.totalLPerDay.typical).toBeCloseTo(one.totalLPerDay.typical * 10, 10);
  });

  it("onsite + offsite = total", () => {
    const r = calcWater({ chat: 20, image: 3 });
    expect(r.onsiteLPerDay.typical + r.offsiteLPerDay.typical).toBeCloseTo(
      r.totalLPerDay.typical,
      10,
    );
  });

  it("annual = daily × 365", () => {
    const r = calcWater({ reasoning: 4 });
    expect(r.totalLPerYear.typical).toBeCloseTo(r.totalLPerDay.typical * 365, 10);
  });

  it("offsite (electricity) dominates onsite (cooling) at typical intensities", () => {
    // EWIF typical > WUE typical — the core explainer of the tool.
    const r = calcWater({ chat: 10 });
    expect(r.offsiteLPerDay.typical).toBeGreaterThan(r.onsiteLPerDay.typical);
  });

  it("video dwarfs chat per unit", () => {
    const chat = calcWater({ chat: 1 });
    const video = calcWater({ video: 1 });
    expect(video.totalLPerDay.typical).toBeGreaterThan(chat.totalLPerDay.typical * 50);
  });
});

describe("comparisons", () => {
  it("returns every comparison with a positive count", () => {
    const res = compare(1000);
    expect(res.length).toBe(COMPARISONS.length);
    for (const c of res) expect(c.count).toBeGreaterThan(0);
  });

  it("1650 L ≈ one burger", () => {
    const burger = compare(1650).find((c) => c.id === "burger")!;
    expect(burger.count).toBeCloseTo(1, 5);
  });

  it("shower seconds: one full shower's worth ≈ 480 s", () => {
    expect(showerSeconds(65)).toBeCloseTo(480, 0);
  });
});

describe("formatting", () => {
  it("fmtLiters picks sensible units", () => {
    expect(fmtLiters(0.0005)).toContain("mL");
    expect(fmtLiters(0.05)).toBe("50 mL");
    expect(fmtLiters(2.5)).toBe("2.5 L");
    expect(fmtLiters(12345)).toBe("12,345 L");
  });

  it("fmtBand renders low – high", () => {
    expect(fmtBand({ low: 0.001, typical: 0.01, high: 0.1 })).toBe("1.0 mL – 100 mL");
  });

  it("fmtEnergy switches to kWh", () => {
    expect(fmtEnergy(500)).toBe("500 Wh");
    expect(fmtEnergy(2500)).toBe("2.5 kWh");
  });
});
