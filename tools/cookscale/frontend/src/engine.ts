// @ts-nocheck
/* CookScale — engine.js: Unit conversion & pan scaling (browser-only) */

/** Ingredient densities (g per cup) for accurate volume↔weight conversion */
export const DENSITIES = {
  'all-purpose flour': 120, 'bread flour': 127, 'whole wheat flour': 128,
  'almond flour': 96, 'cake flour': 114, 'granulated sugar': 200,
  'brown sugar (packed)': 220, 'powdered sugar': 120, 'butter': 227,
  'milk': 244, 'water': 236, 'cream (heavy)': 238, 'honey': 340,
  'oil (vegetable)': 218, 'cocoa powder': 86, 'oats (rolled)': 80,
  'rice (uncooked)': 185, 'salt (table)': 288, 'salt (kosher)': 144,
  'baking powder': 230, 'baking soda': 220, 'cornstarch': 128,
};

/** Base conversions to millilitres */
const TO_ML = { ml:1, l:1000, tsp:4.929, tbsp:14.787, cup:236.588, 'fl_oz':29.574, pint:473.176, quart:946.353, gallon:3785.41 };
/** Base conversions to grams */
const TO_G = { g:1, kg:1000, oz:28.3495, lb:453.592 };
/** Temperature conversions */
export function fToC(f) { return Math.round((f - 32) * 5/9); }
export function cToF(c) { return Math.round(c * 9/5 + 32); }

/**
 * Convert between volume units.
 * @returns {number} amount in target unit
 */
export function convertVolume(amount, fromUnit, toUnit) {
  const ml = amount * (TO_ML[fromUnit] || 1);
  return Math.round(ml / (TO_ML[toUnit] || 1) * 1000) / 1000;
}

/** Convert between weight units */
export function convertWeight(amount, fromUnit, toUnit) {
  const g = amount * (TO_G[fromUnit] || 1);
  return Math.round(g / (TO_G[toUnit] || 1) * 1000) / 1000;
}

/** Convert volume to weight using ingredient density */
export function volumeToWeight(cups, ingredient) {
  const density = DENSITIES[ingredient.toLowerCase()];
  if (!density) return null;
  return Math.round(cups * density * 10) / 10;
}

/** Convert weight to volume using ingredient density */
export function weightToVolume(grams, ingredient) {
  const density = DENSITIES[ingredient.toLowerCase()];
  if (!density) return null;
  return Math.round((grams / density) * 100) / 100;
}

/* ─── Pan sizes ────────────────────────────── */

export const PAN_SHAPES = {
  round:     { label: 'Round',      volume: (d, h) => Math.PI * (d/2)**2 * h },
  square:    { label: 'Square',     volume: (w, h, d) => w * (d||w) * h },
  rectangle: { label: 'Rectangle',  volume: (w, h, d) => w * d * h },
  bundt:     { label: 'Bundt',      volume: (d, h) => Math.PI * (d/2)**2 * h * 0.6 },
  loaf:      { label: 'Loaf',       volume: (w, h, d) => w * d * h },
};

/**
 * Calculate pan volume in cubic cm.
 * @param {string} shape
 * @param {Object} dims - { width, height, depth } in cm
 */
export function panVolume(shape, dims) {
  const s = PAN_SHAPES[shape];
  if (!s) return 0;
  if (shape === 'round' || shape === 'bundt') return s.volume(dims.width, dims.height);
  return s.volume(dims.width, dims.height, dims.depth || dims.width);
}

/**
 * Calculate scaling factor between two pans.
 * @returns {number} multiplier for ingredient quantities
 */
export function panScaleFactor(fromShape, fromDims, toShape, toDims) {
  const v1 = panVolume(fromShape, fromDims);
  const v2 = panVolume(toShape, toDims);
  if (v1 === 0) return 1;
  return Math.round((v2 / v1) * 100) / 100;
}

/** Estimate bake time adjustment for different pan sizes */
export function adjustBakeTime(originalMinutes, scaleFactor) {
  // Thinner batter → less time, thicker → more
  const timeFactor = Math.pow(scaleFactor, 0.4); // sub-linear
  return Math.round(originalMinutes * timeFactor);
}

/** Common pan size presets (dimensions in cm) */
export const PAN_PRESETS = {
  'round_6':  { shape:'round',     label:'6" Round',    dims:{width:15.2, height:5} },
  'round_8':  { shape:'round',     label:'8" Round',    dims:{width:20.3, height:5} },
  'round_9':  { shape:'round',     label:'9" Round',    dims:{width:22.9, height:5} },
  'round_10': { shape:'round',     label:'10" Round',   dims:{width:25.4, height:5} },
  'square_8': { shape:'square',    label:'8" Square',   dims:{width:20.3, height:5} },
  'square_9': { shape:'square',    label:'9" Square',   dims:{width:22.9, height:5} },
  'rect_9x13':{ shape:'rectangle', label:'9×13" Rect',  dims:{width:22.9, height:5, depth:33} },
  'loaf_9x5': { shape:'loaf',      label:'9×5" Loaf',   dims:{width:22.9, height:7.6, depth:12.7} },
  'bundt_10': { shape:'bundt',     label:'10" Bundt',   dims:{width:25.4, height:10} },
};
