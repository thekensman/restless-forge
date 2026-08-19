/**
 * TattooSafe — Calculation Engine
 *
 * Pure functions with zero DOM dependencies.
 * Covers: body parts, proportional scaling, pricing estimation,
 * and unit conversions.
 */

// ─── Types ───────────────────────────────────────────────────

export interface BodyPart {
  id: string;
  label: string;
  group: "arm" | "torso" | "leg" | "other";
  widthRatio: number;
  heightRatio: number;
  difficulty: number;
  /** Typical adult circumference at this placement, cm (drives the AR wrap curvature). */
  circumferenceCm: number;
  description: string;
  zone: { x: number; y: number; w: number; h: number };
}

export interface MaxDimensions {
  maxWidthCm: number;
  maxHeightCm: number;
}

export interface FitResult {
  fits: boolean;
  widthPct: number;
  heightPct: number;
}

export interface PriceResult {
  low: number;
  high: number;
  areaSqIn: number;
  needleMinutes: number;
  totalMinutes: number;
  sessions: number;
  hoursPerSession: number[];
  painLevel: string;
  complexity: string;
}

export type ComplexityKey = "simple_line" | "moderate_detail" | "full_color" | "photorealistic";
export type ArtistKey = "apprentice" | "experienced" | "specialist" | "celebrity";

// ─── Unit Conversions ────────────────────────────────────────

export function ftInToCm(ft: number, inches: number): number {
  if (ft < 0 || inches < 0 || inches >= 12) return NaN;
  return (ft * 12 + inches) * 2.54;
}

export function cmToIn(cm: number): number { return cm / 2.54; }
export function inToCm(inches: number): number { return inches * 2.54; }
export function sqCmToSqIn(sqCm: number): number { return sqCm / 6.4516; }

// ─── Body Part Catalogue ─────────────────────────────────────

