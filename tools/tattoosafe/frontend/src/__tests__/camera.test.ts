/**
 * TattooSafe — camera overlay geometry tests.
 * Pure helpers only; the getUserMedia wiring is exercised manually.
 */

import { describe, it, expect } from "vitest";
import {
  clampCenter, pinchScale, wheelScale, drawSize, hitTest, coverCrop,
  computeWrapStrips, wrapProjectedWidth, MIN_SCALE, MAX_SCALE,
  overlaySize, frameWidthFromCard, scaleSize, cameraHint, CARD_W_CM, CARD_H_CM,
} from "../camera";

describe("clampCenter", () => {
  it("passes through in-bounds points", () => {
    expect(clampCenter(100, 50, 640, 480)).toEqual({ x: 100, y: 50 });
  });
  it("clamps to canvas edges", () => {
    expect(clampCenter(-20, 900, 640, 480)).toEqual({ x: 0, y: 480 });
  });
});

describe("pinchScale", () => {
  it("doubles scale when finger distance doubles", () => {
    expect(pinchScale(1, 100, 200)).toBe(2);
  });
  it("halves scale when finger distance halves", () => {
    expect(pinchScale(1, 200, 100)).toBe(0.5);
  });
  it("clamps to MIN_SCALE and MAX_SCALE", () => {
    expect(pinchScale(1, 1000, 1)).toBe(MIN_SCALE);
    expect(pinchScale(1, 1, 1000)).toBe(MAX_SCALE);
  });
  it("ignores a zero start distance", () => {
    expect(pinchScale(1.5, 0, 100)).toBe(1.5);
  });
});

describe("wheelScale", () => {
  it("zooms in on negative deltaY and out on positive", () => {
    expect(wheelScale(1, -100)).toBeCloseTo(1.1);
    expect(wheelScale(1.1, 100)).toBeCloseTo(1);
  });
  it("clamps at the bounds", () => {
    expect(wheelScale(MIN_SCALE, 100)).toBe(MIN_SCALE);
    expect(wheelScale(MAX_SCALE, -100)).toBe(MAX_SCALE);
  });
});

describe("drawSize", () => {
  it("bases width on a third of the canvas and preserves aspect", () => {
    const { w, h } = drawSize(200, 100, 600, 1);
    expect(w).toBe(200);
    expect(h).toBe(100);
  });
  it("scales linearly", () => {
    expect(drawSize(200, 100, 600, 2).w).toBe(400);
  });
  it("degrades safely for a zero-size image", () => {
    const { w, h } = drawSize(0, 0, 600, 1);
    expect(w).toBe(200);
    expect(h).toBe(200);
  });
});

describe("hitTest", () => {
  const state = { x: 300, y: 200, scale: 1 };
  // overlay drawn 200×100 px at (300, 200)
  it("hits the center and misses far away", () => {
    expect(hitTest(300, 200, state, 200, 100, 0)).toBe(true);
    expect(hitTest(10, 10, state, 200, 100, 0)).toBe(false);
  });
  it("respects the unrotated bounding box edges", () => {
    expect(hitTest(300 + 99, 200, state, 200, 100, 0)).toBe(true);
    expect(hitTest(300 + 101, 200, state, 200, 100, 0)).toBe(false);
  });
  it("accounts for rotation", () => {
    // Rotated 90°: the wide axis is now vertical.
    expect(hitTest(300, 200 + 99, state, 200, 100, 90)).toBe(true);
    expect(hitTest(300 + 99, 200, state, 200, 100, 90)).toBe(false);
  });
  it("uses the size the design is drawn at (regression: a large tattoo's edge was not grabbable)", () => {
    // 30 cm on a 600 px canvas showing 50 cm: drawn 360 px wide.
    const { w, h } = overlaySize(600, 50, 30, 45, 300, 450, 1);
    expect(w).toBeCloseTo(360);
    expect(hitTest(300 + 150, 200, state, w, h, 0)).toBe(true);
    expect(hitTest(300 + 190, 200, state, w, h, 0)).toBe(false);
  });
});

