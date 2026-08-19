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
  it("labels dimensions in inches when unit is 'in'", () => {
    const svg = generateSilhouetteSvg("inner_forearm", 170, 10.16, 12.7, { unit: "in" });
    expect(svg).toContain("4 in");
    expect(svg).toContain("5 in");
    expect(svg).not.toContain("cm</text>");
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

import { removeFlatBackground, invertForDarkBackdrop } from "../engine";

// Build a WxH RGBA buffer from a grid of [r,g,b] rows; alpha defaults 255.
const grid = (rows: number[][][]): { data: number[]; width: number; height: number } => {
  const height = rows.length;
  const width = rows[0].length;
  const data: number[] = [];
  for (const row of rows) for (const [r, g, b] of row) data.push(r, g, b, 255);
  return { data, width, height };
};
const alphaAt = (buf: { data: number[]; width: number }, x: number, y: number): number =>
  buf.data[(y * buf.width + x) * 4 + 3];

const D: [number, number, number] = [20, 20, 25]; // background (dark)
const S: [number, number, number] = [212, 164, 78]; // subject (gold)
const W: [number, number, number] = [248, 248, 248]; // white (matte / light lines)
const K: [number, number, number] = [5, 5, 5]; // near-black field

describe("removeFlatBackground (edge flood-fill)", () => {
  it("removes a border-connected flat background, keeps the subject", () => {
    const buf = grid([
      [D, D, D, D, D],
      [D, S, S, S, D],
      [D, S, S, S, D],
      [D, S, S, S, D],
      [D, D, D, D, D],
    ]);
    const res = removeFlatBackground(buf);
    expect(res.removed).toBe(true);
    expect(alphaAt(buf, 0, 0)).toBe(0);   // corner removed
    expect(alphaAt(buf, 2, 2)).toBe(255); // center subject kept
  });

  it("reports the removed backdrop's luminance", () => {
    const buf = grid([
      [D, D, D, D, D],
      [D, S, S, S, D],
      [D, S, S, S, D],
      [D, S, S, S, D],
      [D, D, D, D, D],
    ]);
    const res = removeFlatBackground(buf);
    expect(res.backdropLum).not.toBeNull();
    expect(res.backdropLum!).toBeLessThan(30); // D is dark
  });

  it("KEEPS a background-coloured hole enclosed by the subject (flood-fill's win over a global key)", () => {
    const buf = grid([
      [D, D, D, D, D],
      [D, S, S, S, D],
      [D, S, D, S, D], // center pixel is bg-coloured but walled in by subject
      [D, S, S, S, D],
      [D, D, D, D, D],
    ]);
    expect(removeFlatBackground(buf).removed).toBe(true);
    expect(alphaAt(buf, 0, 0)).toBe(0);   // outer background gone
    expect(alphaAt(buf, 2, 2)).toBe(255); // enclosed pocket survives
  });

  it("refuses when the border isn't a single flat colour (a photo)", () => {
    const rows = Array.from({ length: 5 }, (_, y) =>
      Array.from({ length: 5 }, (_, x): [number, number, number] => [x * 50, 120, 200 - y * 40]),
    );
    const buf = grid(rows);
    const res = removeFlatBackground(buf);
    expect(res.removed).toBe(false);
    expect(res.backdropLum).toBeNull();
    expect(alphaAt(buf, 0, 0)).toBe(255); // untouched
  });

  it("tolerates a slight border gradient within tolerance", () => {
    const near = (n: number): [number, number, number] => [20 + n, 20 + n, 25 + n];
    const buf = grid([
      [near(0), near(4), near(8), near(4), near(0)],
      [near(4), S, S, S, near(4)],
      [near(8), S, S, S, near(8)],
      [near(4), S, S, S, near(4)],
      [near(0), near(4), near(8), near(4), near(0)],
    ]);
    expect(removeFlatBackground(buf).removed).toBe(true);
    expect(alphaAt(buf, 0, 0)).toBe(0);
    expect(alphaAt(buf, 2, 2)).toBe(255);
  });

  it("peels a matte frame AND the flat field behind it (white-bordered black poster), keeping the art", () => {
    // 20×20: 1px white matte frame, black field inside, a 6×2 gold bar as
    // the "art". The white frame and the black field are separate flat
    // fields — both must go; the art must stay.
    const size = 20;
    const rows: number[][][] = [];
    for (let y = 0; y < size; y++) {
      const row: number[][] = [];
      for (let x = 0; x < size; x++) {
        const isFrame = x === 0 || y === 0 || x === size - 1 || y === size - 1;
        const isArt = y >= 9 && y <= 10 && x >= 7 && x <= 12;
        row.push(isFrame ? W : isArt ? S : K);
      }
      rows.push(row);
    }
    const buf = grid(rows);
    const res = removeFlatBackground(buf);
    expect(res.removed).toBe(true);
    expect(alphaAt(buf, 0, 0)).toBe(0);    // matte frame removed
    expect(alphaAt(buf, 3, 3)).toBe(0);    // black field removed
    expect(alphaAt(buf, 8, 9)).toBe(255);  // art kept
    expect(res.backdropLum!).toBeLessThan(30); // dominant backdrop = the black field
  });

  it("does NOT eat thin line art after removing the primary background", () => {
    // 20×20 white background with a thin dark rectangle outline (the
    // design). After the white is removed the lines form the next
    // frontier, but a fill over them is thin (area ≈ boundary) and must
    // be rolled back.
    const size = 20;
    const rows: number[][][] = [];
    for (let y = 0; y < size; y++) {
      const row: number[][] = [];
      for (let x = 0; x < size; x++) {
        const onOutline =
          (x >= 4 && x <= 15 && (y === 4 || y === 15)) ||
          (y >= 4 && y <= 15 && (x === 4 || x === 15));
        row.push(onOutline ? K : W);
      }
      rows.push(row);
    }
    const buf = grid(rows);
    expect(removeFlatBackground(buf).removed).toBe(true);
    expect(alphaAt(buf, 0, 0)).toBe(0);    // white background removed
    expect(alphaAt(buf, 4, 4)).toBe(255);  // outline (the design) kept
    expect(alphaAt(buf, 10, 10)).toBe(255); // enclosed pocket kept
  });
});

describe("invertForDarkBackdrop", () => {
  it("inverts opaque pixels when the removed backdrop was dark", () => {
    const buf = grid([[W, K], [S, W]]);
    buf.data[7] = 0; // make K transparent (as if removed)
    expect(invertForDarkBackdrop(buf, 4)).toBe(true);
    expect(buf.data.slice(0, 3)).toEqual([7, 7, 7]); // white → near-black
    expect(buf.data.slice(4, 7)).toEqual([...K]);    // transparent pixel untouched
    expect(buf.data.slice(8, 11)).toEqual([255 - S[0], 255 - S[1], 255 - S[2]]);
  });

  it("leaves the design alone when the backdrop was light", () => {
    const buf = grid([[K, W]]);
    expect(invertForDarkBackdrop(buf, 250)).toBe(false);
    expect(buf.data.slice(0, 3)).toEqual([...K]);
  });

  it("does nothing when no backdrop was removed", () => {
    const buf = grid([[K, W]]);
    expect(invertForDarkBackdrop(buf, null)).toBe(false);
    expect(buf.data.slice(0, 3)).toEqual([...K]);
  });
});