export const BODY_PARTS: BodyPart[] = [
  { id: "inner_forearm", label: "Inner Forearm", group: "arm", widthRatio: 0.045, heightRatio: 0.15, difficulty: 1.0, circumferenceCm: 26, description: "Flat surface, low pain, excellent visibility. Most popular first-tattoo placement.", zone: { x: 0.27, y: 0.38, w: 0.10, h: 0.18 } },
  { id: "outer_forearm", label: "Outer Forearm", group: "arm", widthRatio: 0.05, heightRatio: 0.15, difficulty: 1.0, circumferenceCm: 26, description: "Slightly curved surface. Good for wrapping designs.", zone: { x: 0.645, y: 0.38, w: 0.10, h: 0.18 } },
  { id: "upper_arm", label: "Upper Arm / Bicep", group: "arm", widthRatio: 0.07, heightRatio: 0.12, difficulty: 1.0, circumferenceCm: 32, description: "Large flat area. Easy to conceal. Popular for medium-to-large pieces.", zone: { x: 0.26, y: 0.26, w: 0.10, h: 0.12 } },
  { id: "shoulder", label: "Shoulder / Deltoid", group: "arm", widthRatio: 0.08, heightRatio: 0.08, difficulty: 1.1, circumferenceCm: 42, description: "Curved surface follows muscle contour. Good for rounded designs.", zone: { x: 0.25, y: 0.185, w: 0.11, h: 0.07 } },
  { id: "wrist", label: "Wrist", group: "arm", widthRatio: 0.035, heightRatio: 0.04, difficulty: 1.2, circumferenceCm: 17, description: "Small area, thin skin, higher pain. Popular for minimalist designs.", zone: { x: 0.27, y: 0.56, w: 0.09, h: 0.04 } },
  { id: "chest", label: "Chest", group: "torso", widthRatio: 0.18, heightRatio: 0.12, difficulty: 1.1, circumferenceCm: 100, description: "Large canvas. Sternum area is more painful than pectoral muscle.", zone: { x: 0.37, y: 0.20, w: 0.26, h: 0.12 } },
  { id: "upper_back", label: "Upper Back", group: "torso", widthRatio: 0.20, heightRatio: 0.15, difficulty: 1.0, circumferenceCm: 100, description: "Largest flat surface on the body. Ideal for large detailed pieces.", zone: { x: 0.37, y: 0.20, w: 0.26, h: 0.15 } },
  { id: "ribs", label: "Ribs / Side Torso", group: "torso", widthRatio: 0.08, heightRatio: 0.15, difficulty: 1.4, circumferenceCm: 90, description: "Thin skin over bone — one of the most painful placements. Stunning results.", zone: { x: 0.365, y: 0.28, w: 0.06, h: 0.16 } },
  { id: "sternum", label: "Sternum / Underboob", group: "torso", widthRatio: 0.10, heightRatio: 0.08, difficulty: 1.4, circumferenceCm: 90, description: "Centre of chest between ribs. High pain, high impact.", zone: { x: 0.42, y: 0.30, w: 0.16, h: 0.08 } },
  { id: "lower_back", label: "Lower Back", group: "torso", widthRatio: 0.16, heightRatio: 0.10, difficulty: 1.1, circumferenceCm: 95, description: "Wide horizontal area above the waistline.", zone: { x: 0.37, y: 0.42, w: 0.26, h: 0.07 } },
  { id: "thigh", label: "Thigh", group: "leg", widthRatio: 0.09, heightRatio: 0.18, difficulty: 1.0, circumferenceCm: 55, description: "Large surface, moderate pain. Easy to conceal. Great for big pieces.", zone: { x: 0.39, y: 0.52, w: 0.10, h: 0.18 } },
  { id: "calf", label: "Calf", group: "leg", widthRatio: 0.06, heightRatio: 0.16, difficulty: 1.1, circumferenceCm: 37, description: "Curved muscle surface. Visible when wearing shorts.", zone: { x: 0.52, y: 0.70, w: 0.09, h: 0.16 } },
  { id: "ankle", label: "Ankle", group: "leg", widthRatio: 0.04, heightRatio: 0.04, difficulty: 1.3, circumferenceCm: 22, description: "Small bony area, higher pain. Popular for minimalist and wrap designs.", zone: { x: 0.52, y: 0.88, w: 0.08, h: 0.04 } },
  { id: "back_of_neck", label: "Back of Neck", group: "other", widthRatio: 0.06, heightRatio: 0.05, difficulty: 1.3, circumferenceCm: 38, description: "Small area, moderate pain. Easily hidden by hair or collar.", zone: { x: 0.44, y: 0.12, w: 0.12, h: 0.05 } },
  { id: "behind_ear", label: "Behind Ear", group: "other", widthRatio: 0.025, heightRatio: 0.03, difficulty: 1.4, circumferenceCm: 56, description: "Tiny, delicate area. Higher pain due to thin skin and proximity to bone.", zone: { x: 0.40, y: 0.07, w: 0.06, h: 0.04 } },
  { id: "hand", label: "Back of Hand", group: "other", widthRatio: 0.045, heightRatio: 0.05, difficulty: 1.5, circumferenceCm: 21, description: "High visibility, high pain, faster fading due to frequent washing and sun exposure.", zone: { x: 0.25, y: 0.58, w: 0.08, h: 0.05 } },
];

export function getBodyPart(id: string): BodyPart | null {
  return BODY_PARTS.find(bp => bp.id === id) ?? null;
}

export function getBodyPartsByGroup(group: string): BodyPart[] {
  return BODY_PARTS.filter(bp => bp.group === group);
}

export function maxTattooDimensions(bodyPartId: string, heightCm: number): MaxDimensions | null {
  const bp = getBodyPart(bodyPartId);
  if (!bp || heightCm <= 0) return null;
  return {
    maxWidthCm: Math.round(heightCm * bp.widthRatio * 10) / 10,
    maxHeightCm: Math.round(heightCm * bp.heightRatio * 10) / 10,
  };
}

