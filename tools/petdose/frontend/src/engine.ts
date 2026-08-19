// @ts-nocheck
/* PetDose — engine.js: Pet medication dosage calculator (browser-only) */

export const SPECIES = {
  dog: { label: 'Dog', weightRange: [0.5, 90] },
  cat: { label: 'Cat', weightRange: [0.5, 12] },
};

/* Annual dosing sanity pass per docs/automation.md — NEVER change dose
   values in an automated refresh; if any reference disagrees, open a
   blocking issue for veterinary review and leave the values untouched.
   Bump only after the pass; read by scripts/check-data-freshness.mjs. */
export const DATA_VERIFIED_YEAR = 2026;

export const MEDICATIONS = [
  { id:'benadryl', name:'Benadryl (Diphenhydramine)', species:['dog','cat'],
    dog: { dosePerKg: 2, unit:'mg', frequency:'Every 8-12 hours', maxDaily: 3 },
    cat: { dosePerKg: 1, unit:'mg', frequency:'Every 8-12 hours', maxDaily: 2 },
    warnings:['May cause drowsiness','Do not use "D" formulations (pseudoephedrine)','Consult vet for puppies under 12 weeks'],
    forms: [{type:'tablet', strengths:[25]}, {type:'liquid', strengths:[12.5], perMl:true}] },
  { id:'pepcid', name:'Pepcid (Famotidine)', species:['dog','cat'],
    dog: { dosePerKg: 0.5, unit:'mg', frequency:'Every 12-24 hours', maxDaily: 2 },
    cat: { dosePerKg: 0.5, unit:'mg', frequency:'Every 12-24 hours', maxDaily: 2 },
    warnings:['Give on empty stomach for best effect','Safe for short-term use'],
    forms: [{type:'tablet', strengths:[10,20]}] },
  { id:'cerenia', name:'Cerenia (Maropitant)', species:['dog'],
    dog: { dosePerKg: 2, unit:'mg', frequency:'Every 24 hours', maxDaily: 1 },
    warnings:['Prescription medication — confirm with vet','Not for puppies under 16 weeks','Do not use for more than 5 consecutive days'],
    forms: [{type:'tablet', strengths:[16,24,60]}] },
  { id:'frontline', name:'Frontline Plus (Fipronil)', species:['dog','cat'],
    dog: { doseByWeight: [{min:0,max:10,dose:'0.67ml'},{min:10,max:20,dose:'1.34ml'},{min:20,max:40,dose:'2.68ml'},{min:40,max:90,dose:'4.02ml'}] },
    cat: { doseByWeight: [{min:0,max:12,dose:'0.5ml'}] },
    warnings:['Apply to skin between shoulder blades','Do not use dog product on cats — toxic','Wait 24hrs before bathing'],
    forms: [{type:'topical', strengths:[]}], isTopical: true },
  { id:'dewormer', name:'Panacur (Fenbendazole)', species:['dog','cat'],
    dog: { dosePerKg: 50, unit:'mg', frequency:'Once daily for 3 days', maxDaily: 1 },
    cat: { dosePerKg: 50, unit:'mg', frequency:'Once daily for 3 days', maxDaily: 1 },
    warnings:['Give with food','Safe for pregnant animals','May need to repeat in 2-3 weeks'],
    forms: [{type:'granules', strengths:[222], perGram:true}] },
  { id:'metronidazole', name:'Metronidazole (Flagyl)', species:['dog','cat'],
    dog: { dosePerKg: 12.5, unit:'mg', frequency:'Every 12 hours', maxDaily: 2 },
    cat: { dosePerKg: 10, unit:'mg', frequency:'Every 12 hours', maxDaily: 2 },
    warnings:['Prescription only','Do not use in pregnant animals','May cause neurological side effects at high doses','Give with food'],
    forms: [{type:'tablet', strengths:[250,500]}] },
];

/**
 * Calculate dosage for a medication.
 * @param {string} medId
 * @param {string} species - 'dog' or 'cat'
 * @param {number} weightKg
 * @returns {{ dose, unit, frequency, tablets, warnings, vetDisclaimer }}
 */
export function calculateDose(medId, species, weightKg) {
  const med = MEDICATIONS.find(m => m.id === medId);
  if (!med || !med.species.includes(species)) return null;
  const spec = med[species];
  if (!spec) return null;

  // Weight-based topical
  if (med.isTopical && spec.doseByWeight) {
    const range = spec.doseByWeight.find(r => weightKg >= r.min && weightKg < r.max);
    return {
      dose: range ? range.dose : 'Consult vet — outside weight range',
      unit: '', frequency: 'Monthly', tablets: null,
      warnings: med.warnings,
      vetDisclaimer: 'Always confirm dosages with your veterinarian.',
    };
  }

  const totalDose = Math.round(spec.dosePerKg * weightKg * 10) / 10;
  // Tablet guidance. Quarter tablets are the smallest practical split; if the
  // target dose is below a quarter of the SMALLEST available strength, a
  // tablet cannot deliver it safely — send the owner to liquid/compounded
  // forms instead of printing "0 tablets".
  let tabletInfo = null;
  if (med.forms[0]?.type === 'tablet') {
    const strengths = med.forms[0].strengths;
    const smallest = Math.min(...strengths);
    if (totalDose < smallest / 4) {
      tabletInfo = `Dose is below ¼ of the smallest ${smallest}${spec.unit} tablet — ask your vet about a liquid or compounded form.`;
    } else {
      // Choose the strength whose quarter-rounded count lands closest to the target.
      let best = null;
      for (const s of strengths) {
        const count = Math.max(0.25, Math.round((totalDose / s) * 4) / 4);
        const delivered = count * s;
        const err = Math.abs(delivered - totalDose);
        if (!best || err < best.err) best = { s, count, delivered, err };
      }
      tabletInfo = `${best.count} × ${best.s}${spec.unit} tablet${best.count !== 1 ? 's' : ''} (${best.delivered}${spec.unit})`;
      if (best.err / totalDose > 0.15) {
        tabletInfo += ' — more than 15% off the target dose; confirm with your vet.';
      }
    }
  }

  return {
    dose: totalDose, unit: spec.unit, frequency: spec.frequency,
    maxDaily: spec.maxDaily ?? null,
    maxDailyNote: spec.maxDaily
      ? `Do not exceed ${spec.maxDaily} dose${spec.maxDaily !== 1 ? 's' : ''} in 24 hours (${Math.round(totalDose * spec.maxDaily * 10) / 10}${spec.unit} total).`
      : null,
    tablets: tabletInfo, warnings: med.warnings,
    vetDisclaimer: 'Always confirm dosages with your veterinarian. This is a reference tool, not medical advice.',
  };
}

/** Get medications for a species */
export function getMedicationsForSpecies(species) {
  return MEDICATIONS.filter(m => m.species.includes(species));
}

/** Convert weight: lbs → kg */
export function lbsToKg(lbs) { return Math.round(lbs * 0.4536 * 100) / 100; }
/** Convert weight: kg → lbs */
export function kgToLbs(kg) { return Math.round(kg * 2.2046 * 100) / 100; }
