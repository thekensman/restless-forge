/**
 * TattooSafe — Unit Tests
 */

import { describe, it, expect } from "vitest";
import {
  ftInToCm, cmToIn, inToCm, sqCmToSqIn,
  BODY_PARTS, getBodyPart, getBodyPartsByGroup,
  maxTattooDimensions, checkFit, generateSilhouetteSvg,
  HOURLY_RATES, COMPLEXITY, PLACEMENT_DIFFICULTY,
  dimensionsToSqIn, estimateNeedleTime, estimateSessionTime,
  calculatePrice, fmtPriceRange, fmtTime,
} from "../engine";

// ─── Unit Conversion Tests ───────────────────────────────────

describe("ftInToCm", () => {
  it("converts 5'7\" to ~170 cm", () => {
    expect(ftInToCm(5, 7)).toBeCloseTo(170.18, 1);
  });
  it("converts 6'0\" to ~183 cm", () => {
    expect(ftInToCm(6, 0)).toBeCloseTo(182.88, 1);
  });
  it("returns NaN for negative feet", () => {
    expect(ftInToCm(-1, 0)).toBeNaN();
  });
  it("returns NaN for 12+ inches", () => {
    expect(ftInToCm(5, 12)).toBeNaN();
  });
  it("returns NaN for negative inches", () => {
    expect(ftInToCm(5, -1)).toBeNaN();
  });
});

describe("cmToIn / inToCm", () => {
  it("cmToIn: 2.54 cm → 1 in", () => {
    expect(cmToIn(2.54)).toBeCloseTo(1.0, 3);
  });
  it("inToCm: 1 in → 2.54 cm", () => {
    expect(inToCm(1)).toBeCloseTo(2.54, 3);
  });
  it("round-trip: cmToIn(inToCm(x)) ≈ x", () => {
    expect(cmToIn(inToCm(7.5))).toBeCloseTo(7.5, 3);
  });
});

describe("sqCmToSqIn", () => {
  it("6.4516 sq cm → 1 sq in", () => {
    expect(sqCmToSqIn(6.4516)).toBeCloseTo(1.0, 3);
  });
});

// ─── Body Part Catalogue ─────────────────────────────────────

describe("BODY_PARTS", () => {
  it("has 16 entries", () => {
    expect(BODY_PARTS).toHaveLength(16);
  });
  it("all parts have required fields", () => {
    for (const bp of BODY_PARTS) {
      expect(bp.id).toBeTruthy();
      expect(bp.label).toBeTruthy();
      expect(bp.group).toBeTruthy();
      expect(bp.widthRatio).toBeGreaterThan(0);
      expect(bp.heightRatio).toBeGreaterThan(0);
      expect(bp.difficulty).toBeGreaterThanOrEqual(1.0);
      expect(bp.description.length).toBeGreaterThan(10);
    }
  });
  it("all 4 groups are represented", () => {
    const groups = new Set(BODY_PARTS.map(bp => bp.group));
    expect(groups).toContain("arm");
    expect(groups).toContain("torso");
    expect(groups).toContain("leg");
    expect(groups).toContain("other");
  });
  it("all zones have valid bounds", () => {
    for (const bp of BODY_PARTS) {
      expect(bp.zone.x).toBeGreaterThanOrEqual(0);
      expect(bp.zone.y).toBeGreaterThanOrEqual(0);
      expect(bp.zone.w).toBeGreaterThan(0);
      expect(bp.zone.h).toBeGreaterThan(0);
    }
  });
});

describe("getBodyPart", () => {
  it("finds inner_forearm", () => {
    expect(getBodyPart("inner_forearm")?.label).toBe("Inner Forearm");
  });
  it("returns null for nonexistent", () => {
    expect(getBodyPart("nonexistent")).toBeNull();
  });
});

describe("getBodyPartsByGroup", () => {
  it("arm group has 5 parts", () => {
    expect(getBodyPartsByGroup("arm")).toHaveLength(5);
  });
  it("torso group has 5 parts", () => {
    expect(getBodyPartsByGroup("torso")).toHaveLength(5);
  });
  it("leg group has 3 parts", () => {
    expect(getBodyPartsByGroup("leg")).toHaveLength(3);
  });
  it("other group has 3 parts", () => {
    expect(getBodyPartsByGroup("other")).toHaveLength(3);
  });
});

// ─── Sizing Tests ────────────────────────────────────────────