export function checkFit(bodyPartId: string, heightCm: number, tattooWCm: number, tattooHCm: number): FitResult {
  const max = maxTattooDimensions(bodyPartId, heightCm);
  if (!max) return { fits: false, widthPct: 0, heightPct: 0 };
  const widthPct = Math.round((tattooWCm / max.maxWidthCm) * 100);
  const heightPct = Math.round((tattooHCm / max.maxHeightCm) * 100);
  return { fits: widthPct <= 100 && heightPct <= 100, widthPct, heightPct };
}


/**
 * Silhouette figure regions on the 200×400 viewBox, exported so the zone
 * regression test can assert each body part's zone lands on the right limb.
 * The figure spans the full canvas height (head y≈6 → feet y≈388) to match
 * the normalized zone coordinate system.
 */
export const FIGURE_REGIONS: Record<string, { x: number; y: number; w: number; h: number }> = {
  head:      { x: 84, y: 6,   w: 32, h: 44 },
  neck:      { x: 92, y: 48,  w: 16, h: 16 },
  torso:     { x: 72, y: 64,  w: 56, h: 132 },
  left_arm:  { x: 52, y: 72,  w: 20, h: 168 },
  right_arm: { x: 128, y: 72, w: 20, h: 168 },
  left_hand: { x: 53, y: 238, w: 18, h: 20 },
  right_hand:{ x: 129, y: 238, w: 18, h: 20 },
  left_leg:  { x: 78, y: 194, w: 20, h: 180 },
  right_leg: { x: 102, y: 194, w: 20, h: 180 },
};

export function generateSilhouetteSvg(
  bodyPartId: string, heightCm: number, tattooWCm: number, tattooHCm: number,
  options: { rotation?: number; opacity?: number; unit?: "cm" | "in" } = {},
): string {
  const bp = getBodyPart(bodyPartId);
  if (!bp) return "";
  const rotation = options.rotation ?? 0;
  const opacity = options.opacity ?? 0.85;
  const unit = options.unit ?? "cm";
  const dim = (cm: number): string =>
    unit === "in" ? `${Math.round(cmToIn(cm) * 10) / 10} in` : `${Math.round(cm * 10) / 10} cm`;
  const vw = 200, vh = 400;
  const zx = bp.zone.x * vw, zy = bp.zone.y * vh, zw = bp.zone.w * vw, zh = bp.zone.h * vh;
  const maxW = heightCm * bp.widthRatio, maxH = heightCm * bp.heightRatio;
  const scaleW = Math.min(1, tattooWCm / maxW), scaleH = Math.min(1, tattooHCm / maxH);
  const tw = zw * scaleW, th = zh * scaleH;
  const tx = zx + (zw - tw) / 2, ty = zy + (zh - th) / 2;
  const cx = tx + tw / 2, cy = ty + th / 2;
  return `<svg viewBox="0 0 ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tattoo placement preview on ${bp.label}">
  <rect width="${vw}" height="${vh}" fill="#1a1a2a" rx="8"/>
  <ellipse cx="100" cy="28" rx="16" ry="22" fill="#2a2a3a" stroke="#444" stroke-width="0.5"/>
  <rect x="92" y="48" width="16" height="16" fill="#2a2a3a" stroke="#444" stroke-width="0.5"/>
  <rect x="72" y="64" width="56" height="132" rx="12" fill="#2a2a3a" stroke="#444" stroke-width="0.5"/>
  <rect x="52" y="72" width="20" height="168" rx="8" fill="#2a2a3a" stroke="#444" stroke-width="0.5"/>
  <rect x="128" y="72" width="20" height="168" rx="8" fill="#2a2a3a" stroke="#444" stroke-width="0.5"/>
  <ellipse cx="62" cy="248" rx="9" ry="10" fill="#2a2a3a" stroke="#444" stroke-width="0.5"/>
  <ellipse cx="138" cy="248" rx="9" ry="10" fill="#2a2a3a" stroke="#444" stroke-width="0.5"/>
  <rect x="78" y="194" width="20" height="180" rx="8" fill="#2a2a3a" stroke="#444" stroke-width="0.5"/>
  <rect x="102" y="194" width="20" height="180" rx="8" fill="#2a2a3a" stroke="#444" stroke-width="0.5"/>
  <ellipse cx="86" cy="382" rx="11" ry="7" fill="#2a2a3a" stroke="#444" stroke-width="0.5"/>
  <ellipse cx="114" cy="382" rx="11" ry="7" fill="#2a2a3a" stroke="#444" stroke-width="0.5"/>
  <g transform="rotate(${rotation}, ${cx}, ${cy})">
    <rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="#a882ff" opacity="${opacity * 0.35}" rx="1"/>
    <rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="none" stroke="#c9b0ff" stroke-width="0.6" rx="1"/>
  </g>
  <line x1="${tx}" y1="${ty - 6}" x2="${tx + tw}" y2="${ty - 6}" stroke="#c9b0ff" stroke-width="0.4"/>
  <text x="${cx}" y="${ty - 10}" text-anchor="middle" fill="#c9b0ff" font-size="6" font-family="Inter, sans-serif">${dim(tattooWCm)}</text>
  <line x1="${tx + tw + 6}" y1="${ty}" x2="${tx + tw + 6}" y2="${ty + th}" stroke="#c9b0ff" stroke-width="0.4"/>
  <text x="${tx + tw + 10}" y="${cy + 2}" fill="#c9b0ff" font-size="6" font-family="Inter, sans-serif">${dim(tattooHCm)}</text>
  <text x="100" y="${vh - 10}" text-anchor="middle" fill="#706b82" font-size="7" font-family="Inter, sans-serif">${bp.label}</text>
</svg>`;
}

