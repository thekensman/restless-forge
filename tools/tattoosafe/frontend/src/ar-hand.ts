/**
 * TattooSafe — Full AR hand geometry.
 *
 * Pure functions, no MediaPipe import. The hand landmarker gives 21 points
 * per hand and works on a close-up, with no face in view, which the body
 * model cannot do. Three things are built on it:
 *
 *   - Back of the hand. The wrist and the four knuckles are a rigid patch,
 *     so one affine transform fitted to those five points carries a design
 *     laid out in centimetres on the back of the hand to the screen: it
 *     turns, tilts and foreshortens with the hand. Which way round the fit
 *     comes out says whether the back or the palm is showing.
 *   - Wrist. The design sits on a cylinder just above the wrist joint. The
 *     direction the palm faces is the wrist's turn about the arm, so the
 *     design travels round the wrist as it turns and goes out of sight on
 *     the far side.
 *   - Inner and outer forearm. The body model cannot tell which side of the
 *     forearm is showing; the palm can. The design shows on its own side only.
 *
 * Size comes from the height the visitor entered: a hand is a known share of
 * it. The tracker's own metric output ("world landmarks") is not used. Run on
 * MediaPipe's test photos it gave a 13 cm hand in one and a 20 cm hand in the
 * next, and an edge-on palm for a hand lying flat (docs/tattoosafe-full-ar.md).
 */
import type { Anchor, Pt, Side } from "./ar-anchor";
import type { Affine } from "./ar-face";

export interface Pt3 extends Pt { z: number }

/** One hand as the tracker reports it. */
export interface HandObservation {
  /** The person's own left or right. */
  side: Side;
  /** How sure the tracker is of the side, 0–1. */
  score: number;
  /** 21 landmarks normalized to the video frame; z in units of the frame's width, smaller is nearer. */
  lm: Pt3[];
}

/** MediaPipe hand landmark indices used here. */
export const HAND_LM = { WRIST: 0, INDEX_MCP: 5, MIDDLE_MCP: 9, RING_MCP: 13, PINKY_MCP: 17 } as const;
/** The rigid part of the hand: the wrist and the four knuckles. */
export const PALM_POINTS = [HAND_LM.WRIST, HAND_LM.INDEX_MCP, HAND_LM.MIDDLE_MCP, HAND_LM.RING_MCP, HAND_LM.PINKY_MCP] as const;

/** Hand length, wrist to middle fingertip, as a share of standing height (Drillis and Contini). */
export const HAND_LENGTH_RATIO = 0.108;
/** The height the catalogue's limb circumferences are typical for, cm. */
export const REFERENCE_HEIGHT_CM = 170;
/** How far up the arm from the wrist joint a wrist design sits, as a share of height (3 cm at 170 cm). */
export const WRIST_OFFSET_RATIO = 0.018;

/**
 * Where the five palm points sit on the back of a left hand, in hand lengths,
 * in the design's own frame: +x is the design's right, +y runs from the wrist
 * toward the fingers (the design's top faces the wrist, as on every limb).
 * Measured from the tracker's landmarks on the four flat, camera-facing hands
 * in MediaPipe's left_hands.jpg and right_hands.jpg, which agree to 0.01.
 * A right hand is the mirror image: x negated.
 */
export const PALM_LAYOUT_LEFT: readonly Pt[] = [
  { x: 0, y: 0 }, { x: -0.130, y: 0.457 }, { x: 0, y: 0.447 }, { x: 0.107, y: 0.402 }, { x: 0.194, y: 0.342 },
];
/** The middle of the back of a left hand, in the same frame and units. */
const HAND_CENTER_LEFT: Pt = { x: 0.03, y: 0.25 };

/** Placements the hand landmarker follows on its own (no body model, no face needed). */
export const isHandPlacement = (id: string): boolean => id === "hand" || id === "wrist";

