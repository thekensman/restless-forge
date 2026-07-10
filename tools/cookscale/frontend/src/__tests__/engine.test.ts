/**
 * CookScale — conversion & pan-scaling engine tests.
 */
import { describe, it, expect } from "vitest";
import {
  DENSITIES, PAN_PRESETS,
  convertVolume, convertWeight, volumeToWeight, weightToVolume,
  panVolume, panScaleFactor, adjustBakeTime, fToC, cToF,
} from "../engine";

describe("volume conversion", () => {
  it("1 cup ≈ 16 tbsp / 48 tsp", () => {
    expect(convertVolume(1, "cup", "tbsp")).toBeCloseTo(16, 1);
    expect(convertVolume(1, "cup", "tsp")).toBeCloseTo(48, 0);
  });
  it("metric round-trips", () => {
    expect(convertVolume(1, "l", "ml")).toBe(1000);
    expect(convertVolume(500, "ml", "cup")).toBeCloseTo(2.113, 2);
  });
});

describe("weight conversion", () => {
  it("1 lb = 453.592 g and 16 oz", () => {
    expect(convertWeight(1, "lb", "g")).toBeCloseTo(453.592, 2);
    expect(convertWeight(1, "lb", "oz")).toBeCloseTo(16, 2);
  });
});

describe("density-based volume ↔ weight", () => {
  it("1 cup all-purpose flour = 120 g", () => {
    expect(volumeToWeight(1, "all-purpose flour")).toBe(120);
  });
  it("240 g flour = 2 cups", () => {
    expect(weightToVolume(240, "all-purpose flour")).toBe(2);
  });
  it("honey is heavier than milk per cup", () => {
    expect(DENSITIES["honey"]).toBeGreaterThan(DENSITIES["milk"]);
  });
  it("unknown ingredient returns null", () => {
    expect(volumeToWeight(1, "unobtanium")).toBeNull();
  });
});

describe("pan scaling", () => {
  it("8\" → 9\" round scales by area ratio (~1.27)", () => {
    const f = panScaleFactor("round", { width: 20.3, height: 5 }, "round", { width: 22.9, height: 5 });
    expect(f).toBeCloseTo(1.27, 1);
  });
  it("identical pans scale by 1", () => {
    const p = PAN_PRESETS["round_8"];
    expect(panScaleFactor(p.shape, p.dims, p.shape, p.dims)).toBe(1);
  });
  it("bundt volume is 60% of the equivalent round", () => {
    const round = panVolume("round", { width: 25.4, height: 10 });
    const bundt = panVolume("bundt", { width: 25.4, height: 10 });
    expect(bundt / round).toBeCloseTo(0.6, 5);
  });
  it("bake time adjusts sub-linearly", () => {
    // doubling the batter should NOT double the time
    const t = adjustBakeTime(30, 2);
    expect(t).toBeGreaterThan(30);
    expect(t).toBeLessThan(60);
  });
});

describe("oven temperature", () => {
  it("350°F = 177°C and back", () => {
    expect(fToC(350)).toBe(177);
    expect(cToF(180)).toBe(356);
  });
});