// ─── Pricing ─────────────────────────────────────────────────

export const HOURLY_RATES = {
  apprentice:  { min: 80,  max: 120, label: "Apprentice (learning)" },
  experienced: { min: 120, max: 200, label: "Experienced (3–8 yrs)" },
  specialist:  { min: 200, max: 350, label: "Specialist / Award-winning" },
  celebrity:   { min: 350, max: 500, label: "Celebrity / High-demand" },
} as const;

export const COMPLEXITY = {
  simple_line:     { mult: 1.0, timePerSqIn: 8,  label: "Simple line work",         desc: "Single-needle outlines, minimal shading, text" },
  moderate_detail: { mult: 1.3, timePerSqIn: 15, label: "Moderate detail",           desc: "Shading, dotwork, small fills, traditional style" },
  full_color:      { mult: 1.8, timePerSqIn: 25, label: "Full colour",              desc: "Colour fills, blending, neo-traditional, new school" },
  photorealistic:  { mult: 2.5, timePerSqIn: 40, label: "Photorealistic / portrait", desc: "Realistic portraits, hyper-detail, cover-ups" },
} as const;

export const PLACEMENT_DIFFICULTY: Record<string, { mult: number; pain: string; label: string }> = {
  inner_forearm: { mult: 1.0,  pain: "Low-moderate",  label: "Inner forearm" },
  outer_forearm: { mult: 1.0,  pain: "Low-moderate",  label: "Outer forearm" },
  upper_arm:     { mult: 1.0,  pain: "Low",           label: "Upper arm / Bicep" },
  shoulder:      { mult: 1.05, pain: "Low-moderate",  label: "Shoulder" },
  wrist:         { mult: 1.15, pain: "Moderate-high", label: "Wrist" },
  chest:         { mult: 1.1,  pain: "Moderate",      label: "Chest" },
  upper_back:    { mult: 1.0,  pain: "Low-moderate",  label: "Upper back" },
  ribs:          { mult: 1.35, pain: "High",          label: "Ribs / Side" },
  sternum:       { mult: 1.35, pain: "High",          label: "Sternum" },
  lower_back:    { mult: 1.05, pain: "Moderate",      label: "Lower back" },
  thigh:         { mult: 1.0,  pain: "Low-moderate",  label: "Thigh" },
  calf:          { mult: 1.05, pain: "Moderate",      label: "Calf" },
  ankle:         { mult: 1.2,  pain: "Moderate-high", label: "Ankle" },
  back_of_neck:  { mult: 1.2,  pain: "Moderate-high", label: "Back of neck" },
  behind_ear:    { mult: 1.3,  pain: "High",          label: "Behind ear" },
  hand:          { mult: 1.4,  pain: "High",          label: "Back of hand" },
};