/** The side of the hand that shows when this forearm placement does; null for other placements. */
export function forearmFace(id: string): "palm" | "back" | null {
  return id === "inner_forearm" ? "palm" : id === "outer_forearm" ? "back" : null;
}

export const handLengthCm = (heightCm: number): number => HAND_LENGTH_RATIO * heightCm;

/** The middle of the back of the hand, cm, in the design's frame. */
export function handCenterCm(side: Side, heightCm: number): Pt {
  const k = handLengthCm(heightCm);
  return { x: (side === "left" ? 1 : -1) * HAND_CENTER_LEFT.x * k, y: HAND_CENTER_LEFT.y * k };
}

/** Radius of a limb, cm, from the catalogue's circumference, scaled to the visitor's height. */
export function limbRadiusCm(circumferenceCm: number, heightCm: number): number {
  return (circumferenceCm * (heightCm / REFERENCE_HEIGHT_CM)) / (2 * Math.PI);
}

// ─── The palm as a rigid patch ───────────────────────────────

/** Least-squares affine transform taking each src point to its dst point (three or more, not in a line). */
export function fitAffine(src: readonly Pt[], dst: readonly Pt[]): Affine | null {
  const n = Math.min(src.length, dst.length);
  if (n < 3) return null;
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0;
  let xu = 0, yu = 0, u = 0, xv = 0, yv = 0, v = 0;
  for (let i = 0; i < n; i++) {
    const s = src[i], d = dst[i];
    sxx += s.x * s.x; sxy += s.x * s.y; syy += s.y * s.y; sx += s.x; sy += s.y;
    xu += s.x * d.x; yu += s.y * d.x; u += d.x;
    xv += s.x * d.y; yv += s.y * d.y; v += d.y;
  }
  // Normal equations [sxx sxy sx; sxy syy sy; sx sy n] · [a c e]ᵀ = [xu yu u]ᵀ, by Cramer's rule.
  const det = sxx * (syy * n - sy * sy) - sxy * (sxy * n - sy * sx) + sx * (sxy * sy - syy * sx);
  if (Math.abs(det) < 1e-9) return null;
  const solve = (p: number, q: number, r: number): [number, number, number] => [
    (p * (syy * n - sy * sy) - sxy * (q * n - sy * r) + sx * (q * sy - syy * r)) / det,
    (sxx * (q * n - sy * r) - p * (sxy * n - sy * sx) + sx * (sxy * r - q * sx)) / det,
    (sxx * (syy * r - q * sy) - sxy * (sxy * r - q * sx) + p * (sxy * sy - syy * sx)) / det,
  ];
  const [a, c, e] = solve(xu, yu, u);
  const [b, d, f] = solve(xv, yv, v);
  return [a, b, c, d, e, f];
}

/**
 * The transform from centimetres on the back of the hand (the design's
 * frame) to the screen, from the five palm points as seen (in PALM_POINTS
 * order, canvas px).
 */
export function palmAffine(palm: readonly Pt[], side: Side, heightCm: number): Affine | null {
  if (palm.length < PALM_LAYOUT_LEFT.length || !(heightCm > 0)) return null;
  const k = handLengthCm(heightCm), sx = side === "left" ? k : -k;
  return fitAffine(PALM_LAYOUT_LEFT.map((p) => ({ x: p.x * sx, y: p.y * k })), palm);
}

/**
 * How much a transform stretches: its largest and smallest scale, and its
 * determinant. A flat patch seen at an angle keeps its true scale along the
 * axis it turns about (max) and shrinks across it (min).
 */
export function affineScale(m: Affine): { max: number; min: number; det: number } {
  const [a, b, c, d] = m;
  const q = Math.hypot((a + d) / 2, (b - c) / 2), r = Math.hypot((a - d) / 2, (b + c) / 2);
  return { max: q + r, min: Math.abs(q - r), det: a * d - b * c };
}

/**
 * How squarely the back of the hand faces the camera, from the palm
 * transform: 1 square on, 0 edge on, negative when the palm is showing. The
 * layout is the back of the hand seen the right way round, so a fit that
 * comes out flipped is the palm; a mirrored view flips everything once more.
 */