describe("maxTattooDimensions", () => {
  it("returns positive values for valid input", () => {
    const max = maxTattooDimensions("inner_forearm", 170);
    expect(max).not.toBeNull();
    expect(max!.maxWidthCm).toBeGreaterThan(0);
    expect(max!.maxHeightCm).toBeGreaterThan(0);
  });
  it("back is wider than forearm", () => {
    const forearm = maxTattooDimensions("inner_forearm", 170)!;
    const back = maxTattooDimensions("upper_back", 170)!;
    expect(back.maxWidthCm).toBeGreaterThan(forearm.maxWidthCm);
  });
  it("taller person → larger max dimensions", () => {
    const short = maxTattooDimensions("inner_forearm", 150)!;
    const tall = maxTattooDimensions("inner_forearm", 190)!;
    expect(tall.maxWidthCm).toBeGreaterThan(short.maxWidthCm);
    expect(tall.maxHeightCm).toBeGreaterThan(short.maxHeightCm);
  });
  it("returns null for bad ID", () => {
    expect(maxTattooDimensions("nonexistent", 170)).toBeNull();
  });
  it("returns null for zero height", () => {
    expect(maxTattooDimensions("inner_forearm", 0)).toBeNull();
  });
  it("returns null for negative height", () => {
    expect(maxTattooDimensions("inner_forearm", -10)).toBeNull();
  });
});

describe("checkFit", () => {
  it("small tattoo fits on forearm", () => {
    const fit = checkFit("inner_forearm", 170, 4, 10);
    expect(fit.fits).toBe(true);
    expect(fit.widthPct).toBeGreaterThan(0);
    expect(fit.widthPct).toBeLessThanOrEqual(100);
  });
  it("oversized tattoo does not fit on wrist", () => {
    const fit = checkFit("wrist", 170, 20, 20);
    expect(fit.fits).toBe(false);
    expect(fit.widthPct).toBeGreaterThan(100);
  });
  it("returns false for bad ID", () => {
    expect(checkFit("nonexistent", 170, 5, 5).fits).toBe(false);
  });
});

// ─── SVG Generation ──────────────────────────────────────────

describe("generateSilhouetteSvg", () => {
  it("returns SVG for valid input", () => {
    const svg = generateSilhouetteSvg("inner_forearm", 170, 8, 12);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Inner Forearm");
    expect(svg).toContain("8 cm");
    expect(svg).toContain("12 cm");
  });
  it("applies rotation", () => {
    const svg = generateSilhouetteSvg("chest", 180, 15, 10, { rotation: 45 });
    expect(svg).toContain("rotate(45");
  });
  it("applies custom opacity", () => {
    const svg = generateSilhouetteSvg("thigh", 175, 10, 15, { opacity: 0.5 });
    expect(svg).toContain("0.5");
  });
  it("returns empty for bad ID", () => {
    expect(generateSilhouetteSvg("nonexistent", 170, 8, 12)).toBe("");
  });
});

// ─── Pricing Market Data ─────────────────────────────────────

describe("HOURLY_RATES", () => {
  it("rates ordered: apprentice < experienced < specialist < celebrity", () => {
    expect(HOURLY_RATES.apprentice.max).toBeLessThanOrEqual(HOURLY_RATES.experienced.max);
    expect(HOURLY_RATES.experienced.max).toBeLessThanOrEqual(HOURLY_RATES.specialist.max);
    expect(HOURLY_RATES.specialist.max).toBeLessThanOrEqual(HOURLY_RATES.celebrity.max);
  });
  it("all rates have positive min < max", () => {
    for (const rate of Object.values(HOURLY_RATES)) {
      expect(rate.min).toBeGreaterThan(0);
      expect(rate.max).toBeGreaterThan(rate.min);
    }
  });
});

describe("COMPLEXITY", () => {
  it("time ordering: simple < moderate < full_color < photorealistic", () => {
    expect(COMPLEXITY.simple_line.timePerSqIn).toBeLessThan(COMPLEXITY.moderate_detail.timePerSqIn);
    expect(COMPLEXITY.moderate_detail.timePerSqIn).toBeLessThan(COMPLEXITY.full_color.timePerSqIn);
    expect(COMPLEXITY.full_color.timePerSqIn).toBeLessThan(COMPLEXITY.photorealistic.timePerSqIn);
  });
});

describe("PLACEMENT_DIFFICULTY", () => {
  it("has 16 placements", () => {
    expect(Object.keys(PLACEMENT_DIFFICULTY)).toHaveLength(16);
  });
  it("all multipliers >= 1.0", () => {
    for (const place of Object.values(PLACEMENT_DIFFICULTY)) {
      expect(place.mult).toBeGreaterThanOrEqual(1.0);
    }
  });
});

// ─── Price Calculation ───────────────────────────────────────