const SESSION = {
  setupMinutes: 30,
  breakMinutesPerHour: 5,
  maxSessionHours: 6,
  minimumCharge: { min: 50, max: 150 },
};

export function dimensionsToSqIn(widthCm: number, heightCm: number): number {
  return (widthCm / 2.54) * (heightCm / 2.54);
}

export function estimateNeedleTime(areaSqIn: number, complexityKey: ComplexityKey, placementKey: string): number {
  const comp = COMPLEXITY[complexityKey];
  const place = PLACEMENT_DIFFICULTY[placementKey];
  if (!comp || !place) return 0;
  return areaSqIn * comp.timePerSqIn * place.mult;
}

export function estimateSessionTime(needleMinutes: number): { totalMinutes: number; sessions: number; hoursPerSession: number[] } {
  const totalWithSetup = needleMinutes + SESSION.setupMinutes;
  const withBreaks = totalWithSetup * (1 + SESSION.breakMinutesPerHour / 60);
  const totalHours = withBreaks / 60;
  if (totalHours <= SESSION.maxSessionHours) {
    return { totalMinutes: Math.round(withBreaks), sessions: 1, hoursPerSession: [Math.round(totalHours * 10) / 10] };
  }
  const maxMinPerSession = SESSION.maxSessionHours * 60;
  const sessions = Math.ceil(withBreaks / maxMinPerSession);
  const perSession = withBreaks / sessions;
  return { totalMinutes: Math.round(withBreaks), sessions, hoursPerSession: Array(sessions).fill(Math.round((perSession / 60) * 10) / 10) };
}

export function calculatePrice(widthCm: number, heightCm: number, complexityKey: ComplexityKey, placementKey: string, artistKey: ArtistKey): PriceResult {
  const areaSqIn = dimensionsToSqIn(widthCm, heightCm);
  const needleMinutes = estimateNeedleTime(areaSqIn, complexityKey, placementKey);
  const session = estimateSessionTime(needleMinutes);
  const rate = HOURLY_RATES[artistKey];
  const place = PLACEMENT_DIFFICULTY[placementKey];
  if (!rate || !place) return { low: 0, high: 0, areaSqIn: 0, needleMinutes: 0, totalMinutes: 0, sessions: 0, hoursPerSession: [], painLevel: "", complexity: "" };
  const totalHours = session.totalMinutes / 60;
  let low = Math.round(totalHours * rate.min);
  let high = Math.round(totalHours * rate.max * 1.15);
  low = Math.max(low, SESSION.minimumCharge.min);
  high = Math.max(high, SESSION.minimumCharge.max);
  return {
    low, high,
    areaSqIn: Math.round(areaSqIn * 100) / 100,
    needleMinutes: Math.round(needleMinutes),
    totalMinutes: session.totalMinutes,
    sessions: session.sessions,
    hoursPerSession: session.hoursPerSession,
    painLevel: place.pain,
    complexity: COMPLEXITY[complexityKey]?.label ?? "",
  };
}

// ─── Formatting ──────────────────────────────────────────────

export function fmtPriceRange(low: number, high: number): string {
  return `$${low.toLocaleString("en-US")} – $${high.toLocaleString("en-US")}`;
}

export function fmtTime(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hrs = Math.round((totalMinutes / 60) * 10) / 10;
  return `${hrs} hr${hrs !== 1 ? "s" : ""}`;
}

/* ── Design background removal ── */

export interface PixelBuffer {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}

