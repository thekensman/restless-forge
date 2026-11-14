/**
 * TattooSafe — Full AR hand geometry tests.
 */

import { describe, it, expect } from "vitest";
import {
  HAND_LENGTH_RATIO, PALM_LAYOUT_LEFT, PALM_POINTS, affineScale, backFacing, computeRolledStrips, fitAffine,
  forearmFace, handCenterCm, handLengthCm, isHandPlacement, limbRadiusCm, nearestPoint, palmAffine, palmFacing,
  palmNormal, pickHand, rollAbout, rolledShadeAt, sideGate, toVideoPx, wrapPi, wristAnchor,
  type HandObservation, type Pt3,
} from "../ar-hand";
import { apply, type Affine } from "../ar-face";
import { computeWrapStrips } from "../camera";
import type { Pt, Side } from "../ar-anchor";

/**
 * The wrist and four knuckles as the hand landmarker reported them (x, y
 * normalized to the photo, z in photo widths) on MediaPipe's own test photos,
 * with what a person can see in each: whose hand it is and which side shows.
 */
const PHOTOS: { name: string; w: number; h: number; side: Side; shows: "back" | "palm"; palm: number[][] }[] = [
  { name: "left_hands.jpg, fingers down", w: 720, h: 382, side: "left", shows: "back",
    palm: [[0.8193, 0.0681, 0], [0.6971, 0.4265, -0.0475], [0.7571, 0.4509, -0.0443], [0.8109, 0.4418, -0.0384], [0.8576, 0.4140, -0.0315]] },
  { name: "left_hands.jpg, fingers up", w: 720, h: 382, side: "left", shows: "back",
    palm: [[0.1740, 0.9302, 0], [0.2997, 0.5669, -0.0517], [0.2400, 0.5465, -0.0467], [0.1863, 0.5601, -0.0374], [0.1388, 0.5910, -0.0268]] },
  { name: "right_hands.jpg, fingers up", w: 720, h: 382, side: "right", shows: "back",
    palm: [[0.8095, 0.9249, 0], [0.6944, 0.5714, -0.0662], [0.7543, 0.5456, -0.0665], [0.8091, 0.5580, -0.0671], [0.8574, 0.5892, -0.0676]] },
  { name: "woman_hands.jpg, her left", w: 640, h: 960, side: "left", shows: "palm",
    palm: [[0.3926, 0.7065, 0], [0.2020, 0.7279, 0.0045], [0.1927, 0.7007, -0.0004], [0.1995, 0.6770, -0.0113], [0.2216, 0.6544, -0.0250]] },
  { name: "woman_hands.jpg, her right", w: 640, h: 960, side: "right", shows: "palm",
    palm: [[0.4664, 0.4000, 0], [0.6254, 0.4301, 0.0139], [0.6213, 0.4039, 0.0119], [0.6042, 0.3799, 0.0052], [0.5779, 0.3554, -0.0040]] },
];
const screenOf = (p: (typeof PHOTOS)[number]): Pt[] => p.palm.map(([x, y]) => ({ x: x * p.w, y: y * p.h }));
/** The five palm points placed at their landmark indices, as palmNormal expects. */
function landmarksOf(p: (typeof PHOTOS)[number]): Pt3[] {
  const lm: Pt3[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  PALM_POINTS.forEach((idx, k) => { lm[idx] = { x: p.palm[k][0], y: p.palm[k][1], z: p.palm[k][2] }; });
  return toVideoPx(lm, p.w, p.h);
}

/** The layout of a hand of the given side, cm, carried to the screen by `m`. */
function palmOnScreen(side: Side, heightCm: number, m: Affine): Pt[] {
  const k = handLengthCm(heightCm);
  return PALM_LAYOUT_LEFT.map((p) => apply(m, { x: (side === "left" ? 1 : -1) * p.x * k, y: p.y * k }));
}
const rotScale = (s: number, deg: number, tx = 0, ty = 0): Affine => {
  const r = (deg * Math.PI) / 180;
  return [s * Math.cos(r), s * Math.sin(r), -s * Math.sin(r), s * Math.cos(r), tx, ty];
};

describe("placement kinds", () => {
  it("the hand model follows the back of the hand and the wrist on its own", () => {
    expect(isHandPlacement("hand")).toBe(true);
    expect(isHandPlacement("wrist")).toBe(true);
    expect(isHandPlacement("inner_forearm")).toBe(false);
  });
  it("the inner forearm goes with the palm, the outer with the back of the hand", () => {
    expect(forearmFace("inner_forearm")).toBe("palm");
    expect(forearmFace("outer_forearm")).toBe("back");
    expect(forearmFace("upper_arm")).toBeNull();
  });
});

describe("sizes from height", () => {
  it("a hand is 10.8% of height", () => {
    expect(handLengthCm(170)).toBeCloseTo(170 * HAND_LENGTH_RATIO, 9);
    expect(handLengthCm(170)).toBeCloseTo(18.36, 2);
  });
  it("a 17 cm wrist at 170 cm has a 2.7 cm radius, and scales with height", () => {
    expect(limbRadiusCm(17, 170)).toBeCloseTo(17 / (2 * Math.PI), 9);
    expect(limbRadiusCm(17, 187)).toBeCloseTo(1.1 * limbRadiusCm(17, 170), 9);
  });
  it("the middle of the back of the hand mirrors between hands", () => {
    const l = handCenterCm("left", 170), r = handCenterCm("right", 170);
    expect(r.x).toBeCloseTo(-l.x, 9);
    expect(r.y).toBeCloseTo(l.y, 9);
    expect(l.y).toBeGreaterThan(0);
  });
});

describe("fitAffine", () => {
  it("recovers a transform exactly from points it moved", () => {
    const m: Affine = [1.5, -0.4, 0.7, 2.1, 30, -12];
    const src = [{ x: 0, y: 0 }, { x: 4, y: 1 }, { x: -2, y: 5 }, { x: 3, y: -3 }, { x: 1, y: 1 }];
    const got = fitAffine(src, src.map((p) => apply(m, p)))!;
    got.forEach((v, i) => expect(v).toBeCloseTo(m[i], 9));
  });
  it("splits the difference when the points disagree", () => {
    // A unit square whose far corner is pulled out: no affine fits, the best one leaves equal residuals.
    const src = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
    const dst = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 2 }];
    const m = fitAffine(src, dst)!;
    const err = src.map((p, i) => Math.hypot(apply(m, p).x - dst[i].x, apply(m, p).y - dst[i].y));
    for (const e of err) expect(e).toBeCloseTo(err[0], 9);
    expect(err[0]).toBeGreaterThan(0.1);
  });
  it("refuses fewer than three points, or points in a line", () => {
    expect(fitAffine([{ x: 0, y: 0 }, { x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
    const line = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    expect(fitAffine(line, line)).toBeNull();
  });
});

describe("affineScale", () => {
  it("gives the scale of a rotation and scaling", () => {
    const s = affineScale(rotScale(3, 37));
    expect(s.max).toBeCloseTo(3, 9);
    expect(s.min).toBeCloseTo(3, 9);
    expect(s.det).toBeCloseTo(9, 9);
  });
  it("separates the true scale from the foreshortened one", () => {
    const s = affineScale([4, 0, 0, 1, 0, 0]);
    expect(s.max).toBeCloseTo(4, 9);
    expect(s.min).toBeCloseTo(1, 9);
  });
  it("has a negative determinant for a mirror image", () => {
    expect(affineScale([-2, 0, 0, 2, 0, 0]).det).toBeLessThan(0);
  });
});

describe("palmAffine", () => {
  it("recovers scale, rotation and position from a hand's five palm points", () => {
    for (const side of ["left", "right"] as const) {
      const truth = rotScale(12, 25, 300, 200);
      const m = palmAffine(palmOnScreen(side, 170, truth), side, 170)!;
      m.forEach((v, i) => expect(v).toBeCloseTo(truth[i], 6));
      expect(affineScale(m).max).toBeCloseTo(12, 6);
      expect(backFacing(m, false)).toBeCloseTo(1, 6);
    }
  });
  it("a taller person's hand is longer, so the same hand on screen means fewer px per cm", () => {
    const screen = palmOnScreen("left", 170, rotScale(10, 0));
    expect(affineScale(palmAffine(screen, "left", 170)!).max).toBeCloseTo(10, 6);
    expect(affineScale(palmAffine(screen, "left", 187)!).max).toBeCloseTo(10 / 1.1, 6);
  });
  it("reads a hand tilted away as foreshortened, keeping its true scale", () => {
    // Turned 60° about its own length: half as wide on screen.
    const m = palmAffine(palmOnScreen("left", 170, [5, 0, 0, 10, 0, 0]), "left", 170)!;
    expect(affineScale(m).max).toBeCloseTo(10, 6);
    expect(backFacing(m, false)).toBeCloseTo(0.5, 6);
  });
  it("sees the palm as the back of the hand flipped over", () => {
    const flipped = palmOnScreen("left", 170, rotScale(10, 0)).map((p) => ({ x: -p.x, y: p.y }));
    const m = palmAffine(flipped, "left", 170)!;
    expect(backFacing(m, false)).toBeCloseTo(-1, 6);
    // In a mirrored preview everything is flipped once already, so this is the back.
    expect(backFacing(m, true)).toBeCloseTo(1, 6);
  });
  it("needs all five points and a height", () => {
    expect(palmAffine(palmOnScreen("left", 170, rotScale(10, 0)).slice(0, 4), "left", 170)).toBeNull();
    expect(palmAffine(palmOnScreen("left", 170, rotScale(10, 0)), "left", 0)).toBeNull();
  });
});

describe("real hands (MediaPipe's test photos)", () => {
  it("tells the back of the hand from the palm, on either hand", () => {
    for (const p of PHOTOS) {
      const m = palmAffine(screenOf(p), p.side, 170)!;
      const facing = backFacing(m, false);
      if (p.shows === "back") expect(facing, p.name).toBeGreaterThan(0.8);
      else expect(facing, p.name).toBeLessThan(-0.3);
    }
  });
  it("the palm's direction agrees: out of the picture for a palm, into it for the back of a hand", () => {
    for (const p of PHOTOS) {
      const facing = palmFacing(palmNormal(landmarksOf(p), p.side)!);
      if (p.shows === "palm") expect(facing, p.name).toBeGreaterThan(0.9);
      else expect(facing, p.name).toBeLessThan(-0.9);
    }
  });
  it("fits the flat hands to within a millimetre or two", () => {
    for (const p of PHOTOS.filter((q) => q.shows === "back")) {
      const screen = screenOf(p);
      const m = palmAffine(screen, p.side, 170)!;
      const pxPerCm = affineScale(m).max;
      const k = handLengthCm(170);
      PALM_LAYOUT_LEFT.forEach((q, i) => {
        const at = apply(m, { x: (p.side === "left" ? 1 : -1) * q.x * k, y: q.y * k });
        expect(Math.hypot(at.x - screen[i].x, at.y - screen[i].y) / pxPerCm, `${p.name} point ${i}`).toBeLessThan(0.25);
      });
    }
  });
});

describe("palmNormal and rollAbout", () => {
  // A right hand, fingers up, palm to the camera: the index knuckle is on the picture's right.
  const rightPalm = (): Pt3[] => {
    const lm: Pt3[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    lm[0] = { x: 100, y: 200, z: 0 };
    lm[5] = { x: 130, y: 100, z: 0 };
    lm[17] = { x: 60, y: 120, z: 0 };
    return lm;
  };
  it("points out of a right palm and the other way for a left hand in the same pose", () => {
    expect(palmNormal(rightPalm(), "right")!.z).toBeCloseTo(-1, 9);
    expect(palmNormal(rightPalm(), "left")!.z).toBeCloseTo(1, 9);
  });
  it("is null for a hand with no area", () => {
    const lm: Pt3[] = Array.from({ length: 21 }, () => ({ x: 5, y: 5, z: 0 }));
    expect(palmNormal(lm, "right")).toBeNull();
  });
  it("measures the turn about the limb from the side facing the camera", () => {
    // A limb running straight down the screen (angle 0): across is +x.
    expect(rollAbout({ x: 0, y: 0, z: -1 }, 0)).toBeCloseTo(0, 9);
    expect(rollAbout({ x: 1, y: 0, z: 0 }, 0)).toBeCloseTo(Math.PI / 2, 9);
    expect(rollAbout({ x: -1, y: 0, z: 0 }, 0)).toBeCloseTo(-Math.PI / 2, 9);
    expect(Math.abs(rollAbout({ x: 0, y: 0, z: 1 }, 0))).toBeCloseTo(Math.PI, 9);
    // A limb lying along the screen's x (angle -π/2): across is -y.
    expect(rollAbout({ x: 0, y: -1, z: 0 }, -Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9);
  });
  it("wrapPi brings any angle into (-π, π]", () => {
    expect(wrapPi(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(wrapPi(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2, 9);
    expect(wrapPi(0.3)).toBeCloseTo(0.3, 9);
  });
});

describe("sideGate", () => {
  it("shows the design while its side faces the camera, and a little past edge on", () => {
    expect(sideGate(1)).toBe(1);
    expect(sideGate(0)).toBe(1);
  });
  it("fades it out as the other side comes round, then hides it", () => {
    expect(sideGate(-0.175)).toBeCloseTo(0.5, 9);
    expect(sideGate(-0.35)).toBe(0);
    expect(sideGate(-1)).toBe(0);
  });
});

describe("wristAnchor", () => {
  it("sits on the arm's line just above the wrist, running toward the hand", () => {
    // Fingers pointing up the screen, 10 px per cm, wrist at (300, 400).
    const palm = palmOnScreen("left", 170, [-10, 0, 0, -10, 300, 400]);
    const m = palmAffine(palm, "left", 170)!;
    const a = wristAnchor(palm, m, "left", 170)!;
    expect(a.pxPerCm).toBeCloseTo(10, 6);
    expect(a.foreshorten).toBeCloseTo(1, 6);
    expect(a.x).toBeCloseTo(300, 6);
    // 1.8% of 170 cm = 3.06 cm up the arm, which is down the screen here.
    expect(a.y).toBeCloseTo(400 + 30.6, 6);
    // The design's "down" (-sin, cos of the angle) points at the fingers: up the screen.
    expect(-Math.sin(a.angle)).toBeCloseTo(0, 6);
    expect(Math.cos(a.angle)).toBeCloseTo(-1, 6);
    expect(a.side).toBe("left");
  });
  it("shortens along the arm when the hand leans toward the camera", () => {
    const palm = palmOnScreen("right", 170, [10, 0, 0, 5, 0, 0]);
    const a = wristAnchor(palm, palmAffine(palm, "right", 170)!, "right", 170)!;
    expect(a.pxPerCm).toBeCloseTo(10, 6);
    expect(a.foreshorten).toBeCloseTo(0.5, 6);
    expect(a.y).toBeCloseTo(-0.018 * 170 * 10 * 0.5, 6);
  });
});

describe("pickHand", () => {
  const hand = (side: Side, score: number): HandObservation => ({ side, score, lm: [] });
  it("takes only the side the visitor chose", () => {
    const hands = [hand("left", 0.99), hand("right", 0.6)];
    expect(pickHand(hands, "right")).toBe(1);
    expect(pickHand([hand("left", 0.99)], "right")).toBe(-1);
  });
  it("on auto takes the hand the tracker is surest of", () => {
    expect(pickHand([hand("left", 0.7), hand("right", 0.9)], "auto")).toBe(1);
    expect(pickHand([], "auto")).toBe(-1);
  });
  it("on auto stays with the side it was following while that hand is in view", () => {
    const hands = [hand("left", 0.7), hand("right", 0.9)];
    expect(pickHand(hands, "auto", "left")).toBe(0);
    expect(pickHand([hand("right", 0.9)], "auto", "left")).toBe(0);
  });
});

describe("nearestPoint", () => {
  it("finds the closest point within reach", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 100, y: 100 }];
    expect(nearestPoint(pts, { x: 8, y: 1 }, 20)).toBe(1);
    expect(nearestPoint(pts, { x: 50, y: 50 }, 20)).toBe(-1);
    expect(nearestPoint([], { x: 0, y: 0 }, 20)).toBe(-1);
  });
});

describe("computeRolledStrips", () => {
  const R = 50;
  it("facing the camera, matches the plain wrap of the same curvature", () => {
    const span = 1.2, dispW = span * R;
    const [piece] = computeRolledStrips(400, dispW, R, 0, 64);
    const { projW } = computeWrapStrips(400, dispW, 64, span);
    expect(piece.x1 - piece.x0).toBeCloseTo(projW, 6);
    expect(piece.x0).toBeCloseTo(-piece.x1, 6);
  });
  it("covers the whole design in contiguous strips while it is all in view", () => {
    const pieces = computeRolledStrips(400, 40, R, 0.3, 64);
    expect(pieces).toHaveLength(1);
    const st = pieces[0].strips;
    expect(st[0].u0).toBeCloseTo(0, 6);
    expect(st[st.length - 1].u1).toBeCloseTo(400, 6);
    for (let i = 1; i < st.length; i++) {
      expect(st[i].x0).toBeCloseTo(st[i - 1].x1, 9);
      expect(st[i].u0).toBeCloseTo(st[i - 1].u1, 9);
      expect(st[i].u1).toBeGreaterThan(st[i].u0);
    }
  });
  it("moves toward the edge as the limb turns: its middle is at R·sin(turn)", () => {
    for (const turn of [-0.8, -0.2, 0.5, 1.0]) {
      const [piece] = computeRolledStrips(400, 10, R, turn, 64);
      expect((piece.x0 + piece.x1) / 2).toBeCloseTo(R * Math.sin(turn), 0);
    }
  });
  it("is cut off at the edge: at a quarter turn only the near half of the design shows", () => {
    const [piece] = computeRolledStrips(400, 40, R, Math.PI / 2, 64);
    expect(piece.x1).toBeCloseTo(R, 6);
    expect(piece.strips[0].u0).toBeCloseTo(0, 6);
    expect(piece.strips[piece.strips.length - 1].u1).toBeCloseTo(200, 6);
  });
  it("shows nothing once the design is round the back", () => {
    expect(computeRolledStrips(400, 40, R, Math.PI, 64)).toEqual([]);
    expect(computeRolledStrips(400, 40, R, -2.5, 64)).toEqual([]);
  });
  it("shows a band that goes most of the way round at both edges at once", () => {
    // 300° of the limb, centred on the far side: 60° is in view at each edge.
    const dispW = (300 * Math.PI / 180) * R;
    const pieces = computeRolledStrips(400, dispW, R, Math.PI, 64);
    expect(pieces).toHaveLength(2);
    const xs = pieces.map((p) => [p.x0, p.x1]).sort((a, b) => a[0] - b[0]);
    expect(xs[0][0]).toBeCloseTo(-R, 6);
    expect(xs[1][1]).toBeCloseTo(R, 6);
    expect(xs[0][1]).toBeLessThan(0);
    expect(xs[1][0]).toBeGreaterThan(0);
  });
  it("treats turns a whole circle apart alike", () => {
    const a = computeRolledStrips(400, 40, R, 0.4, 32), b = computeRolledStrips(400, 40, R, 0.4 + 2 * Math.PI, 32);
    expect(b[0].x0).toBeCloseTo(a[0].x0, 9);
    expect(b[0].x1).toBeCloseTo(a[0].x1, 9);
  });
  it("returns nothing for sizes that make no sense", () => {
    expect(computeRolledStrips(0, 40, R, 0, 64)).toEqual([]);
    expect(computeRolledStrips(400, 40, 0, 0, 64)).toEqual([]);
  });
});

describe("rolledShadeAt", () => {
  it("is full facing the camera and falls to nothing at the edge", () => {
    expect(rolledShadeAt(0, 50)).toBe(1);
    expect(rolledShadeAt(50, 50)).toBe(0);
    expect(rolledShadeAt(-50, 50)).toBe(0);
    expect(rolledShadeAt(25, 50)).toBeCloseTo(Math.cos(Math.asin(0.5)), 9);
  });
});
