/* ═══════════════════════════════════════════════════════
   PromptDrop — AI water footprint engine

   Model
   -----
   water = energy × (WUE + EWIF)

     energy  Wh per task, by task type (published measurements vary
             by ~10×, so every constant is a low/typical/high band)
     WUE     on-site datacenter cooling water, L/kWh
     EWIF    off-site water consumed generating the electricity, L/kWh

   The on-site/off-site split is the whole reason public figures
   disagree by 100× ("five drops" counts cooling only; "a bottle per
   email" adds electricity-generation water). This engine always
   reports both, separately and combined.

   Scope: OPERATIONAL water only. Embodied water (chip fabrication,
   datacenter construction, model training amortization) is excluded —
   see the About page for why.

   Sources (verify yearly — see docs/automation.md):
   - Google (Aug 2025): median Gemini text prompt = 0.24 Wh,
     0.26 mL water, 0.03 gCO2e.
   - OpenAI / Altman (Jun 2025): average ChatGPT query ≈ 0.34 Wh,
     ≈ 0.32 mL ("one fifteenth of a teaspoon").
   - Li, Yang, Islam, Ren (UC Riverside/UT Arlington), "Making AI
     Less Thirsty": GPT-3 era ≈ 500 mL per 10–50 responses incl.
     electricity-generation water.
   - AWS 2025 fleet WUE 0.12 L/kWh; Microsoft FY2025 0.30 L/kWh;
     industry average ≈ 0.84 L/kWh; evaporative cooling in hot/dry
     climates approaches 1.8+ L/kWh.
   - NREL/Macknick et al.: US grid water consumption intensity for
     electricity generation ≈ 0.5–4 L/kWh depending on mix
     (hydro-heavy grids much higher; wind/solar near zero).
   - Hugging Face / Luccioni et al.: image generation ≈ 3 Wh/image
     (diffusion, single image, consumer-scale models).
   - MIT Tech Review (2025): 5-second AI video clip estimates range
     from tens of Wh to ≈ 950 Wh (3.4 MJ) for research-scale models.
   ═══════════════════════════════════════════════════════ */

export interface Band {
  low: number;
  typical: number;
  high: number;
}

export interface TaskType {
  id: string;
  label: string;
  /** Input hint shown next to the field */
  unit: string;
  /** Wh per unit */
  energyWh: Band;
}

/** Per-task energy bands (Wh per unit). */
export const TASK_TYPES: TaskType[] = [
  {
    id: "chat",
    label: "Chat prompts",
    unit: "prompts / day",
    energyWh: { low: 0.2, typical: 0.34, high: 3 },
  },
  {
    id: "reasoning",
    label: "Long / reasoning tasks",
    unit: "tasks / day",
    energyWh: { low: 1, typical: 3.5, high: 15 },
  },
  {
    id: "image",
    label: "Images generated",
    unit: "images / day",
    energyWh: { low: 0.5, typical: 3, high: 8 },
  },
  {
    id: "video",
    label: "Video clips (~5 s)",
    unit: "clips / day",
    energyWh: { low: 20, typical: 200, high: 950 },
  },
];

/** On-site datacenter cooling water, L/kWh. */
export const WUE: Band = { low: 0.12, typical: 0.4, high: 1.8 };

/** Off-site electricity-generation water, L/kWh. */
export const EWIF: Band = { low: 0.5, typical: 1.8, high: 4.0 };

export interface Usage {
  /** taskTypeId → count per day */
  [taskId: string]: number;
}

export interface WaterResult {
  /** Wh per day */
  energyWhPerDay: Band;
  /** liters per day, cooling only */
  onsiteLPerDay: Band;
  /** liters per day, electricity-generation only */
  offsiteLPerDay: Band;
  /** liters per day, combined */
  totalLPerDay: Band;
  /** liters per year, combined */
  totalLPerYear: Band;
}

function mapBand(b: Band, fn: (n: number) => number): Band {
  return { low: fn(b.low), typical: fn(b.typical), high: fn(b.high) };
}

function addBands(a: Band, b: Band): Band {
  return { low: a.low + b.low, typical: a.typical + b.typical, high: a.high + b.high };
}

export function calcWater(usage: Usage): WaterResult {
  let energy: Band = { low: 0, typical: 0, high: 0 };
  for (const t of TASK_TYPES) {
    const count = Math.max(0, usage[t.id] ?? 0);
    energy = addBands(energy, mapBand(t.energyWh, (wh) => wh * count));
  }
  // Low scenario pairs low energy with low water intensity, high with high —
  // an intentional envelope (worst datacenter × worst grid), not a
  // statistical estimate. The typical column is the number to quote.
  const onsiteL: Band = {
    low: (energy.low / 1000) * WUE.low,
    typical: (energy.typical / 1000) * WUE.typical,
    high: (energy.high / 1000) * WUE.high,
  };
  const offsiteL: Band = {
    low: (energy.low / 1000) * EWIF.low,
    typical: (energy.typical / 1000) * EWIF.typical,
    high: (energy.high / 1000) * EWIF.high,
  };
  const totalL = addBands(onsiteL, offsiteL);
  return {
    energyWhPerDay: energy,
    onsiteLPerDay: onsiteL,
    offsiteLPerDay: offsiteL,
    totalLPerDay: totalL,
    totalLPerYear: mapBand(totalL, (l) => l * 365),
  };
}

/* ── Comparisons ──
   Everyday water uses, liters. Direct-use figures are utility-grade
   averages; food/goods figures are lifecycle (virtual water) numbers
   from the Water Footprint Network — flagged as such in the UI. */
export interface Comparison {
  id: string;
  label: string;
  liters: number;
  lifecycle: boolean;
}

export const COMPARISONS: Comparison[] = [
  { id: "bottle", label: "0.5 L water bottle", liters: 0.5, lifecycle: false },
  { id: "flush", label: "one toilet flush", liters: 6, lifecycle: false },
  { id: "shower", label: "one 8-minute shower", liters: 65, lifecycle: false },
  { id: "coffee", label: "one cup of coffee (grown + brewed)", liters: 130, lifecycle: true },
  { id: "burger", label: "one beef burger (lifecycle)", liters: 1650, lifecycle: true },
];

export interface ComparisonResult extends Comparison {
  /** how many of this item the annual footprint equals */
  count: number;
}

export function compare(litersPerYear: number): ComparisonResult[] {
  return COMPARISONS.map((c) => ({ ...c, count: litersPerYear / c.liters }));
}

/** "Your year of AI ≈ N seconds of showering" — the single most
    grounding number we can show. 65 L per 8-min shower ⇒ 0.135 L/s. */
export function showerSeconds(litersPerYear: number): number {
  return litersPerYear / (65 / (8 * 60));
}

/* ── Formatting helpers ── */
export function fmtLiters(l: number): string {
  if (l < 1) {
    const ml = l * 1000;
    return `${ml < 10 ? ml.toFixed(1) : String(Math.round(ml))} mL`;
  }
  if (l < 100) return `${l.toFixed(1)} L`;
  return `${Math.round(l).toLocaleString("en-US")} L`;
}

export function fmtBand(b: Band, fmt: (n: number) => string = fmtLiters): string {
  return `${fmt(b.low)} – ${fmt(b.high)}`;
}

export function fmtEnergy(wh: number): string {
  if (wh < 1000) return `${wh < 10 ? wh.toFixed(1) : Math.round(wh)} Wh`;
  return `${(wh / 1000).toFixed(wh < 10000 ? 1 : 0)} kWh`;
}