/**
 * Remove a FLAT/UNIFORM background in-place by flood-filling inward from
 * every border pixel: any pixel connected to the edge and within
 * `tolerance` of the border's average colour is made transparent. This
 * beats a global colour key in two ways — an interior region that happens
 * to match the background colour (e.g. a gap enclosed by the subject)
 * survives because it isn't connected to the edge, and the subject is
 * never touched.
 *
 * Peels in PASSES: each pass flood-fills the largest flat colour cluster
 * on the current frontier (initially the image border), then the boundary
 * that fill exposed joins the frontier for the next pass. This handles
 * e.g. a white product-photo matte around a black poster — the white
 * frame is one pass, the black field behind it the next. Two guards keep
 * a pass from eating the design itself: a fill after the first must be
 * FAT (a backdrop's area dwarfs its boundary; line art is thin, its area
 * is comparable to its boundary) and must leave pixels behind. A fill
 * that fails either guard is rolled back.
 *
 * Deliberately scoped to logos / line-art / clean-cut designs; it will
 * NOT cleanly separate a photographic (busy or gradient) background —
 * that needs ML segmentation, which this tool omits by design. Returns
 * `removed: false` (buffer untouched) when the corners/border don't agree
 * on a flat backdrop colour, i.e. there's no flat background to remove.
 *
 * `backdropLum` is the luminance of the dominant removed field — the
 * colour the artist drew against. The caller uses it to decide whether
 * the surviving art is light-on-dark (see invertForDarkBackdrop).
 */
export interface RemoveBackgroundResult {
  removed: boolean;
  /** Luminance (0–255) of the largest removed fill; null if nothing was removed. */
  backdropLum: number | null;
}