describe("overlaySize", () => {
  it("maps the tattoo's cm onto the frame's real width", () => {
    expect(overlaySize(600, 50, 10, 5, 100, 100, 1)).toEqual({ w: 120, h: 60 });
  });
  it("applies the free zoom", () => {
    expect(overlaySize(600, 50, 10, 5, 100, 100, 2).w).toBe(240);
  });
  it("falls back to the image's proportions without a height", () => {
    expect(overlaySize(600, 50, 10, 0, 200, 100, 1).h).toBe(60);
  });
  it("falls back to drawSize without a real-world size", () => {
    expect(overlaySize(600, 50, 0, 0, 200, 100, 1)).toEqual(drawSize(200, 100, 600, 1));
  });
});

describe("card calibration", () => {
  it("derives the frame's width from the matched card outline", () => {
    // Card outline 120 px wide on a 600 px canvas → frame is 5 cards wide.
    expect(frameWidthFromCard(600, 120)).toBeCloseTo(5 * CARD_W_CM, 9);
  });
  it("after calibrating, a tattoo the card's width is drawn exactly over the card", () => {
    const frame = frameWidthFromCard(640, 173);
    expect(overlaySize(640, frame, CARD_W_CM, CARD_H_CM, 1, 1, 1).w).toBeCloseTo(173, 9);
  });
  it("rejects an empty outline", () => {
    expect(frameWidthFromCard(600, 0)).toBeNaN();
  });
});

describe("scaleSize", () => {
  it("scales both sides by the factor", () => {
    const s = scaleSize(6, 10, 1.5, 0.5, 100);
    expect(s.w).toBeCloseTo(9);
    expect(s.h).toBeCloseTo(15);
  });
  it("stops at the limits without changing proportions", () => {
    const big = scaleSize(20, 40, 10, 0.5, 100);
    expect(big.h).toBeCloseTo(100);
    expect(big.w).toBeCloseTo(50);
    const small = scaleSize(2, 1, 0.01, 0.5, 100);
    expect(small.h).toBeCloseTo(0.5);
    expect(small.w).toBeCloseTo(1);
  });
});

describe("cameraHint", () => {
  it("calls an uncalibrated size approximate", () => {
    const h = cameraHint({ calibrating: false, calibrated: false, sizeLabel: "6 × 10 cm on Thigh" });
    expect(h).toContain("6 × 10 cm on Thigh");
    expect(h).toContain("approximate");
    expect(h).not.toContain("true size");
  });
  it("claims true size only once calibrated", () => {
    expect(cameraHint({ calibrating: false, calibrated: true, sizeLabel: "" })).toContain("true size");
  });
  it("explains the card step while calibrating", () => {
    expect(cameraHint({ calibrating: true, calibrated: false, sizeLabel: "x" })).toContain("card");
  });
});

describe("coverCrop", () => {
  it("is identity when aspect ratios match", () => {
    expect(coverCrop(1280, 960, 640, 480)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 960 });
  });
  it("crops width when the source is wider", () => {
    const c = coverCrop(1920, 1080, 640, 480); // 16:9 → 4:3
    expect(c.sh).toBe(1080);
    expect(c.sw).toBe(1440);
    expect(c.sx).toBe(240);
  });
  it("crops height when the source is taller", () => {
    const c = coverCrop(1080, 1920, 640, 480);
    expect(c.sw).toBe(1080);
    expect(c.sh).toBe(810);
    expect(c.sy).toBe(555);
  });
});

