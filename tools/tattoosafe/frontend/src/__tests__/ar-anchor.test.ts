/**
 * TattooSafe — Full AR placement geometry tests.
 */

import { describe, it, expect } from "vitest";
import {
  LM, SEGMENT_RATIO, AR_PLACEMENTS, isTrackable, bodyScale, pickSide, computeAnchor,
  videoToCanvas, canvasToVideo, maskRunWidth, wrapSpanFor, isLimb, MASK_CLASS,
  OneEuro, unwrapAngle, type Landmark,
} from "../ar-anchor";
import { BODY_PARTS } from "../engine";

/**
 * A person `heightCm` tall standing straight, arms down, drawn at `pxPerCm`,
 * shoulders at y=100. The person's left is on the canvas left (mirror view).
 */
function standing(heightCm = 170, pxPerCm = 2, visibility = 0.9): Landmark[] {
  const u = heightCm * pxPerCm;
  const pts: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const put = (i: number, x: number, y: number): void => { pts[i] = { x, y, visibility }; };
  const shoulderY = 100, hipY = shoulderY + SEGMENT_RATIO.torso * u;
  const elbowY = shoulderY + SEGMENT_RATIO.upperArm * u, wristY = elbowY + SEGMENT_RATIO.forearm * u;
  const kneeY = hipY + SEGMENT_RATIO.thigh * u, ankleY = kneeY + SEGMENT_RATIO.shank * u;
  put(LM.NOSE, 300, 40);
  put(LM.L_SHOULDER, 260, shoulderY); put(LM.R_SHOULDER, 340, shoulderY);
  put(LM.L_ELBOW, 260, elbowY); put(LM.R_ELBOW, 340, elbowY);
  put(LM.L_WRIST, 260, wristY); put(LM.R_WRIST, 340, wristY);
  put(LM.L_HIP, 280, hipY); put(LM.R_HIP, 320, hipY);
  put(LM.L_KNEE, 280, kneeY); put(LM.R_KNEE, 320, kneeY);
  put(LM.L_ANKLE, 280, ankleY); put(LM.R_ANKLE, 320, ankleY);
  return pts;
}

describe("AR_PLACEMENTS", () => {
  it("covers the eight placements and names real body parts", () => {
    expect(Object.keys(AR_PLACEMENTS).sort()).toEqual(
      ["calf", "chest", "inner_forearm", "outer_forearm", "shoulder", "sternum", "thigh", "upper_arm"]);
    const ids = new Set(BODY_PARTS.map((b) => b.id));
    for (const id of Object.keys(AR_PLACEMENTS)) expect(ids.has(id), id).toBe(true);
  });
  it("leaves the hard-to-film placements manual", () => {
    for (const id of ["upper_back", "lower_back", "back_of_neck", "behind_ear", "wrist", "hand", "ribs", "ankle"]) {
      expect(isTrackable(id), id).toBe(false);
    }
  });
});

describe("bodyScale", () => {
  it("recovers px per cm from a person of the entered height", () => {
    expect(bodyScale(standing(170, 2), 170)).toBeCloseTo(2, 6);
    expect(bodyScale(standing(185, 3.5), 185)).toBeCloseTo(3.5, 6);
  });
  it("is not pulled down by a limb pointing at the camera", () => {
    const pts = standing(170, 2);
    // Left forearm seen end-on: wrist almost on top of the elbow.
    pts[LM.L_WRIST] = { ...pts[LM.L_ELBOW], y: pts[LM.L_ELBOW].y + 5, visibility: 0.9 };
    expect(bodyScale(pts, 170)).toBeCloseTo(2, 6);
  });
  it("needs at least one fully visible segment", () => {
    expect(bodyScale(standing(170, 2, 0.2), 170)).toBeNull();
    expect(bodyScale(standing(), 0)).toBeNull();
  });
});

describe("computeAnchor", () => {
  it("centers a forearm design between elbow and wrist, upright when the arm hangs down", () => {
    const pts = standing(170, 2);
    const a = computeAnchor("inner_forearm", pts, 170, "left")!;
    expect(a.x).toBeCloseTo(260);
    expect(a.y).toBeCloseTo((pts[LM.L_ELBOW].y + pts[LM.L_WRIST].y) / 2);
    expect(a.angle).toBeCloseTo(0);
    expect(a.pxPerCm).toBeCloseTo(2);
    expect(a.foreshorten).toBeCloseTo(1);
    expect(a.side).toBe("left");
  });
  it("turns with the limb: an arm held out sideways runs the design sideways", () => {
    const pts = standing(170, 2);
    const e = pts[LM.R_ELBOW];
    pts[LM.R_WRIST] = { x: e.x + SEGMENT_RATIO.forearm * 340, y: e.y, visibility: 0.9 };
    const a = computeAnchor("outer_forearm", pts, 170, "right")!;
    expect(a.angle).toBeCloseTo(-Math.PI / 2);
  });
  it("reports foreshortening when the limb points at the camera", () => {
    const pts = standing(170, 2);
    const k = pts[LM.L_KNEE], h = pts[LM.L_HIP];
    pts[LM.L_KNEE] = { ...k, y: h.y + (k.y - h.y) / 2 };
    expect(computeAnchor("thigh", pts, 170, "left")!.foreshorten).toBeCloseTo(0.5, 6);
  });
  it("puts the chest and sternum on the torso midline", () => {
    const pts = standing(170, 2);
    const chest = computeAnchor("chest", pts, 170, null)!;
    const sternum = computeAnchor("sternum", pts, 170, null)!;
    expect(chest.x).toBeCloseTo(300);
    expect(sternum.y).toBeGreaterThan(chest.y);
    expect(chest.side).toBeNull();
  });
  it("puts the shoulder design near the top of the upper arm", () => {
    const pts = standing(170, 2);
    const s = computeAnchor("shoulder", pts, 170, "right")!;
    const u = computeAnchor("upper_arm", pts, 170, "right")!;
    expect(s.y).toBeLessThan(u.y);
  });
  it("gives up when a needed joint is out of view", () => {
    const pts = standing(170, 2);
    pts[LM.L_WRIST].visibility = 0.1;
    expect(computeAnchor("inner_forearm", pts, 170, "left")).toBeNull();
    expect(computeAnchor("inner_forearm", pts, 170, "right")).not.toBeNull();
  });
  it("returns null for a placement it doesn't track", () => {
    expect(computeAnchor("upper_back", standing(), 170, "left")).toBeNull();
  });
});