export function removeFlatBackground(px: PixelBuffer, tolerance = 60, maxFills = 4): RemoveBackgroundResult {
  const none: RemoveBackgroundResult = { removed: false, backdropLum: null };
  const { data, width, height } = px;
  if (width < 3 || height < 3) return none;
  const total = width * height;
  const rgb = (p: number): [number, number, number] => [
    Number(data[p * 4]), Number(data[p * 4 + 1]), Number(data[p * 4 + 2]),
  ];
  const dist = (a: number[], b: number[]): number =>
    Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

  // Photo refusal: the four corners must agree on a colour; otherwise
  // there's no flat backdrop to remove.
  const corners = [0, width - 1, width * (height - 1), total - 1].map(rgb);
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++)
      if (dist(corners[i], corners[j]) > tolerance * 1.7) return none;

  // First frontier = the image border.
  let frontier: number[] = [];
  for (let x = 0; x < width; x++) frontier.push(x, width * (height - 1) + x);
  for (let y = 1; y < height - 1; y++) frontier.push(y * width, y * width + width - 1);

  const stamp = new Int32Array(total); // last fill that examined this pixel
  let opaque = 0;
  for (let p = 0; p < total; p++) if (data[p * 4 + 3] !== 0) opaque++;
  let removedTotal = 0;
  let fills = 0;
  let biggestFill = 0;
  let backdropLum: number | null = null;

  // Two stages. BORDER: every flat colour cluster touching the image
  // border is a legitimate background field (a matte AND the poster it
  // frames can both reach the edge). INTERIOR: fills seeded from the
  // boundary a border fill exposed — here the design itself is at risk,
  // so the fatness guard applies and peeling stops once a substantial
  // share of the image is gone (the real backdrop has been removed;
  // anything further would be the design).
  let stage: "border" | "interior" = "border";
  let interiorNext: number[] = [];

  while (fills < maxFills) {
    if (stage === "interior" && removedTotal >= total * 0.35) break;
    const live = frontier.filter((p) => data[p * 4 + 3] !== 0);

    // Largest colour cluster on the frontier = this fill's reference.
    const anchors: { c: [number, number, number]; members: number[] }[] = [];
    for (const p of live) {
      const c = rgb(p);
      const a = anchors.find((an) => dist(an.c, c) <= tolerance);
      if (a) a.members.push(p);
      else if (anchors.length < 8) anchors.push({ c, members: [p] });
    }
    anchors.sort((a, b) => b.members.length - a.members.length);
    const cluster = anchors[0];
    // No frontier left, or one so fragmented that no cluster dominates
    // (not a flat backdrop): move on from the border to the exposed
    // interior boundaries, or stop.
    if (!cluster || cluster.members.length / live.length < 0.2) {
      if (stage === "border") {
        stage = "interior";
        frontier = interiorNext;
        interiorNext = [];
        continue;
      }
      break;
    }
    const inCluster = new Set(cluster.members);
    const mean = [0, 0, 0];
    for (const p of cluster.members) { const c = rgb(p); mean[0] += c[0]; mean[1] += c[1]; mean[2] += c[2]; }
    for (let c = 0; c < 3; c++) mean[c] /= cluster.members.length;

    const mark = fills + 1;
    const stack: number[] = [];
    const boundary: number[] = [];
    const removedIdx: number[] = [];
    const removedAlpha: number[] = [];
    const consider = (p: number): void => {
      if (stamp[p] === mark || data[p * 4 + 3] === 0) return;
      stamp[p] = mark;
      if (dist(rgb(p), mean) <= tolerance) stack.push(p);
      else boundary.push(p);
    };
    for (const p of cluster.members) consider(p);
    while (stack.length) {
      const p = stack.pop()!;
      removedIdx.push(p);
      removedAlpha.push(Number(data[p * 4 + 3]));
      data[p * 4 + 3] = 0;
      const x = p % width;
      if (x > 0) consider(p - 1);
      if (x < width - 1) consider(p + 1);
      if (p >= width) consider(p - width);
      if (p < total - width) consider(p + width);
    }

    // Guards (never on the very first fill — that's the trusted primary
    // background): every later fill must leave a design behind, and an
    // interior fill must additionally be FAT like a backdrop (line art is
    // thin — its area is comparable to its boundary). A fill that fails
    // is rolled back.
    const survivors = opaque - removedIdx.length;
    const fatness = removedIdx.length / Math.max(1, boundary.length);
    if (fills > 0 && (survivors < total * 0.01 || (stage === "interior" && fatness < 8))) {
      for (let k = 0; k < removedIdx.length; k++) data[removedIdx[k] * 4 + 3] = removedAlpha[k];
      break;
    }
    removedTotal += removedIdx.length;
    opaque = survivors;
    fills++;
    if (removedIdx.length > biggestFill) {
      biggestFill = removedIdx.length;
      backdropLum = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
    }
    if (stage === "border") {
      // Keep working the border's other colour clusters; what the fill
      // exposed queues up for the interior stage.
      frontier = live.filter((p) => !inCluster.has(p));
      interiorNext = interiorNext.concat(boundary);
    } else {
      frontier = live.filter((p) => !inCluster.has(p)).concat(boundary);
    }
  }
  return { removed: removedTotal > 0, backdropLum };
}

/**
 * Art drawn on a DARK backdrop is light — after that backdrop is removed,
 * the surviving lines would be invisible under the camera preview's
 * multiply blend (white lines × skin = skin). This inverts the surviving
 * (opaque) pixels in place when the removed backdrop was dark, so the
 * linework reads as ink either way. The backdrop's own colour is the
 * decision signal — statistics over the surviving pixels are unreliable
 * because background removal leaves an anti-aliased halo around the art.
 * Returns true when an inversion was applied.
 */
export function invertForDarkBackdrop(px: PixelBuffer, backdropLum: number | null): boolean {
  if (backdropLum === null || backdropLum >= 128) return false;
  const { data, width, height } = px;
  const total = width * height;
  for (let p = 0; p < total; p++) {
    if (Number(data[p * 4 + 3]) === 0) continue;
    data[p * 4] = 255 - Number(data[p * 4]);
    data[p * 4 + 1] = 255 - Number(data[p * 4 + 1]);
    data[p * 4 + 2] = 255 - Number(data[p * 4 + 2]);
  }
  return true;
}
