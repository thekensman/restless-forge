/**
 * TattooSafe — Full AR face mapping geometry.
 *
 * Pure functions, no MediaPipe import. The face placement maps the design
 * onto MediaPipe's face mesh instead of anchoring it between two joints: the
 * design is laid out in the mesh's texture space (UV), and every mesh
 * triangle carries its piece of the design to where that triangle is on the
 * live face, with one affine transform per triangle. So the design bends over
 * the cheekbone, nose and brow, and squashes as the head turns.
 *
 * Size comes from the canonical mesh, which is an average adult face in
 * centimetres: the local cm-per-UV scale where the design sits turns the
 * tattoo's cm size into texture space.
 */
import type { Pt } from "./ar-anchor";

/** The canonical mesh (face-mesh.ts): triangles, UV per landmark, cm per landmark. */
export interface FaceMesh {
  tri: ArrayLike<number>;
  uv: ArrayLike<number>;
  xyz: ArrayLike<number>;
}

/** Canvas transform [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Affine = [number, number, number, number, number, number];

/** Landmarks at the middle of each cheek, the design's starting point. */
export const CHEEK_LANDMARK = { left: 425, right: 205 } as const;

export const uvOf = (mesh: FaceMesh, i: number): Pt => ({ x: mesh.uv[2 * i], y: mesh.uv[2 * i + 1] });

/** The affine transform that carries triangle s0 s1 s2 onto d0 d1 d2. */
export function affineFromTriangles(s0: Pt, s1: Pt, s2: Pt, d0: Pt, d1: Pt, d2: Pt): Affine | null {
  const sx1 = s1.x - s0.x, sy1 = s1.y - s0.y, sx2 = s2.x - s0.x, sy2 = s2.y - s0.y;
  const det = sx1 * sy2 - sx2 * sy1;
  if (Math.abs(det) < 1e-12) return null;
  const dx1 = d1.x - d0.x, dy1 = d1.y - d0.y, dx2 = d2.x - d0.x, dy2 = d2.y - d0.y;
  const i11 = sy2 / det, i12 = -sx2 / det, i21 = -sy1 / det, i22 = sx1 / det;
  const a = dx1 * i11 + dx2 * i21, c = dx1 * i12 + dx2 * i22;
  const b = dy1 * i11 + dy2 * i21, d = dy1 * i12 + dy2 * i22;
  return [a, b, c, d, d0.x - a * s0.x - c * s0.y, d0.y - b * s0.x - d * s0.y];
}

/** m1 after m2: the transform that applies m2, then m1. */
export function compose(m1: Affine, m2: Affine): Affine {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2, b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2, b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1,
  ];
}

export const apply = (m: Affine, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

/** The mesh triangle (index) whose UV triangle contains (u, v), or -1. */
export function findTriangle(mesh: FaceMesh, u: number, v: number): number {
  for (let t = 0; t < mesh.tri.length / 3; t++) {
    const a = uvOf(mesh, mesh.tri[3 * t]), b = uvOf(mesh, mesh.tri[3 * t + 1]), c = uvOf(mesh, mesh.tri[3 * t + 2]);
    const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (det === 0) continue;
    const w0 = ((b.y - c.y) * (u - c.x) + (c.x - b.x) * (v - c.y)) / det;
    const w1 = ((c.y - a.y) * (u - c.x) + (a.x - c.x) * (v - c.y)) / det;
    if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) return t;
  }
  return -1;
}

/**
 * Centimetres per UV unit along u and along v at (u, v), on the canonical
 * face: the texture space stretches toward the sides of the face, so the
 * scale is taken where the design sits. Null off the mesh.
 */
