/**
 * TattooSafe — camera overlay geometry tests.
 * Pure helpers only; the getUserMedia wiring is exercised manually.
 */

import { describe, it, expect } from "vitest";
import {
  clampCenter, pinchScale, wheelScale, drawSize, hitTest, coverCrop,
  MIN_SCALE, MAX_SCALE,
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
  // canvas 600 wide → overlay 200×100 for a 200×100 image
  it("hits the center and misses far away", () => {
    expect(hitTest(300, 200, state, 200, 100, 600, 0)).toBe(true);
    expect(hitTest(10, 10, state, 200, 100, 600, 0)).toBe(false);
  });
  it("respects the unrotated bounding box edges", () => {
    expect(hitTest(300 + 99, 200, state, 200, 100, 600, 0)).toBe(true);
    expect(hitTest(300 + 101, 200, state, 200, 100, 600, 0)).toBe(false);
  });
  it("accounts for rotation", () => {
    // Rotated 90°: the wide axis is now vertical.
    expect(hitTest(300, 200 + 99, state, 200, 100, 600, 90)).toBe(true);
    expect(hitTest(300 + 99, 200, state, 200, 100, 600, 90)).toBe(false);
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
