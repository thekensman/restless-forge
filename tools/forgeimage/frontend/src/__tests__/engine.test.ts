import { describe, it, expect } from "vitest";
import {
  resizeDims,
  clampCrop,
  centeredAspectCrop,
  coverCropForPreset,
  targetSizeQuality,
  fmtBytes,
  SOCIAL_PRESETS,
  ASPECT_PRESETS,
  FORMATS,
} from "../engine";

describe("resizeDims", () => {
  const src = { w: 1600, h: 1200 };
  it("percent scales both axes", () => {
    expect(resizeDims(src, { percent: 50 })).toEqual({ w: 800, h: 600 });
  });
  it("width-only keeps aspect", () => {
    expect(resizeDims(src, { width: 800 })).toEqual({ w: 800, h: 600 });
  });
  it("height-only keeps aspect", () => {
    expect(resizeDims(src, { height: 300 })).toEqual({ w: 400, h: 300 });
  });
  it("width+height unlocked distorts", () => {
    expect(resizeDims(src, { width: 500, height: 500, lock: false })).toEqual({ w: 500, h: 500 });
  });
  it("width+height locked follows width", () => {
    expect(resizeDims(src, { width: 400, height: 999, lock: true })).toEqual({ w: 400, h: 300 });
  });
  it("never collapses below 1px", () => {
    const d = resizeDims({ w: 10, h: 10 }, { percent: 0.5 });
    expect(d.w).toBeGreaterThanOrEqual(1);
    expect(d.h).toBeGreaterThanOrEqual(1);
  });
});

describe("clampCrop", () => {
  const img = { w: 1000, h: 800 };
  it("passes through a valid rect", () => {
    expect(clampCrop({ x: 100, y: 100, w: 300, h: 200 }, img)).toEqual({ x: 100, y: 100, w: 300, h: 200 });
  });
  it("clamps overflow position", () => {
    const r = clampCrop({ x: 900, y: 700, w: 300, h: 200 }, img);
    expect(r.x + r.w).toBeLessThanOrEqual(img.w);
    expect(r.y + r.h).toBeLessThanOrEqual(img.h);
  });
  it("clamps oversize rect to image", () => {
    expect(clampCrop({ x: 0, y: 0, w: 5000, h: 5000 }, img)).toEqual({ x: 0, y: 0, w: 1000, h: 800 });
  });
  it("clamps negative origin", () => {
    const r = clampCrop({ x: -50, y: -50, w: 100, h: 100 }, img);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });
});

describe("centeredAspectCrop / coverCropForPreset", () => {
  it("16:9 crop of a 4:3 image is width-limited and centered", () => {
    const r = centeredAspectCrop({ w: 1600, h: 1200 }, 16, 9);
    expect(r.w).toBe(1600);
    expect(r.h).toBe(900);
    expect(r.y).toBe(150);
  });
  it("9:16 crop of a landscape image is height-limited", () => {
    const r = centeredAspectCrop({ w: 1600, h: 1200 }, 9, 16);
    expect(r.h).toBe(1200);
    expect(r.w).toBe(675);
  });
  it("preset cover crop matches preset aspect within a pixel", () => {
    for (const p of SOCIAL_PRESETS) {
      const r = coverCropForPreset({ w: 4000, h: 3000 }, p);
      expect(Math.abs(r.w / r.h - p.w / p.h)).toBeLessThan(0.01);
    }
  });
});

describe("preset tables", () => {
  it("social presets have the canonical dimensions", () => {
    const og = SOCIAL_PRESETS.find((p) => p.id === "og-image")!;
    expect([og.w, og.h]).toEqual([1200, 630]);
    const story = SOCIAL_PRESETS.find((p) => p.id === "ig-story")!;
    expect([story.w, story.h]).toEqual([1080, 1920]);
    expect(new Set(SOCIAL_PRESETS.map((p) => p.id)).size).toBe(SOCIAL_PRESETS.length);
  });
  it("format and aspect ids are unique", () => {
    expect(new Set(FORMATS.map((f) => f.id)).size).toBe(FORMATS.length);
    expect(new Set(ASPECT_PRESETS.map((a) => a.id)).size).toBe(ASPECT_PRESETS.length);
  });
});

describe("targetSizeQuality", () => {
  // Fake encoder: size grows linearly with quality, 100 KB at q=1.
  const sizeAt = async (q: number): Promise<number> => Math.round(q * 100_000);

  it("finds a quality under the target", async () => {
    const res = await targetSizeQuality(sizeAt, 50_000);
    expect(res).not.toBeNull();
    expect(res!.bytes).toBeLessThanOrEqual(50_000);
    expect(res!.quality).toBeGreaterThan(0.4);
  });
  it("returns null when even minimum quality is too big", async () => {
    const res = await targetSizeQuality(async () => 999_999, 50_000);
    expect(res).toBeNull();
  });
  it("caps encode count", async () => {
    let calls = 0;
    await targetSizeQuality(async (q) => {
      calls++;
      return q * 100_000;
    }, 60_000, 5);
    expect(calls).toBeLessThanOrEqual(6); // 1 probe + 5 iterations
  });
});

describe("fmtBytes", () => {
  it("picks units", () => {
    expect(fmtBytes(500)).toBe("500 B");
    expect(fmtBytes(2048)).toBe("2.0 KB");
    expect(fmtBytes(3 * 1024 * 1024)).toBe("3.00 MB");
  });
});