export function backFacing(m: Affine, mirror: boolean): number {
  const s = affineScale(m);
  if (!(s.max > 0)) return 0;
  return ((mirror ? -1 : 1) * s.det) / (s.max * s.max);
}

/** Landmarks normalized to the video frame → video px, z on the same scale as x. */
export function toVideoPx(lm: readonly Pt3[], vw: number, vh: number): Pt3[] {
  return lm.map((p) => ({ x: p.x * vw, y: p.y * vh, z: p.z * vw }));
}

/**
 * Unit vector pointing out of the palm, in the frame the landmarks are in
 * (x right, y down, z away from the camera). Wrist → index knuckle crossed
 * with wrist → little-finger knuckle points out of a right palm and into a
 * left one; checked against photos where the side and the facing are known.
 */
export function palmNormal(lm: readonly Pt3[], side: Side): Pt3 | null {
  const o = lm[HAND_LM.WRIST], p = lm[HAND_LM.INDEX_MCP], q = lm[HAND_LM.PINKY_MCP];
  if (!o || !p || !q) return null;
  const ax = p.x - o.x, ay = p.y - o.y, az = p.z - o.z;
  const bx = q.x - o.x, by = q.y - o.y, bz = q.z - o.z;
  const s = side === "right" ? 1 : -1;
  const n = { x: s * (ay * bz - az * by), y: s * (az * bx - ax * bz), z: s * (ax * by - ay * bx) };
  const len = Math.hypot(n.x, n.y, n.z);
  return len > 1e-9 ? { x: n.x / len, y: n.y / len, z: n.z / len } : null;
}

/** How squarely the palm faces the camera: 1 square on, 0 edge on, -1 the back of the hand. */
export const palmFacing = (normal: Pt3): number => -normal.z;

/**
 * The turn of the palm about a limb drawn at `angle` (an Anchor's angle),
 * radians: 0 when the palm faces the camera, positive when it has turned
 * toward the limb's across direction (cos angle, sin angle). `normal` must be
 * in the canvas's orientation (x negated for a mirrored view).
 */
export function rollAbout(normal: Pt3, angle: number): number {
  return Math.atan2(normal.x * Math.cos(angle) + normal.y * Math.sin(angle), -normal.z);
}

/** An angle brought into (-π, π]. */
export function wrapPi(a: number): number {
  const t = a % (2 * Math.PI);
  return t > Math.PI ? t - 2 * Math.PI : t <= -Math.PI ? t + 2 * Math.PI : t;
}

/**
 * Visibility of a design on one side of the forearm, 0–1, from how squarely
 * that side of the hand faces the camera (-1…1). The middle of the forearm
 * turns less than the hand does, so the design holds until the hand is past
 * edge on and then fades over a quarter turn of it.
 */
export function sideGate(facing: number): number {
  return Math.min(Math.max((facing + 0.35) / 0.35, 0), 1);
}

/**
 * Where a wrist design goes: on the arm's own line, a little above the wrist
 * joint, running down the arm toward the hand. Scale is the palm transform's
 * true scale; the arm is taken to lean toward the camera as much as the hand
 * does. Null when the hand is edge on along its length.
 */
export function wristAnchor(palm: readonly Pt[], m: Affine, side: Side, heightCm: number): Anchor | null {
  const wrist = palm[0], knuckle = palm[2];
  const dx = knuckle.x - wrist.x, dy = knuckle.y - wrist.y, len = Math.hypot(dx, dy);
  const { max } = affineScale(m);
  if (!(len > 0) || !(max > 0)) return null;
  // m's second column is where one centimetre toward the fingers lands on screen.
  const foreshorten = Math.min(Math.max(Math.hypot(m[2], m[3]) / max, 0.35), 1);
  const back = WRIST_OFFSET_RATIO * heightCm * max * foreshorten;
  return {
    x: wrist.x - (dx / len) * back,
    y: wrist.y - (dy / len) * back,
    angle: Math.atan2(dy, dx) - Math.PI / 2,
    pxPerCm: max,
    foreshorten,
    side,
  };
}

