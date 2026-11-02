/**
 * TattooSafe — Full AR face mapping geometry tests (on the real canonical mesh).
 */

import { describe, it, expect } from "vitest";
import {
  affineFromTriangles, compose, apply, findTriangle, cmPerUv, designToUv, facingSign, faceAxes,
  uvOf, CHEEK_LANDMARK, type FaceMesh,
} from "../ar-face";
import { FACE_TRIANGLES, FACE_UV, FACE_XYZ } from "../face-mesh";

const mesh: FaceMesh = { tri: FACE_TRIANGLES, uv: FACE_UV, xyz: FACE_XYZ };
const close = (a: { x: number; y: number }, b: { x: number; y: number }, d = 6) => {
  expect(a.x).toBeCloseTo(b.x, d);
  expect(a.y).toBeCloseTo(b.y, d);
};
/** The mesh seen face-on: UV scaled to a 400 px face, optionally mirrored. */
const frontal = (mirror = false) => Array.from({ length: 468 }, (_, i) => {
  const p = uvOf(mesh, i);
  return { x: mirror ? 500 - p.x * 400 : 100 + p.x * 400, y: 50 + p.y * 400 };
});

describe("face mesh data", () => {
  it("has 898 triangles over 468 landmarks", () => {
    expect(FACE_TRIANGLES.length).toBe(898 * 3);
    expect(FACE_UV.length).toBe(468 * 2);
    expect(Math.max(...FACE_TRIANGLES)).toBe(467);
  });
  it("puts the forehead above the chin and the person's left cheek at higher u", () => {
    expect(uvOf(mesh, 10).y).toBeLessThan(uvOf(mesh, 152).y);
    expect(uvOf(mesh, CHEEK_LANDMARK.left).x).toBeGreaterThan(uvOf(mesh, CHEEK_LANDMARK.right).x);
  });
});

describe("affineFromTriangles / compose", () => {
  const s = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
  const d = [{ x: 10, y: 20 }, { x: 14, y: 21 }, { x: 9, y: 26 }];
  it("carries each corner onto its target", () => {
    const m = affineFromTriangles(s[0], s[1], s[2], d[0], d[1], d[2])!;
    for (let i = 0; i < 3; i++) close(apply(m, s[i]), d[i]);
  });
  it("is null for a degenerate triangle", () => {
    expect(affineFromTriangles(s[0], s[0], s[2], d[0], d[1], d[2])).toBeNull();
  });
  it("composes in the right order", () => {
    const shift: [number, number, number, number, number, number] = [1, 0, 0, 1, 5, 0];
    const double: [number, number, number, number, number, number] = [2, 0, 0, 2, 0, 0];
    close(apply(compose(shift, double), { x: 1, y: 1 }), { x: 7, y: 2 });
  });
});

describe("findTriangle / cmPerUv", () => {
  it("finds the triangle under the cheek and none off the face", () => {
    const c = uvOf(mesh, CHEEK_LANDMARK.left);
    expect(findTriangle(mesh, c.x + 0.001, c.y + 0.001)).toBeGreaterThanOrEqual(0);
    expect(findTriangle(mesh, 0.001, 0.001)).toBe(-1);
  });
  it("matches the canonical face's real distances near the eyes", () => {
    // Outer eye corners 33 and 263: cm apart on the mesh vs UV apart.
    const cm = Math.hypot(FACE_XYZ[3 * 263] - FACE_XYZ[3 * 33], FACE_XYZ[3 * 263 + 1] - FACE_XYZ[3 * 33 + 1]);
    const du = uvOf(mesh, 263).x - uvOf(mesh, 33).x;
    // Measured on the nose bridge, which also slopes toward the camera, so the
    // local scale runs above the straight eye-to-eye average.
    const local = cmPerUv(mesh, 0.5, uvOf(mesh, 33).y + 0.02)!;
    expect(local.u).toBeGreaterThan((cm / du) * 0.7);
    expect(local.u).toBeLessThan((cm / du) * 1.4);
  });
  it("is null off the mesh", () => {
    expect(cmPerUv(mesh, 0.001, 0.001)).toBeNull();
  });
});

describe("designToUv", () => {
  const scale = { u: 20, v: 20 };
  const center = { x: 0.6, y: 0.5 };
  it("puts the design's middle on the center and its width in cm", () => {
    const m = designToUv(200, 100, center, 4, 2, 0, scale, false);
    close(apply(m, { x: 100, y: 50 }), center);
    expect(apply(m, { x: 200, y: 50 }).x - apply(m, { x: 0, y: 50 }).x).toBeCloseTo(4 / 20);
  });
  it("mirrors left to right when flipped", () => {
    const m = designToUv(200, 100, center, 4, 2, 0, scale, true);
    expect(apply(m, { x: 0, y: 50 }).x).toBeGreaterThan(apply(m, { x: 200, y: 50 }).x);
  });
  it("turns with the rotation", () => {
    const m = designToUv(200, 100, center, 4, 2, 90, scale, false);
    const right = apply(m, { x: 200, y: 50 });
    expect(right.x).toBeCloseTo(center.x);
    expect(right.y).toBeGreaterThan(center.y);
  });
});

describe("facingSign", () => {
  it("flips with a mirrored view", () => {
    expect(facingSign(mesh, frontal(false))).toBe(-facingSign(mesh, frontal(true)));
  });
});

describe("faceAxes", () => {
  it("turns screen motion into UV motion", () => {
    const ax = faceAxes(mesh, frontal(false))!;
    expect(ax.su).toBeCloseTo(400, 3);
    expect(ax.eu.x).toBeCloseTo(1);
    const mirrored = faceAxes(mesh, frontal(true))!;
    expect(mirrored.eu.x).toBeCloseTo(-1);
  });
});