describe("pickSide", () => {
  const spec = AR_PLACEMENTS.thigh;
  it("keeps a fixed choice", () => {
    expect(pickSide(spec, standing(), "right")).toBe("right");
  });
  it("auto picks the better-seen side and doesn't flip on small changes", () => {
    const pts = standing();
    pts[LM.R_KNEE].visibility = 0.6;
    expect(pickSide(spec, pts, "auto")).toBe("left");
    pts[LM.R_KNEE].visibility = 0.95;
    expect(pickSide(spec, pts, "auto", "left")).toBe("left");
    pts[LM.L_KNEE].visibility = 0.55;
    expect(pickSide(spec, pts, "auto", "left")).toBe("right");
  });
  it("has no side for torso placements", () => {
    expect(pickSide(AR_PLACEMENTS.chest, standing(), "auto")).toBeNull();
  });
});

describe("video ↔ canvas mapping", () => {
  const crop = { sx: 160, sy: 0, sw: 960, sh: 720 }; // 1280×720 cropped to 4:3
  it("maps through the crop", () => {
    expect(videoToCanvas(0.5, 0.5, 1280, 720, crop, 640, 480, false)).toEqual({ x: 320, y: 240 });
    expect(videoToCanvas(160 / 1280, 0, 1280, 720, crop, 640, 480, false)).toEqual({ x: 0, y: 0 });
  });
  it("mirrors for a front camera", () => {
    expect(videoToCanvas(160 / 1280, 0, 1280, 720, crop, 640, 480, true).x).toBe(640);
  });
  it("round-trips", () => {
    for (const mirror of [false, true]) {
      const p = videoToCanvas(0.3, 0.7, 1280, 720, crop, 640, 480, mirror);
      const back = canvasToVideo(p.x, p.y, 1280, 720, crop, 640, 480, mirror);
      expect(back.x).toBeCloseTo(0.3, 9);
      expect(back.y).toBeCloseTo(0.7, 9);
    }
  });
});

describe("maskRunWidth", () => {
  // 40×20 mask: a vertical limb of skin 10 px wide (x 15–24), clothes below y 15.
  const mw = 40, mh = 20;
  const mask = new Uint8Array(mw * mh);
  for (let y = 0; y < mh; y++) {
    for (let x = 15; x < 25; x++) mask[y * mw + x] = y < 15 ? MASK_CLASS.BODY_SKIN : MASK_CLASS.CLOTHES;
  }
  it("measures the limb across", () => {
    expect(maskRunWidth(mask, mw, mh, 20, 5, 1, 0, isLimb)).toBe(10);
    expect(maskRunWidth(mask, mw, mh, 20, 17, 1, 0, isLimb)).toBe(10);
  });
  it("counts clothes as limb but not as skin", () => {
    const skin = (c: number) => c === MASK_CLASS.BODY_SKIN;
    expect(maskRunWidth(mask, mw, mh, 20, 17, 1, 0, skin)).toBeNull();
  });
  it("returns null off the body or when the limb runs off the mask", () => {
    expect(maskRunWidth(mask, mw, mh, 5, 5, 1, 0, isLimb)).toBeNull();
    expect(maskRunWidth(mask, mw, mh, 20, 5, 0, 1, isLimb)).toBeNull();
  });
});

describe("wrapSpanFor", () => {
  it("a design as wide as the limb covers two radians of it", () => {
    expect(wrapSpanFor(50, 50)).toBeCloseTo(2);
  });
  it("caps at the visible half turn and handles nothing to measure", () => {
    expect(wrapSpanFor(500, 50)).toBeCloseTo(Math.PI);
    expect(wrapSpanFor(50, 0)).toBe(0);
  });
});

describe("OneEuro", () => {
  it("passes a still value through", () => {
    const f = new OneEuro();
    for (let t = 0; t < 1000; t += 33) expect(f.filter(42, t)).toBeCloseTo(42);
  });
  it("damps jitter around a still value", () => {
    const f = new OneEuro();
    let maxDev = 0;
    for (let i = 0; i < 120; i++) {
      const out = f.filter(100 + (i % 2 ? 4 : -4), i * 33);
      if (i > 30) maxDev = Math.max(maxDev, Math.abs(out - 100));
    }
    expect(maxDev).toBeLessThan(2);
  });
  it("catches up with a move", () => {
    const f = new OneEuro();
    let out = 0;
    for (let i = 0; i < 60; i++) out = f.filter(i < 10 ? 0 : 200, i * 33);
    expect(out).toBeGreaterThan(195);
  });
});

describe("unwrapAngle", () => {
  it("takes the short way round", () => {
    expect(unwrapAngle(3, -3)).toBeCloseTo(-3 + 2 * Math.PI);
    expect(unwrapAngle(-3, 3)).toBeCloseTo(3 - 2 * Math.PI);
    expect(unwrapAngle(1, 1.5)).toBeCloseTo(1.5);
  });
});