describe("dimensionsToSqIn", () => {
  it("1 inch × 1 inch = 1 sq in", () => {
    expect(dimensionsToSqIn(2.54, 2.54)).toBeCloseTo(1.0, 2);
  });
  it("zero width → zero area", () => {
    expect(dimensionsToSqIn(0, 10)).toBe(0);
  });
});

describe("estimateNeedleTime", () => {
  it("returns positive for valid inputs", () => {
    expect(estimateNeedleTime(10, "simple_line", "inner_forearm")).toBeGreaterThan(0);
  });
  it("photorealistic takes longer than simple", () => {
    const simple = estimateNeedleTime(10, "simple_line", "inner_forearm");
    const photo = estimateNeedleTime(10, "photorealistic", "inner_forearm");
    expect(photo).toBeGreaterThan(simple);
  });
  it("ribs take longer than forearm", () => {
    const forearm = estimateNeedleTime(10, "simple_line", "inner_forearm");
    const ribs = estimateNeedleTime(10, "simple_line", "ribs");
    expect(ribs).toBeGreaterThan(forearm);
  });
});

describe("estimateSessionTime", () => {
  it("short tattoo: 1 session", () => {
    const s = estimateSessionTime(30);
    expect(s.sessions).toBe(1);
    expect(s.totalMinutes).toBeGreaterThan(30);
  });
  it("long tattoo: multiple sessions", () => {
    const s = estimateSessionTime(600);
    expect(s.sessions).toBeGreaterThan(1);
    expect(s.hoursPerSession).toHaveLength(s.sessions);
  });
});

describe("calculatePrice", () => {
  it("small piece: above shop minimum", () => {
    const p = calculatePrice(3, 3, "simple_line", "inner_forearm", "experienced");
    expect(p.low).toBeGreaterThanOrEqual(50);
    expect(p.high).toBeGreaterThanOrEqual(p.low);
  });
  it("larger tattoo → higher price", () => {
    const small = calculatePrice(3, 3, "simple_line", "inner_forearm", "experienced");
    const large = calculatePrice(30, 40, "simple_line", "inner_forearm", "experienced");
    expect(large.high).toBeGreaterThan(small.high);
  });
  it("more complex → higher price", () => {
    const simple = calculatePrice(10, 15, "simple_line", "inner_forearm", "experienced");
    const photo = calculatePrice(10, 15, "photorealistic", "inner_forearm", "experienced");
    expect(photo.high).toBeGreaterThan(simple.high);
  });
  it("specialist > apprentice", () => {
    const app = calculatePrice(10, 15, "moderate_detail", "inner_forearm", "apprentice");
    const spec = calculatePrice(10, 15, "moderate_detail", "inner_forearm", "specialist");
    expect(spec.high).toBeGreaterThan(app.high);
  });
  it("ribs > forearm price", () => {
    const forearm = calculatePrice(10, 15, "moderate_detail", "inner_forearm", "experienced");
    const ribs = calculatePrice(10, 15, "moderate_detail", "ribs", "experienced");
    expect(ribs.high).toBeGreaterThan(forearm.high);
  });
  it("huge back piece: multi-session", () => {
    const huge = calculatePrice(40, 50, "photorealistic", "upper_back", "specialist");
    expect(huge.sessions).toBeGreaterThan(1);
  });
  it("includes pain level", () => {
    const p = calculatePrice(10, 15, "simple_line", "ribs", "experienced");
    expect(p.painLevel).toBe("High");
  });
  it("includes complexity label", () => {
    const p = calculatePrice(10, 15, "full_color", "inner_forearm", "experienced");
    expect(p.complexity).toBe("Full colour");
  });
});

// ─── Formatting ──────────────────────────────────────────────

describe("fmtPriceRange", () => {
  it("formats basic range", () => {
    expect(fmtPriceRange(150, 350)).toBe("$150 – $350");
  });
  it("formats with commas", () => {
    expect(fmtPriceRange(1000, 3000)).toContain("1,000");
  });
});

describe("fmtTime", () => {
  it("formats minutes", () => {
    expect(fmtTime(45)).toBe("45 min");
  });
  it("formats hours", () => {
    expect(fmtTime(120)).toBe("2 hrs");
  });
  it("singular hour", () => {
    expect(fmtTime(60)).toBe("1 hr");
  });
});

// ─── Realistic Scenarios ─────────────────────────────────────

