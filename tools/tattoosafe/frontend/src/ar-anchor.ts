/**
 * TattooSafe — Full AR placement geometry.
 *
 * Pure functions, no MediaPipe import: the runtime (ar-tracking.ts) hands
 * over landmarks and a segmentation mask, and this module decides where the
 * design goes. MediaPipe's pose landmarker gives 33 body landmarks per frame;
 * each supported placement anchors to a few of them: the forearm to the
 * elbow and wrist, the thigh to the hip and knee, the chest to the shoulders
 * and hips. The anchor carries the design's center on the canvas, the angle
 * that runs it down the limb, and how many canvas pixels make a centimetre
 * there.
 *
 * Scale comes from the height the visitor entered. Each visible body segment
 * has a typical length as a share of height, so its length on screen gives a
 * px-per-cm estimate. A segment pointing toward the camera looks shorter,
 * which only ever lowers its estimate, so the scale leans on the longest
 * ones, and how short the anchored limb looks becomes its foreshortening.
 */

/** MediaPipe pose landmark indices (the person's own left and right). */
export const LM = {
  NOSE: 0,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
} as const;

/**
 * Segment lengths as a share of standing height (Drillis and Contini, as
 * tabulated in Winter, Biomechanics and Motor Control of Human Movement).
 * Torso is shoulder joint to hip joint: shoulder height 0.818 less hip
 * height 0.530.
 */
export const SEGMENT_RATIO = {
  upperArm: 0.186,
  forearm: 0.146,
  thigh: 0.245,
  shank: 0.246,
  torso: 0.288,
} as const;

/** A landmark below this visibility is treated as not seen. */
export const MIN_VISIBILITY = 0.5;

export type Side = "left" | "right";
export interface Pt { x: number; y: number }
export interface Landmark extends Pt { visibility: number }
type Pair = readonly [left: number, right: number];

interface LimbSpec {
  kind: "limb";
  /** Joint nearer the body, then the far one. The design's top faces `from`. */
  from: Pair;
  to: Pair;
  /** Where along from→to the design's center sits, 0–1. */
  t: number;
  ratio: number;
}
interface TorsoSpec {
  kind: "torso";
  /** Where down the shoulder-to-hip midline the center sits, 0–1. */
  t: number;
}
export type AnchorSpec = (LimbSpec | TorsoSpec) & {
  /** What must be in view, for the hint: "Step back until … are in view." */
  needs: string;
};

const SHOULDER: Pair = [LM.L_SHOULDER, LM.R_SHOULDER];
const ELBOW: Pair = [LM.L_ELBOW, LM.R_ELBOW];
const WRIST: Pair = [LM.L_WRIST, LM.R_WRIST];
const HIP: Pair = [LM.L_HIP, LM.R_HIP];
const KNEE: Pair = [LM.L_KNEE, LM.R_KNEE];
const ANKLE: Pair = [LM.L_ANKLE, LM.R_ANKLE];

/** The placements Full AR can follow. The rest stay manual. */
export const AR_PLACEMENTS: Record<string, AnchorSpec> = {
  inner_forearm: { kind: "limb", from: ELBOW, to: WRIST, t: 0.5, ratio: SEGMENT_RATIO.forearm, needs: "your face, shoulders and the whole arm" },
  outer_forearm: { kind: "limb", from: ELBOW, to: WRIST, t: 0.5, ratio: SEGMENT_RATIO.forearm, needs: "your face, shoulders and the whole arm" },
  upper_arm: { kind: "limb", from: SHOULDER, to: ELBOW, t: 0.5, ratio: SEGMENT_RATIO.upperArm, needs: "your face, shoulders and elbows" },
  shoulder: { kind: "limb", from: SHOULDER, to: ELBOW, t: 0.12, ratio: SEGMENT_RATIO.upperArm, needs: "your face, shoulders and elbows" },
  chest: { kind: "torso", t: 0.22, needs: "your face, shoulders and hips" },
  sternum: { kind: "torso", t: 0.42, needs: "your face, shoulders and hips" },
  thigh: { kind: "limb", from: HIP, to: KNEE, t: 0.45, ratio: SEGMENT_RATIO.thigh, needs: "your face, hips and knees" },
  calf: { kind: "limb", from: KNEE, to: ANKLE, t: 0.4, ratio: SEGMENT_RATIO.shank, needs: "your face and both legs down to the ankles" },
};

export function isTrackable(placementId: string): boolean {
  return placementId in AR_PLACEMENTS;
}

