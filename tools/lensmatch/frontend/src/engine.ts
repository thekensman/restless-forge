// @ts-nocheck
/* LensMatch — engine.js: Lens equivalence calculator (browser-only) */

export const SYSTEMS = {
  full_frame: { label: 'Full Frame (35mm)', crop: 1.0, mounts: ['Canon RF','Nikon Z','Sony FE','Leica L','Sigma L'] },
  apsc_canon: { label: 'APS-C (Canon)',     crop: 1.6, mounts: ['Canon RF-S','Canon EF-S'] },
  apsc_nikon: { label: 'APS-C (Nikon/Sony)',crop: 1.5, mounts: ['Nikon DX','Sony E','Fuji X'] },
  apsc_fuji:  { label: 'APS-C (Fuji)',      crop: 1.5, mounts: ['Fuji X'] },
  mft:        { label: 'Micro Four Thirds',  crop: 2.0, mounts: ['MFT (Olympus/OM System)','MFT (Panasonic)'] },
  medium_fmt: { label: 'Medium Format',       crop: 0.79, mounts: ['Hasselblad X','Fuji GFX'] },
  oneInch:    { label: '1-inch sensor',       crop: 2.7, mounts: ['Sony RX100','Nikon 1'] },
};

/**
 * Calculate full-frame equivalent of a lens.
 * @param {number} focalLength - mm (on source system)
 * @param {number} aperture - f-number
 * @param {string} sourceSystem - key from SYSTEMS
 * @returns {{ eqFocal, eqAperture, fov, dofFactor }}
 */
export function toFullFrame(focalLength, aperture, sourceSystem) {
  const sys = SYSTEMS[sourceSystem];
  if (!sys) return null;
  const crop = sys.crop;
  const eqFocal = Math.round(focalLength * crop * 10) / 10;
  const eqAperture = Math.round(aperture * crop * 10) / 10;
  const fov = Math.round(2 * Math.atan(36 / (2 * eqFocal)) * (180/Math.PI) * 10) / 10;
  return { eqFocal, eqAperture, fov, dofFactor: crop, sourceCrop: crop };
}

/**
 * Find equivalent lens on a target system.
 * @param {number} focalLength - mm on source
 * @param {number} aperture - f-number on source
 * @param {string} sourceSystem
 * @param {string} targetSystem
 */
export function convertBetween(focalLength, aperture, sourceSystem, targetSystem) {
  const src = SYSTEMS[sourceSystem], tgt = SYSTEMS[targetSystem];
  if (!src || !tgt) return null;
  const ffFocal = focalLength * src.crop;
  const ffAperture = aperture * src.crop;
  const tgtFocal = Math.round((ffFocal / tgt.crop) * 10) / 10;
  const tgtAperture = Math.round((ffAperture / tgt.crop) * 10) / 10;
  const fov = Math.round(2 * Math.atan(36 / (2 * ffFocal)) * (180/Math.PI) * 10) / 10;
  return { targetFocal: tgtFocal, targetAperture: tgtAperture, ffEquivFocal: ffFocal, ffEquivAperture: ffAperture, fov };
}

/** Get all equivalents across every system */
export function allEquivalents(focalLength, aperture, sourceSystem) {
  return Object.entries(SYSTEMS).map(([key, sys]) => ({
    system: key, label: sys.label,
    ...convertBetween(focalLength, aperture, sourceSystem, key),
  }));
}

/** Calculate depth of field (simplified thin lens model) */
export function depthOfField(focalMm, aperture, subjectDistM, cropFactor) {
  const f = focalMm; const N = aperture; const d = subjectDistM * 1000;
  const CoC = 0.03 / cropFactor; // Circle of confusion
  const H = (f * f) / (N * CoC) + f; // Hyperfocal distance
  const near = d * (H - f) / (H + d - 2*f);
  const far = d > H ? Infinity : d * (H - f) / (H - d);
  const total = far === Infinity ? Infinity : Math.round((far - near) / 10) / 100;
  return { nearM: Math.round(near) / 1000, farM: far === Infinity ? Infinity : Math.round(far) / 1000, totalM: total };
}
