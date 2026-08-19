// @ts-nocheck
/* CNCFeed — engine.js: Feeds & speeds calculator (browser-only) */

/** Material database with SFM (surface feet per minute) ranges */
export const MATERIALS = {
  softwood:    { label: 'Softwood (Pine, Cedar)',    sfm: [600, 1000], chipLoad: [0.003, 0.008] },
  hardwood:    { label: 'Hardwood (Oak, Maple)',     sfm: [400, 700],  chipLoad: [0.003, 0.006] },
  plywood:     { label: 'Plywood / MDF',             sfm: [500, 900],  chipLoad: [0.004, 0.008] },
  acrylic:     { label: 'Acrylic / Plexiglass',      sfm: [500, 800],  chipLoad: [0.003, 0.006] },
  hdpe:        { label: 'HDPE Plastic',               sfm: [600, 1000], chipLoad: [0.005, 0.010] },
  aluminum:    { label: 'Aluminum (6061)',             sfm: [200, 500],  chipLoad: [0.001, 0.003] },
  brass:       { label: 'Brass',                      sfm: [150, 350],  chipLoad: [0.001, 0.003] },
  mild_steel:  { label: 'Mild Steel',                 sfm: [60, 120],   chipLoad: [0.001, 0.002] },
  foam:        { label: 'Foam (XPS, EVA)',             sfm: [800, 1500], chipLoad: [0.010, 0.020] },
  carbon_fiber:{ label: 'Carbon Fiber',                sfm: [200, 400],  chipLoad: [0.002, 0.004] },
};

/** Common bit profiles */
export const BITS = {
  '1f_upcut':    { label: '1-flute upcut',     flutes: 1, type: 'upcut' },
  '2f_upcut':    { label: '2-flute upcut',     flutes: 2, type: 'upcut' },
  '2f_downcut':  { label: '2-flute downcut',   flutes: 2, type: 'downcut' },
  '3f_upcut':    { label: '3-flute upcut',     flutes: 3, type: 'upcut' },
  '1f_ballnose': { label: '1-flute ball nose', flutes: 1, type: 'ballnose' },
  'vbit_60':     { label: '60° V-bit',         flutes: 2, type: 'vbit' },
  'vbit_90':     { label: '90° V-bit',         flutes: 2, type: 'vbit' },
};

/**
 * Calculate feeds and speeds.
 * @param {Object} params
 * @param {string} params.materialKey
 * @param {string} params.bitKey
 * @param {number} params.bitDiameter - mm
 * @param {number} params.maxRPM - spindle max
 * @returns {{ rpm, feedRate, chipLoad, depthOfCut, stepover, warnings[], explanations[] }}
 */
export function calculate(params) {
  const mat = MATERIALS[params.materialKey];
  const bit = BITS[params.bitKey];
  if (!mat || !bit) return null;

  const d_mm = params.bitDiameter;
  const d_in = d_mm / 25.4;
  const maxRPM = params.maxRPM || 24000;
  const flutes = bit.flutes;

  // Target SFM (middle of range)
  const targetSFM = (mat.sfm[0] + mat.sfm[1]) / 2;
  // RPM = SFM * 12 / (π * diameter_inches)
  let rpm = Math.round((targetSFM * 12) / (Math.PI * d_in));
  rpm = Math.min(rpm, maxRPM);

  // Chip load (middle of range)
  const chipLoad = (mat.chipLoad[0] + mat.chipLoad[1]) / 2;
  // Feed rate = RPM × flutes × chip load (inches/min → mm/min)
  const feedRate_ipm = rpm * flutes * chipLoad;
  const feedRate = Math.round(feedRate_ipm * 25.4);

  // Depth of cut: typically 50% of bit diameter for wood, less for metal
  const depthFactor = ['aluminum','brass','mild_steel','carbon_fiber'].includes(params.materialKey) ? 0.25 : 0.5;
  const depthOfCut = Math.round(d_mm * depthFactor * 10) / 10;

  // Stepover: 40-60% of bit diameter
  const stepover = Math.round(d_mm * 0.45 * 10) / 10;

  // Warnings
  const warnings = [];
  if (rpm >= maxRPM) warnings.push(`RPM capped at spindle maximum (${maxRPM}). Ideal RPM would be higher — consider a larger bit.`);
  if (chipLoad < mat.chipLoad[0]) warnings.push('Chip load is below minimum — risk of rubbing and heat buildup.');
  if (feedRate > 5000 && params.materialKey === 'aluminum') warnings.push('High feed rate for aluminum. Start slower and increase gradually.');

  // Explanations
  const explanations = [
    `RPM: Target SFM of ${targetSFM} with a ${d_mm}mm bit gives ${rpm} RPM.`,
    `Feed rate: ${rpm} RPM × ${flutes} flutes × ${chipLoad.toFixed(4)}" chip load = ${feedRate} mm/min.`,
    `Depth of cut: ${(depthFactor*100).toFixed(0)}% of bit diameter (${d_mm}mm) = ${depthOfCut}mm per pass.`,
    `Stepover: 45% of bit diameter = ${stepover}mm (good balance of speed and finish quality).`,
    `Chip load: ${(chipLoad*25.4).toFixed(3)}mm — within safe range for ${mat.label}.`,
  ];

  return { rpm, feedRate, chipLoad: Math.round(chipLoad*10000)/10000, depthOfCut, stepover, warnings, explanations, material: mat.label, bit: bit.label };
}