export interface Anchor {
  /** Design center, canvas px. */
  x: number;
  y: number;
  /** Rotation, radians, that turns an upright design to run down the limb. */
  angle: number;
  /** Canvas px per real cm at the body. */
  pxPerCm: number;
  /** Share of the limb's length facing the camera (1 = side-on), 0.35–1. */
  foreshorten: number;
  side: Side | null;
}

const seen = (p: Landmark | undefined): p is Landmark => !!p && p.visibility >= MIN_VISIBILITY;
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
/** Angle that turns the design's +y (its "down") onto the direction a→b. */
const downAngle = (a: Pt, b: Pt): number => Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;

/**
 * Canvas px per cm, from every body segment in view. Foreshortening only
 * shortens a segment, so the estimates skew low: take one from the top of
 * the range (the largest of up to four, the third largest of nine) rather
 * than the median. Null when no segment is fully visible.
 */
export function bodyScale(pts: Landmark[], heightCm: number): number | null {
  if (!(heightCm > 0)) return null;
  const est: number[] = [];
  const seg = (a: number, b: number, ratio: number): void => {
    if (seen(pts[a]) && seen(pts[b])) est.push(dist(pts[a], pts[b]) / (ratio * heightCm));
  };
  for (const s of [0, 1] as const) {
    seg(SHOULDER[s], ELBOW[s], SEGMENT_RATIO.upperArm);
    seg(ELBOW[s], WRIST[s], SEGMENT_RATIO.forearm);
    seg(HIP[s], KNEE[s], SEGMENT_RATIO.thigh);
    seg(KNEE[s], ANKLE[s], SEGMENT_RATIO.shank);
  }
  if ([...SHOULDER, ...HIP].every((i) => seen(pts[i]))) {
    const torso = dist(mid(pts[LM.L_SHOULDER], pts[LM.R_SHOULDER]), mid(pts[LM.L_HIP], pts[LM.R_HIP]));
    est.push(torso / (SEGMENT_RATIO.torso * heightCm));
  }
  if (!est.length) return null;
  est.sort((a, b) => b - a);
  return est[Math.floor((est.length - 1) / 4)];
}

/**
 * Which side to track. A fixed choice is kept; "auto" takes the side whose
 * joints are more visible, and sticks with the previous pick unless the
 * other side is clearly better, so the design doesn't hop between limbs.
 */
export function pickSide(spec: AnchorSpec, pts: Landmark[], choice: Side | "auto", prev?: Side | null): Side | null {
  if (spec.kind === "torso") return null;
  if (choice !== "auto") return choice;
  const score = (s: 0 | 1): number => Math.min(pts[spec.from[s]]?.visibility ?? 0, pts[spec.to[s]]?.visibility ?? 0);
  const left = score(0), right = score(1);
  if (prev === "left" && left >= right - 0.2) return "left";
  if (prev === "right" && right >= left - 0.2) return "right";
  return left >= right ? "left" : "right";
}

/** Where the design goes for this placement, or null if its joints aren't in view. */
export function computeAnchor(
  placementId: string, pts: Landmark[], heightCm: number, side: Side | null
): Anchor | null {
  const spec = AR_PLACEMENTS[placementId];
  if (!spec) return null;
  const pxPerCm = bodyScale(pts, heightCm);
  if (!pxPerCm) return null;
  if (spec.kind === "torso") {
    if (![...SHOULDER, ...HIP].every((i) => seen(pts[i]))) return null;
    const top = mid(pts[LM.L_SHOULDER], pts[LM.R_SHOULDER]);
    const bottom = mid(pts[LM.L_HIP], pts[LM.R_HIP]);
    return {
      x: top.x + spec.t * (bottom.x - top.x),
      y: top.y + spec.t * (bottom.y - top.y),
      angle: downAngle(top, bottom),
      pxPerCm,
      foreshorten: 1,
      side: null,
    };
  }
  if (!side) return null;
  const s = side === "left" ? 0 : 1;
  const a = pts[spec.from[s]], b = pts[spec.to[s]];
  if (!seen(a) || !seen(b)) return null;
  const expectedPx = spec.ratio * heightCm * pxPerCm;
  return {
    x: a.x + spec.t * (b.x - a.x),
    y: a.y + spec.t * (b.y - a.y),
    angle: downAngle(a, b),
    pxPerCm,
    foreshorten: Math.min(Math.max(dist(a, b) / expectedPx, 0.35), 1),
    side,
  };
}

