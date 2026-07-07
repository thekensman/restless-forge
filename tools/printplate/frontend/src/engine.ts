// @ts-nocheck
/* PrintPlate — engine.js: Bed adhesion troubleshooter (browser-only) */

export const PRINTERS = {
  ender3_v2: { label: 'Creality Ender 3 V2/V3', beds: ['glass','pei_smooth','pei_textured','magnetic'] },
  prusa_mk4: { label: 'Prusa MK4/MK3S+', beds: ['pei_smooth','pei_textured','satin'] },
  bambu_p1s: { label: 'Bambu Lab P1S/P1P', beds: ['pei_smooth','pei_textured','cool_plate'] },
  bambu_a1:  { label: 'Bambu Lab A1/A1 Mini', beds: ['pei_smooth','pei_textured'] },
  voron_24:  { label: 'Voron 2.4', beds: ['pei_smooth','pei_textured','spring_steel'] },
  anycubic:  { label: 'Anycubic Kobra 2/3', beds: ['pei_textured','magnetic'] },
  elegoo:    { label: 'Elegoo Neptune 4', beds: ['pei_textured','glass'] },
};

export const BED_SURFACES = {
  glass: { label: 'Glass', prep: 'Clean with IPA, apply glue stick or hairspray for PLA' },
  pei_smooth: { label: 'Smooth PEI', prep: 'Wipe with IPA between prints. Occasional wash with soap and water.' },
  pei_textured: { label: 'Textured PEI', prep: 'IPA wipe. No adhesives needed for PLA/PETG.' },
  satin: { label: 'Satin powder-coated', prep: 'IPA wipe. PETG may bond too strongly — use glue stick as release agent.' },
  magnetic: { label: 'Magnetic flex plate', prep: 'IPA wipe. Flex plate to release prints.' },
  cool_plate: { label: 'Cool Plate (PLA only)', prep: 'IPA wipe. PLA only — not suitable for PETG/ABS.' },
  spring_steel: { label: 'Spring steel', prep: 'IPA wipe. Flex to release.' },
};

export const FILAMENTS = {
  pla:  { label: 'PLA',  bedTemp: [55, 65], nozzleTemp: [200, 220] },
  petg: { label: 'PETG', bedTemp: [70, 85], nozzleTemp: [225, 250] },
  abs:  { label: 'ABS',  bedTemp: [95, 110], nozzleTemp: [230, 260] },
  tpu:  { label: 'TPU',  bedTemp: [40, 60], nozzleTemp: [220, 240] },
  asa:  { label: 'ASA',  bedTemp: [90, 110], nozzleTemp: [235, 260] },
};

export const PROBLEMS = {
  not_sticking: 'Print not sticking to bed at all',
  corner_lift: 'Corners lifting / warping',
  center_only: 'Only sticks in centre, edges lift',
  elephant_foot: 'First layer squished / elephant foot',
  one_corner: 'One corner lifting (rest is fine)',
  poor_first: 'First layer lines not bonding to each other',
  too_stuck: 'Print stuck too hard — can\'t remove',
};

/** Generate ranked fix checklist */
export function diagnose(printerKey, bedKey, filamentKey, problemKey) {
  const printer = PRINTERS[printerKey];
  const bed = BED_SURFACES[bedKey];
  const fil = FILAMENTS[filamentKey];
  if (!printer || !bed || !fil) return [];

  const fixes = [];
  const addFix = (priority, title, detail) => fixes.push({ priority, title, detail });

  // Universal fixes
  addFix(1, 'Clean the bed', `Wipe with 90%+ IPA. ${bed.prep}`);
  addFix(2, 'Check bed temperature', `Recommended: ${fil.bedTemp[0]}–${fil.bedTemp[1]}°C for ${fil.label} on ${bed.label}.`);
  addFix(3, 'Check Z-offset', 'First layer should be slightly squished — look for a continuous, slightly transparent line. Adjust Z-offset down by -0.02mm increments.');

  // Problem-specific
  if (problemKey === 'not_sticking') {
    addFix(1, 'Increase bed temperature', `Try ${fil.bedTemp[1]}°C (top of range for ${fil.label}).`);
    addFix(2, 'Lower Z-offset', 'Nozzle may be too far from bed. Lower by -0.05mm.');
    addFix(3, 'Reduce first layer speed', 'Set first layer speed to 15-25 mm/s.');
    addFix(4, 'Increase first layer width', 'Set first layer line width to 120-150% of nozzle diameter.');
    if (bedKey === 'glass') addFix(2, 'Apply adhesive', 'Use glue stick (Elmer\'s purple) or hairspray on glass.');
  }
  if (problemKey === 'corner_lift') {
    addFix(1, 'Add brim', 'Add 5-8mm brim in slicer for more bed contact.');
    addFix(2, 'Reduce cooling', 'Turn off part cooling fan for first 3-5 layers.');
    if (['abs','asa'].includes(filamentKey)) addFix(1, 'Use enclosure', 'ABS/ASA require an enclosure to prevent warping from temperature differential.');
    addFix(3, 'Increase bed temp', `Try ${fil.bedTemp[1] + 5}°C — slightly above range can help adhesion.`);
  }
  if (problemKey === 'elephant_foot') {
    addFix(1, 'Raise Z-offset', 'Nozzle is too close. Raise Z-offset by +0.02–0.05mm.');
    addFix(2, 'Lower bed temperature', `Try ${fil.bedTemp[0]}°C. Excess heat softens the first layer.`);
    addFix(3, 'Enable elephant foot compensation', 'Most slicers have this setting (0.1-0.3mm).');
  }
  if (problemKey === 'one_corner') {
    addFix(1, 'Re-level bed', 'The low corner needs to be raised. Run bed leveling procedure.');
    addFix(2, 'Check for bed warp', 'Place a straight edge across the bed. If there\'s a gap, the bed may be warped.');
    addFix(3, 'Use mesh bed leveling', 'Enable ABL/mesh leveling if your printer supports it.');
  }
  if (problemKey === 'too_stuck') {
    addFix(1, 'Wait for bed to cool', 'Most surfaces release prints at room temperature.');
    addFix(2, 'Raise Z-offset slightly', 'First layer may be too squished. Raise by +0.02mm.');
    if (filamentKey === 'petg' && ['pei_smooth','satin'].includes(bedKey)) {
      addFix(1, 'Use glue stick as release agent', 'PETG bonds chemically to PEI. Glue stick acts as a separator.');
    }
  }

  // Sort by priority
  fixes.sort((a, b) => a.priority - b.priority);
  return fixes;
}