export function cmPerUv(mesh: FaceMesh, u: number, v: number): { u: number; v: number } | null {
  const t = findTriangle(mesh, u, v);
  if (t < 0) return null;
  const [i0, i1, i2] = [mesh.tri[3 * t], mesh.tri[3 * t + 1], mesh.tri[3 * t + 2]];
  const q0 = uvOf(mesh, i0), q1 = uvOf(mesh, i1), q2 = uvOf(mesh, i2);
  const du1 = q1.x - q0.x, dv1 = q1.y - q0.y, du2 = q2.x - q0.x, dv2 = q2.y - q0.y;
  const det = du1 * dv2 - du2 * dv1;
  if (det === 0) return null;
  // P(u, v) = P0 + Ju·Δu + Jv·Δv over this triangle; solve from its two edges.
  let ju = 0, jv = 0;
  for (let k = 0; k < 3; k++) {
    const e1 = mesh.xyz[3 * i1 + k] - mesh.xyz[3 * i0 + k];
    const e2 = mesh.xyz[3 * i2 + k] - mesh.xyz[3 * i0 + k];
    const a = (e1 * dv2 - e2 * dv1) / det;
    const b = (e2 * du1 - e1 * du2) / det;
    ju += a * a;
    jv += b * b;
  }
  return { u: Math.sqrt(ju), v: Math.sqrt(jv) };
}

/**
 * Design pixels → UV: the design (imgW × imgH px) centered on `center`,
 * wCm × hCm on the face, turned by rotationDeg on the skin, and mirrored left
 * to right when `flip` is set (a mirrored camera view would otherwise show
 * it reversed).
 */
export function designToUv(
  imgW: number, imgH: number, center: Pt, wCm: number, hCm: number,
  rotationDeg: number, scale: { u: number; v: number }, flip: boolean
): Affine {
  const r = (rotationDeg * Math.PI) / 180;
  const toCm: Affine = [(flip ? -wCm : wCm) / imgW, 0, 0, hCm / imgH, (flip ? wCm : -wCm) / 2, -hCm / 2];
  const rot: Affine = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
  const toUv: Affine = [1 / scale.u, 0, 0, 1 / scale.v, center.x, center.y];
  return compose(toUv, compose(rot, toCm));
}

const cross = (a: Pt, b: Pt, c: Pt): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/**
 * Which way round front-facing triangles wind on screen: the sign most
 * triangles share. A mirrored view flips it, so it is measured, not assumed;
 * triangles winding the other way face away and are skipped.
 */
export function facingSign(mesh: FaceMesh, screen: Pt[]): 1 | -1 {
  let pos = 0, neg = 0;
  for (let t = 0; t < mesh.tri.length / 3; t++) {
    const s = cross(screen[mesh.tri[3 * t]], screen[mesh.tri[3 * t + 1]], screen[mesh.tri[3 * t + 2]]);
    if (s > 0) pos++; else if (s < 0) neg++;
  }
  return pos >= neg ? 1 : -1;
}

export const windingOf = (a: Pt, b: Pt, c: Pt): number => Math.sign(cross(a, b, c));

/**
 * Screen directions of +u and +v and how many px one UV unit spans along
 * each, from the face's edges (234↔454 across, 10↔152 down). Turns a drag on
 * screen into a move in texture space.
 */
export function faceAxes(mesh: FaceMesh, screen: Pt[]): { eu: Pt; ev: Pt; su: number; sv: number } | null {
  const across = { x: screen[454].x - screen[234].x, y: screen[454].y - screen[234].y };
  const down = { x: screen[152].x - screen[10].x, y: screen[152].y - screen[10].y };
  const la = Math.hypot(across.x, across.y), ld = Math.hypot(down.x, down.y);
  const spanU = uvOf(mesh, 454).x - uvOf(mesh, 234).x, spanV = uvOf(mesh, 152).y - uvOf(mesh, 10).y;
  if (!la || !ld || !spanU || !spanV) return null;
  return { eu: { x: across.x / la, y: across.y / la }, ev: { x: down.x / ld, y: down.y / ld }, su: la / spanU, sv: ld / spanV };
}