// ─── Video ↔ canvas mapping ──────────────────────────────────

export interface Crop { sx: number; sy: number; sw: number; sh: number }

/**
 * A point normalized to the video frame (what MediaPipe returns) → canvas
 * px, through the cover crop, mirrored for a front camera.
 */
export function videoToCanvas(
  nx: number, ny: number, vw: number, vh: number, crop: Crop, cw: number, ch: number, mirror: boolean
): Pt {
  const x = ((nx * vw - crop.sx) / crop.sw) * cw;
  const y = ((ny * vh - crop.sy) / crop.sh) * ch;
  return { x: mirror ? cw - x : x, y };
}

/** Inverse of videoToCanvas: canvas px → normalized video coordinates. */
export function canvasToVideo(
  px: number, py: number, vw: number, vh: number, crop: Crop, cw: number, ch: number, mirror: boolean
): Pt {
  const x = mirror ? cw - px : px;
  return {
    x: (crop.sx + (x / cw) * crop.sw) / vw,
    y: (crop.sy + (py / ch) * crop.sh) / vh,
  };
}

// ─── Segmentation mask ───────────────────────────────────────

/** MediaPipe selfie_multiclass_256x256 categories. */
export const MASK_CLASS = { BACKGROUND: 0, HAIR: 1, BODY_SKIN: 2, FACE_SKIN: 3, CLOTHES: 4, OTHER: 5 } as const;
/** Pixels that are part of a limb, covered or not. */
export const isLimb = (c: number): boolean =>
  c === MASK_CLASS.BODY_SKIN || c === MASK_CLASS.CLOTHES || c === MASK_CLASS.OTHER;

/**
 * Width of the run of `inside` pixels through (cx, cy) along the unit
 * direction (dx, dy), in mask px. Null when the center is outside, or when
 * the run reaches the mask's edge (the limb is cut off, so its width is
 * unknown).
 */
export function maskRunWidth(
  mask: ArrayLike<number>, mw: number, mh: number,
  cx: number, cy: number, dx: number, dy: number, inside: (c: number) => boolean
): number | null {
  const at = (x: number, y: number): number | null => {
    const xi = Math.round(x), yi = Math.round(y);
    return xi < 0 || yi < 0 || xi >= mw || yi >= mh ? null : mask[yi * mw + xi];
  };
  const c0 = at(cx, cy);
  if (c0 === null || !inside(c0)) return null;
  let run = 1;
  for (const sign of [1, -1]) {
    for (let k = 1; ; k++) {
      const c = at(cx + sign * dx * k, cy + sign * dy * k);
      if (c === null) return null;
      if (!inside(c)) break;
      run++;
    }
  }
  return run;
}

/**
 * Wrap angle for a design drawn `designPx` wide across a limb `limbPx` wide:
 * the arc a design that wide covers on a cylinder of that diameter, capped
 * at half a turn (the front half is all a camera sees).
 */
export function wrapSpanFor(designPx: number, limbPx: number): number {
  if (!(designPx > 0 && limbPx > 0)) return 0;
  return Math.min((2 * designPx) / limbPx, Math.PI);
}

// ─── Smoothing ───────────────────────────────────────────────

/**
 * One-euro filter (Casiez, Roussel and Vogel, CHI 2012): smooths jitter when
 * a value is still and follows quickly when it moves. Cutoffs in Hz.
 */
export class OneEuro {
  private prev: number | null = null;
  private dPrev = 0;
  private tPrev = 0;
  constructor(private minCutoff = 1.2, private beta = 0.01, private dCutoff = 1) {}

  filter(x: number, tMs: number): number {
    if (this.prev === null) {
      this.prev = x;
      this.tPrev = tMs;
      return x;
    }
    const dt = Math.max((tMs - this.tPrev) / 1000, 1e-3);
    this.tPrev = tMs;
    const alpha = (cutoff: number): number => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    const ad = alpha(this.dCutoff);
    this.dPrev = ad * ((x - this.prev) / dt) + (1 - ad) * this.dPrev;
    const a = alpha(this.minCutoff + this.beta * Math.abs(this.dPrev));
    this.prev = a * x + (1 - a) * this.prev;
    return this.prev;
  }

  reset(): void {
    this.prev = null;
    this.dPrev = 0;
  }
}

/** `next` moved to within π of `prev`, so a filter never sees a 2π jump. */
export function unwrapAngle(prev: number, next: number): number {
  let d = next - prev;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return prev + d;
}