describe("realistic pricing scenarios", () => {
  it("tiny wrist tattoo: near shop minimum", () => {
    const p = calculatePrice(2, 2, "simple_line", "wrist", "experienced");
    expect(p.low).toBeGreaterThanOrEqual(50);
    expect(p.low).toBeLessThan(200);
    expect(p.sessions).toBe(1);
  });
  it("medium forearm traditional: reasonable range", () => {
    const p = calculatePrice(10, 15, "moderate_detail", "inner_forearm", "experienced");
    expect(p.low).toBeGreaterThanOrEqual(100);
    expect(p.high).toBeLessThan(2000);
  });
  it("full back photorealistic: high-end, multi-session", () => {
    const p = calculatePrice(35, 45, "photorealistic", "upper_back", "celebrity");
    expect(p.low).toBeGreaterThanOrEqual(1500);
    expect(p.sessions).toBeGreaterThanOrEqual(3);
  });
});

// ─── Silhouette zone alignment (regression for inner-forearm-on-leg bug) ───

import { FIGURE_REGIONS } from "../engine";

describe("silhouette zone alignment", () => {
  const GROUP_REGIONS: Record<string, string[]> = {
    arm: ["left_arm", "right_arm", "torso"],
    torso: ["torso"],
    leg: ["left_leg", "right_leg"],
    other: ["head", "neck", "left_hand", "right_hand", "torso"],
  };
  const inside = (px: number, py: number, r: { x: number; y: number; w: number; h: number }) =>
    px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

  it("every body part's zone center lands on a limb of its own group", () => {
    for (const bp of BODY_PARTS) {
      const cx = (bp.zone.x + bp.zone.w / 2) * 200;
      const cy = (bp.zone.y + bp.zone.h / 2) * 400;
      const allowed = GROUP_REGIONS[bp.group].map((k) => FIGURE_REGIONS[k]);
      const hit = allowed.some((r) => inside(cx, cy, r));
      expect(hit, `${bp.id} zone center (${cx},${cy}) must be on a ${bp.group} region`).toBe(true);
    }
  });

  it("inner forearm zone is NOT on the legs (the original bug)", () => {
    const bp = BODY_PARTS.find((b) => b.id === "inner_forearm")!;
    const cy = (bp.zone.y + bp.zone.h / 2) * 400;
    for (const leg of [FIGURE_REGIONS.left_leg, FIGURE_REGIONS.right_leg]) {
      const cx = (bp.zone.x + bp.zone.w / 2) * 200;
      expect(inside(cx, cy, leg)).toBe(false);
    }
  });
});

import { wrapSpanRadians, keyOutBackground, BODY_PARTS as BP2 } from "../engine";

describe("wrapSpanRadians + circumference data", () => {
  it("every body part carries a plausible circumference", () => {
    for (const bp of BP2) {
      expect(bp.circumferenceCm).toBeGreaterThan(10);
      expect(bp.circumferenceCm).toBeLessThan(130);
    }
  });
  it("span is proportional to width over circumference", () => {
    // 6.5cm-wide piece on a 26cm forearm covers 1/4 of the circumference → π/2
    expect(wrapSpanRadians(6.5, 26)).toBeCloseTo(Math.PI / 2, 6);
  });
  it("caps at a half cylinder", () => {
    expect(wrapSpanRadians(100, 20)).toBe(Math.PI);
  });
  it("falls back to π when inputs are missing", () => {
    expect(wrapSpanRadians(0, 26)).toBe(Math.PI);
    expect(wrapSpanRadians(10, 0)).toBe(Math.PI);
  });
  it("small tattoo on a large limb is nearly flat", () => {
    expect(wrapSpanRadians(3, 55)).toBeLessThan(0.35);
  });
});

describe("keyOutBackground", () => {
  const buf = (pixels: number[][]): { data: number[]; width: number; height: number } => ({
    data: pixels.flat(),
    width: 4,
    height: 4,
  });
  const px = (r: number, g: number, b: number): number[] => [r, g, b, 255];

  it("keys a uniform dark background, keeps a distinct subject", () => {
    const dark = px(20, 20, 25);
    const gold = px(212, 164, 78);
    const grid = Array.from({ length: 16 }, (_, i) => ([5, 6, 9, 10].includes(i) ? [...gold] : [...dark]));
    const b = buf(grid);
    expect(keyOutBackground(b)).toBe(true);
    expect(b.data[3]).toBe(0);              // corner is transparent
    expect(b.data[(5 * 4) + 3]).toBe(255);  // subject untouched
  });

  it("refuses when corners disagree (photo, not a logo)", () => {
    const grid = Array.from({ length: 16 }, (_, i) => px(i * 15, 120, 200 - i * 10));
    const b = buf(grid);
    expect(keyOutBackground(b)).toBe(false);
    expect(b.data[3]).toBe(255);
  });
});