// ─── Choosing a hand ─────────────────────────────────────────

/**
 * Which of the hands in view to follow, as an index, or -1. A fixed choice
 * takes that side only; "auto" takes the hand the tracker is surest of and
 * stays with the side it had, so the design doesn't hop between hands.
 */
export function pickHand(hands: readonly HandObservation[], choice: Side | "auto", prev?: Side | null): number {
  let best = -1;
  const better = (i: number): boolean => best < 0 || hands[i].score > hands[best].score;
  if (choice !== "auto") {
    hands.forEach((h, i) => { if (h.side === choice && better(i)) best = i; });
    return best;
  }
  if (prev) {
    hands.forEach((h, i) => { if (h.side === prev && better(i)) best = i; });
    if (best >= 0) return best;
  }
  hands.forEach((_, i) => { if (better(i)) best = i; });
  return best;
}

/** The index of the point nearest `target` and within `maxDist` of it, or -1. */
export function nearestPoint(points: readonly Pt[], target: Pt, maxDist: number): number {
  let best = -1, bestD = maxDist;
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - target.x, p.y - target.y);
    if (d <= bestD) { best = i; bestD = d; }
  });
  return best;
}

// ─── A design on a turning cylinder ──────────────────────────

export interface RolledStrip {
  /** Source x range, in design pixels. */
  u0: number;
  u1: number;
  /** Destination x range, px from the cylinder's axis. */
  x0: number;
  x1: number;
}
export interface RolledPiece { x0: number; x1: number; strips: RolledStrip[] }

/**
 * A design `dispW` px wide (measured round the surface) on a cylinder of
 * `radius` px seen side on, its middle at angle `center` round the cylinder:
 * 0 faces the camera, π/2 is the edge on the +x side, π is the far side. Only
 * the camera's half is visible, so the result is the part of the design in
 * view cut into vertical strips: none when it is all behind, two pieces when
 * a wide design shows round both edges at once.
 */
export function computeRolledStrips(
  srcW: number, dispW: number, radius: number, center: number, strips: number
): RolledPiece[] {
  if (!(srcW > 0 && dispW > 0 && radius > 0 && strips > 0)) return [];
  const half = Math.min(dispW / (2 * radius), Math.PI);
  const c0 = wrapPi(center);
  const out: RolledPiece[] = [];
  for (const turn of [-1, 0, 1]) {
    const c = c0 + turn * 2 * Math.PI;
    const a = Math.max(c - half, -Math.PI / 2), b = Math.min(c + half, Math.PI / 2);
    if (b - a < 1e-3) continue;
    const x0 = radius * Math.sin(a), x1 = radius * Math.sin(b);
    const n = Math.max(1, Math.round((strips * (x1 - x0)) / (2 * radius)));
    const uAt = (x: number): number => {
      const th = Math.asin(Math.max(-1, Math.min(1, x / radius)));
      return Math.min(Math.max(((th - (c - half)) / (2 * half)) * srcW, 0), srcW);
    };
    const piece: RolledPiece = { x0, x1, strips: [] };
    for (let i = 0; i < n; i++) {
      const xa = x0 + ((x1 - x0) * i) / n, xb = x0 + ((x1 - x0) * (i + 1)) / n;
      piece.strips.push({ u0: uAt(xa), u1: uAt(xb), x0: xa, x1: xb });
    }
    out.push(piece);
  }
  return out;
}

/** Shade of a cylinder's surface x px from its axis: 1 facing the camera, 0 at the edge. */
export function rolledShadeAt(x: number, radius: number): number {
  const t = radius > 0 ? Math.min(Math.abs(x) / radius, 1) : 1;
  return Math.sqrt(1 - t * t);
}