describe("computeWrapStrips", () => {

  it("projected width is 2/π of the flat display width", () => {
    const { projW } = computeWrapStrips(400, 300, 32);
    expect(projW).toBeCloseTo((300 * 2) / Math.PI, 6);
  });

  it("destination strips are contiguous (seam-free) and span the projection", () => {
    const { projW, strips } = computeWrapStrips(400, 300, 32);
    for (let i = 1; i < strips.length; i++) {
      expect(strips[i].x0).toBeCloseTo(strips[i - 1].x1, 9);
    }
    expect(strips[0].x0).toBeCloseTo(-projW / 2, 9);
    expect(strips[strips.length - 1].x1).toBeCloseTo(projW / 2, 9);
  });

  it("source ranges are contiguous and cover the whole design", () => {
    const { strips } = computeWrapStrips(400, 300, 32);
    for (let i = 1; i < strips.length; i++) {
      expect(strips[i].u0).toBeCloseTo(strips[i - 1].u1, 6);
    }
    expect(strips[0].u0).toBeCloseTo(0, 6);
    expect(strips[strips.length - 1].u1).toBeCloseTo(400, 6);
  });

  it("edges compress: edge strips consume more source per dest pixel than center", () => {
    const { strips } = computeWrapStrips(400, 300, 32);
    const density = (s: { u0: number; u1: number; x0: number; x1: number }) =>
      (s.u1 - s.u0) / (s.x1 - s.x0);
    const edge = density(strips[0]);
    const center = density(strips[16]);
    expect(edge).toBeGreaterThan(center * 2);
    // Center of a half-cylinder viewed straight on is very nearly 1:1
    // (srcW 400 over dispW 300 gives a base texel ratio of 400/300).
    expect(center).toBeCloseTo(400 / 300, 1);
  });

  it("projected width matches wrapProjectedWidth (used for hit-testing)", () => {
    for (const span of [0.5, 2, Math.PI]) {
      expect(computeWrapStrips(400, 300, 16, span).projW).toBeCloseTo(wrapProjectedWidth(300, span), 9);
    }
  });

  it("source mapping is monotonic", () => {
    const { strips } = computeWrapStrips(400, 300, 48);
    for (const s of strips) expect(s.u1).toBeGreaterThan(s.u0);
  });
});

import { wrapShadeAt } from "../camera";

describe("computeWrapStrips with angular span", () => {
  it("default span π matches the half-cylinder projection", () => {
    const { projW } = computeWrapStrips(400, 300, 32);
    expect(projW).toBeCloseTo((300 * 2) / Math.PI, 6);
  });
  it("small span ≈ flat: projection approaches the flat width", () => {
    const { projW } = computeWrapStrips(400, 300, 32, 0.2);
    expect(projW).toBeGreaterThan(297); // sin(0.1)/0.1 ≈ 0.9983
    expect(projW).toBeLessThanOrEqual(300);
  });
  it("span shrinks projection monotonically", () => {
    const p1 = computeWrapStrips(400, 300, 32, 1.0).projW;
    const p2 = computeWrapStrips(400, 300, 32, 2.0).projW;
    const p3 = computeWrapStrips(400, 300, 32, Math.PI).projW;
    expect(p1).toBeGreaterThan(p2);
    expect(p2).toBeGreaterThan(p3);
  });
  it("strips stay contiguous and cover the source at any span", () => {
    for (const span of [0.3, 1.2, Math.PI]) {
      const { projW, strips } = computeWrapStrips(500, 280, 24, span);
      for (let i = 1; i < strips.length; i++) {
        expect(strips[i].x0).toBeCloseTo(strips[i - 1].x1, 9);
        expect(strips[i].u0).toBeCloseTo(strips[i - 1].u1, 6);
      }
      expect(strips[0].x0).toBeCloseTo(-projW / 2, 9);
      expect(strips[0].u0).toBeCloseTo(0, 6);
      expect(strips[strips.length - 1].u1).toBeCloseTo(500, 6);
    }
  });
});

describe("wrapShadeAt", () => {
  it("flat span barely shades", () => {
    expect(wrapShadeAt(0, 0.1)).toBeGreaterThan(0.99);
    expect(wrapShadeAt(1, 0.1)).toBeGreaterThan(0.99);
  });
  it("half wrap shades edges down to the floor, center stays bright", () => {
    expect(wrapShadeAt(0.5, Math.PI)).toBeCloseTo(1, 5);
    expect(wrapShadeAt(0, Math.PI)).toBeCloseTo(0.25, 2);
  });
});
