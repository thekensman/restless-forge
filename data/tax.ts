/* data/tax.ts — shared, year-keyed US tax data.
 *
 * SINGLE SOURCE OF TRUTH for tax constants used across tools. Consumers
 * import the CURRENT alias (or a specific year from TAX_YEARS). Bundled
 * into each consuming tool at build time by Vite — nothing is fetched
 * at runtime, so the client-only rule is unchanged.
 *
 * HISTORY CONVENTION: the annual refresh (docs/automation.md) APPENDS a
 * new year to TAX_YEARS and bumps CURRENT_TAX_YEAR — prior years stay,
 * so past values can be referenced or reverted without git archaeology.
 *
 * Current consumers: what-is-my-time-worth (engine.ts).
 * The hidden finance tools (side-hustle-reality, is-my-raise-real)
 * migrate here during their launch-prep TS refactor.
 */

export interface TaxBracket {
  limit: number;
  rate: number;
}

/** Single and married-filing-jointly values of one setting. */
export interface ByFilingStatus<T> {
  single: T;
  mfj: T;
}

/**
 * A deduction, exemption or credit. A bare number never changes with
 * income; otherwise the amount shrinks with gross income in one of two ways.
 */
export type Allowance =
  | number
  | {
      amount: number;
      /** Reduced by `rate` per dollar of income over `start`, never below `floor` (default 0). */
      phaseOut?: { start: number; rate: number; floor?: number };
      /** Ascending: once income is over `over`, the allowance becomes `amount`. */
      steps?: { over: number; amount: number }[];
    };

export interface StateIncomeTax {
  id: string;
  name: string;
  /** Brackets on state taxable income. Empty: the state does not tax wages. */
  brackets: ByFilingStatus<TaxBracket[]>;
  /** Taken off income. Omitted: none. */
  standardDeduction?: ByFilingStatus<Allowance>;
  /** Personal exemption taken off income. */
  exemption?: ByFilingStatus<Allowance>;
  /** Personal exemption (or, in Utah, standard deduction) taken off the tax instead. */
  exemptionCredit?: ByFilingStatus<Allowance>;
  /** Arkansas: above `over`, these brackets apply to all taxable income instead. */
  highIncome?: { over: number; brackets: TaxBracket[] };
  /** Ohio: a flat amount added once taxable income is over `over`. */
  addedTax?: { over: number; amount: number };
}

export interface TaxYearData {
  source: string;
  ssWageBase: number;
  ficaSocialSecurityRate: number;
  ficaMedicareRate: number;
  medicareSurtaxRate: number;
  medicareSurtaxThreshold: number;
  bracketsSingle: TaxBracket[];
  bracketsMfj: TaxBracket[];
  standardDeductionSingle: number;
  standardDeductionMfj: number;
  /** Self-employment tax rate (SS + Medicare), statutory — 15.3% since 1990. */
  selfEmploymentRate: number;
  /** Net-earnings factor: SE tax applies to 92.35% of net SE income. */
  selfEmploymentNetFactor: number;
  /** The 50 states and DC. Local income taxes, credits other than the
   *  personal exemption, benefit recapture and deducting federal tax are
   *  left out. Sources and the yearly refresh: docs/automation.md. */
  states: StateIncomeTax[];
}

const NONE: ByFilingStatus<TaxBracket[]> = { single: [], mfj: [] };
const same = (brackets: TaxBracket[]): ByFilingStatus<TaxBracket[]> => ({ single: brackets, mfj: brackets });

export const CURRENT_TAX_YEAR = 2026;

export const TAX_YEARS: Record<number, TaxYearData> = {
  2026: {
    source: "IRS Rev. Proc. 2025-32; SSA 2026 wage-base announcement; Tax Foundation 2026 state table, cross-checked against PolicyEngine US and state sources",
    ssWageBase: 184_500,
    ficaSocialSecurityRate: 0.062,
    ficaMedicareRate: 0.0145,
    medicareSurtaxRate: 0.009,
    medicareSurtaxThreshold: 200_000,
    bracketsSingle: [
      { limit: 12_400, rate: 0.10 },
      { limit: 50_400, rate: 0.12 },
      { limit: 105_700, rate: 0.22 },
      { limit: 201_775, rate: 0.24 },
      { limit: 256_225, rate: 0.32 },
      { limit: 640_600, rate: 0.35 },
      { limit: Infinity, rate: 0.37 },
    ],
    bracketsMfj: [
      { limit: 24_800, rate: 0.10 },
      { limit: 100_800, rate: 0.12 },
      { limit: 211_400, rate: 0.22 },
      { limit: 403_550, rate: 0.24 },
      { limit: 512_450, rate: 0.32 },
      { limit: 768_700, rate: 0.35 },
      { limit: Infinity, rate: 0.37 },
    ],
    standardDeductionSingle: 16_100,
    standardDeductionMfj: 32_200,
    selfEmploymentRate: 0.153,
    selfEmploymentNetFactor: 0.9235,
    // Tax Foundation, "State Individual Income Tax Rates and Brackets, 2026",
    // cross-checked against PolicyEngine US 2.49.4. Where they disagreed,
    // the state's own 2026 statute or publication decided; the comment
    // names it. Values marked "2025" are the latest the state has published.
    states: [
      // Deduction falls $25 ($175 joint) per $500 of AGI over $25,999, so a straight line from $25,500.
      {
        id: "AL",
        name: "Alabama",
        brackets: {
          single: [{ limit: 500, rate: 0.02 }, { limit: 3000, rate: 0.04 }, { limit: Infinity, rate: 0.05 }],
          mfj: [{ limit: 1000, rate: 0.02 }, { limit: 6000, rate: 0.04 }, { limit: Infinity, rate: 0.05 }],
        },
        standardDeduction: {
          single: { amount: 3000, phaseOut: { start: 25_500, rate: 25 / 500, floor: 2500 } },
          mfj: { amount: 8500, phaseOut: { start: 25_500, rate: 175 / 500, floor: 5000 } },
        },
        exemption: { single: 1500, mfj: 3000 },
      },
      { id: "AK", name: "Alaska", brackets: NONE },
      {
        id: "AZ",
        name: "Arizona",
        brackets: same([{ limit: Infinity, rate: 0.025 }]),
        standardDeduction: { single: 16_100, mfj: 32_200 },
      },
      // Act 1 of 2026. The bracket adjustment between $94,701 and $97,600 is left out.
      {
        id: "AR",
        name: "Arkansas",
        brackets: same([{ limit: 5600, rate: 0 }, { limit: 11_200, rate: 0.02 }, { limit: 16_000, rate: 0.03 }, { limit: 26_400, rate: 0.034 }, { limit: Infinity, rate: 0.037 }]),
        standardDeduction: { single: 2470, mfj: 4940 },
        exemptionCredit: { single: 29, mfj: 58 },
        highIncome: { over: 94_700, brackets: [{ limit: 4700, rate: 0.02 }, { limit: Infinity, rate: 0.037 }] },
      },
      // 2025 figures: FTB's own 2026 estimated-tax instructions use them. Top bracket includes the 1% mental health tax over $1M.
      {
        id: "CA",
        name: "California",
        brackets: {
          single: [{ limit: 11_079, rate: 0.01 }, { limit: 26_264, rate: 0.02 }, { limit: 41_452, rate: 0.04 }, { limit: 57_542, rate: 0.06 }, { limit: 72_724, rate: 0.08 }, { limit: 371_479, rate: 0.093 }, { limit: 445_771, rate: 0.103 }, { limit: 742_953, rate: 0.113 }, { limit: 1_000_000, rate: 0.123 }, { limit: Infinity, rate: 0.133 }],
          mfj: [{ limit: 22_158, rate: 0.01 }, { limit: 52_528, rate: 0.02 }, { limit: 82_904, rate: 0.04 }, { limit: 115_084, rate: 0.06 }, { limit: 145_448, rate: 0.08 }, { limit: 742_958, rate: 0.093 }, { limit: 891_542, rate: 0.103 }, { limit: 1_000_000, rate: 0.113 }, { limit: 1_485_906, rate: 0.123 }, { limit: Infinity, rate: 0.133 }],
        },
        standardDeduction: { single: 5706, mfj: 11_412 },
        exemptionCredit: {
          single: { amount: 153, phaseOut: { start: 252_203, rate: 6 / 2500 } },
          mfj: { amount: 306, phaseOut: { start: 504_411, rate: 12 / 2500 } },
        },
      },
      {
        id: "CO",
        name: "Colorado",
        brackets: same([{ limit: Infinity, rate: 0.044 }]),
        standardDeduction: { single: 16_100, mfj: 32_200 },
      },
      // The 2% bracket phase-out, benefit recapture and personal credits are left out.
      {
        id: "CT",
        name: "Connecticut",
        brackets: {
          single: [{ limit: 10_000, rate: 0.02 }, { limit: 50_000, rate: 0.045 }, { limit: 100_000, rate: 0.055 }, { limit: 200_000, rate: 0.06 }, { limit: 250_000, rate: 0.065 }, { limit: 500_000, rate: 0.069 }, { limit: Infinity, rate: 0.0699 }],
          mfj: [{ limit: 20_000, rate: 0.02 }, { limit: 100_000, rate: 0.045 }, { limit: 200_000, rate: 0.055 }, { limit: 400_000, rate: 0.06 }, { limit: 500_000, rate: 0.065 }, { limit: 1_000_000, rate: 0.069 }, { limit: Infinity, rate: 0.0699 }],
        },
        exemption: {
          single: { amount: 15_000, phaseOut: { start: 30_000, rate: 1 } },
          mfj: { amount: 24_000, phaseOut: { start: 48_000, rate: 1 } },
        },
      },
      {
        id: "DE",
        name: "Delaware",
        brackets: same([{ limit: 2000, rate: 0 }, { limit: 5000, rate: 0.022 }, { limit: 10_000, rate: 0.039 }, { limit: 20_000, rate: 0.048 }, { limit: 25_000, rate: 0.052 }, { limit: 60_000, rate: 0.0555 }, { limit: Infinity, rate: 0.066 }]),
        standardDeduction: { single: 3250, mfj: 6500 },
        exemptionCredit: { single: 110, mfj: 220 },
      },
      // DC's own deduction (D.C. Act 26-214), 2025 base; its 2026 cost-of-living increase is not yet published.
      {
        id: "DC",
        name: "District of Columbia",
        brackets: same([{ limit: 10_000, rate: 0.04 }, { limit: 40_000, rate: 0.06 }, { limit: 60_000, rate: 0.065 }, { limit: 250_000, rate: 0.085 }, { limit: 500_000, rate: 0.0925 }, { limit: 1_000_000, rate: 0.0975 }, { limit: Infinity, rate: 0.1075 }]),
        standardDeduction: { single: 15_000, mfj: 30_000 },
      },
      { id: "FL", name: "Florida", brackets: NONE },
      // HB 463 (2026).
      {
        id: "GA",
        name: "Georgia",
        brackets: same([{ limit: Infinity, rate: 0.0499 }]),
        standardDeduction: { single: 15_000, mfj: 30_000 },
      },
      // HRS 235-2.4(a)(2)(F): the 2026 deduction step.
      {
        id: "HI",
        name: "Hawaii",
        brackets: {
          single: [{ limit: 9600, rate: 0.014 }, { limit: 14_400, rate: 0.032 }, { limit: 19_200, rate: 0.055 }, { limit: 24_000, rate: 0.064 }, { limit: 36_000, rate: 0.068 }, { limit: 48_000, rate: 0.072 }, { limit: 125_000, rate: 0.076 }, { limit: 175_000, rate: 0.079 }, { limit: 225_000, rate: 0.0825 }, { limit: 275_000, rate: 0.09 }, { limit: 325_000, rate: 0.1 }, { limit: Infinity, rate: 0.11 }],
          mfj: [{ limit: 19_200, rate: 0.014 }, { limit: 28_800, rate: 0.032 }, { limit: 38_400, rate: 0.055 }, { limit: 48_000, rate: 0.064 }, { limit: 72_000, rate: 0.068 }, { limit: 96_000, rate: 0.072 }, { limit: 250_000, rate: 0.076 }, { limit: 350_000, rate: 0.079 }, { limit: 450_000, rate: 0.0825 }, { limit: 550_000, rate: 0.09 }, { limit: 650_000, rate: 0.1 }, { limit: Infinity, rate: 0.11 }],
        },
        standardDeduction: { single: 8000, mfj: 16_000 },
        exemption: { single: 1144, mfj: 2288 },
      },
      // 2025 bracket width; 2026 not yet published.
      {
        id: "ID",
        name: "Idaho",
        brackets: {
          single: [{ limit: 4811, rate: 0 }, { limit: Infinity, rate: 0.053 }],
          mfj: [{ limit: 9622, rate: 0 }, { limit: Infinity, rate: 0.053 }],
        },
        standardDeduction: { single: 16_100, mfj: 32_200 },
      },
      {
        id: "IL",
        name: "Illinois",
        brackets: same([{ limit: Infinity, rate: 0.0495 }]),
        exemption: {
          single: { amount: 2925, steps: [{ over: 250_000, amount: 0 }] },
          mfj: { amount: 5850, steps: [{ over: 500_000, amount: 0 }] },
        },
      },
      {
        id: "IN",
        name: "Indiana",
        brackets: same([{ limit: Infinity, rate: 0.0295 }]),
        exemption: { single: 1000, mfj: 2000 },
      },
      {
        id: "IA",
        name: "Iowa",
        brackets: same([{ limit: Infinity, rate: 0.038 }]),
        standardDeduction: { single: 16_100, mfj: 32_200 },
        exemptionCredit: { single: 40, mfj: 80 },
      },
      {
        id: "KS",
        name: "Kansas",
        brackets: {
          single: [{ limit: 23_000, rate: 0.052 }, { limit: Infinity, rate: 0.0558 }],
          mfj: [{ limit: 46_000, rate: 0.052 }, { limit: Infinity, rate: 0.0558 }],
        },
        standardDeduction: { single: 3605, mfj: 8240 },
        exemption: { single: 9160, mfj: 18_320 },
      },
      // Not doubled on a joint return.
      {
        id: "KY",
        name: "Kentucky",
        brackets: same([{ limit: Infinity, rate: 0.035 }]),
        standardDeduction: { single: 3360, mfj: 3360 },
      },
      // LDR Revenue Information Bulletin 26-019.
      {
        id: "LA",
        name: "Louisiana",
        brackets: same([{ limit: Infinity, rate: 0.03 }]),
        standardDeduction: { single: 12_838, mfj: 25_676 },
      },
      // Deduction from 36 M.R.S. 5124-C(1-C); phase-out start and the exemption are 2025 figures.
      {
        id: "ME",
        name: "Maine",
        brackets: {
          single: [{ limit: 27_400, rate: 0.058 }, { limit: 64_850, rate: 0.0675 }, { limit: Infinity, rate: 0.0715 }],
          mfj: [{ limit: 54_850, rate: 0.058 }, { limit: 129_750, rate: 0.0675 }, { limit: Infinity, rate: 0.0715 }],
        },
        standardDeduction: {
          single: { amount: 15_700, phaseOut: { start: 100_000, rate: 15_700 / 75_000 } },
          mfj: { amount: 31_400, phaseOut: { start: 200_050, rate: 31_400 / 150_000 } },
        },
        exemption: {
          single: { amount: 5150, phaseOut: { start: 341_000, rate: 5150 / 125_000 } },
          mfj: { amount: 10_300, phaseOut: { start: 409_150, rate: 10_300 / 125_000 } },
        },
      },
      // County income tax (2.25% to 3.3%) is left out.
      {
        id: "MD",
        name: "Maryland",
        brackets: {
          single: [{ limit: 1000, rate: 0.02 }, { limit: 2000, rate: 0.03 }, { limit: 3000, rate: 0.04 }, { limit: 100_000, rate: 0.0475 }, { limit: 125_000, rate: 0.05 }, { limit: 150_000, rate: 0.0525 }, { limit: 250_000, rate: 0.055 }, { limit: 500_000, rate: 0.0575 }, { limit: 1_000_000, rate: 0.0625 }, { limit: Infinity, rate: 0.065 }],
          mfj: [{ limit: 1000, rate: 0.02 }, { limit: 2000, rate: 0.03 }, { limit: 3000, rate: 0.04 }, { limit: 150_000, rate: 0.0475 }, { limit: 175_000, rate: 0.05 }, { limit: 225_000, rate: 0.0525 }, { limit: 300_000, rate: 0.055 }, { limit: 600_000, rate: 0.0575 }, { limit: 1_200_000, rate: 0.0625 }, { limit: Infinity, rate: 0.065 }],
        },
        standardDeduction: { single: 3350, mfj: 6700 },
        exemption: {
          single: { amount: 3200, steps: [{ over: 100_000, amount: 1600 }, { over: 125_000, amount: 800 }, { over: 150_000, amount: 0 }] },
          mfj: { amount: 6400, steps: [{ over: 150_000, amount: 3200 }, { over: 175_000, amount: 1600 }, { over: 200_000, amount: 0 }] },
        },
      },
      // 4% surtax as the top bracket; 2025 threshold.
      {
        id: "MA",
        name: "Massachusetts",
        brackets: same([{ limit: 1_083_150, rate: 0.05 }, { limit: Infinity, rate: 0.09 }]),
        exemption: { single: 4400, mfj: 8800 },
      },
      {
        id: "MI",
        name: "Michigan",
        brackets: same([{ limit: Infinity, rate: 0.0425 }]),
        exemption: { single: 5900, mfj: 11_800 },
      },
      {
        id: "MN",
        name: "Minnesota",
        brackets: {
          single: [{ limit: 33_310, rate: 0.0535 }, { limit: 109_430, rate: 0.068 }, { limit: 203_150, rate: 0.0785 }, { limit: Infinity, rate: 0.0985 }],
          mfj: [{ limit: 48_700, rate: 0.0535 }, { limit: 193_480, rate: 0.068 }, { limit: 337_930, rate: 0.0785 }, { limit: Infinity, rate: 0.0985 }],
        },
        standardDeduction: {
          single: { amount: 15_300, phaseOut: { start: 244_400, rate: 0.03, floor: 3060 } },
          mfj: { amount: 30_600, phaseOut: { start: 244_400, rate: 0.03, floor: 6120 } },
        },
      },
      {
        id: "MS",
        name: "Mississippi",
        brackets: same([{ limit: 10_000, rate: 0 }, { limit: Infinity, rate: 0.04 }]),
        standardDeduction: { single: 2300, mfj: 4600 },
        exemption: { single: 6000, mfj: 12_000 },
      },
      {
        id: "MO",
        name: "Missouri",
        brackets: same([{ limit: 1348, rate: 0 }, { limit: 2696, rate: 0.02 }, { limit: 4044, rate: 0.025 }, { limit: 5392, rate: 0.03 }, { limit: 6740, rate: 0.035 }, { limit: 8088, rate: 0.04 }, { limit: 9436, rate: 0.045 }, { limit: Infinity, rate: 0.047 }]),
        standardDeduction: { single: 16_100, mfj: 32_200 },
      },
      {
        id: "MT",
        name: "Montana",
        brackets: {
          single: [{ limit: 47_500, rate: 0.047 }, { limit: Infinity, rate: 0.0565 }],
          mfj: [{ limit: 95_000, rate: 0.047 }, { limit: Infinity, rate: 0.0565 }],
        },
        standardDeduction: { single: 16_100, mfj: 32_200 },
      },
      {
        id: "NE",
        name: "Nebraska",
        brackets: {
          single: [{ limit: 4130, rate: 0.0246 }, { limit: 24_760, rate: 0.0351 }, { limit: Infinity, rate: 0.0455 }],
          mfj: [{ limit: 8250, rate: 0.0246 }, { limit: 49_530, rate: 0.0351 }, { limit: Infinity, rate: 0.0455 }],
        },
        standardDeduction: { single: 8850, mfj: 17_700 },
        exemptionCredit: { single: 176, mfj: 352 },
      },
      { id: "NV", name: "Nevada", brackets: NONE },
      { id: "NH", name: "New Hampshire", brackets: NONE },
      {
        id: "NJ",
        name: "New Jersey",
        brackets: {
          single: [{ limit: 20_000, rate: 0.014 }, { limit: 35_000, rate: 0.0175 }, { limit: 40_000, rate: 0.035 }, { limit: 75_000, rate: 0.05525 }, { limit: 500_000, rate: 0.0637 }, { limit: 1_000_000, rate: 0.0897 }, { limit: Infinity, rate: 0.1075 }],
          mfj: [{ limit: 20_000, rate: 0.014 }, { limit: 50_000, rate: 0.0175 }, { limit: 70_000, rate: 0.0245 }, { limit: 80_000, rate: 0.035 }, { limit: 150_000, rate: 0.05525 }, { limit: 500_000, rate: 0.0637 }, { limit: 1_000_000, rate: 0.0897 }, { limit: Infinity, rate: 0.1075 }],
        },
        exemption: { single: 1000, mfj: 2000 },
      },
      {
        id: "NM",
        name: "New Mexico",
        brackets: {
          single: [{ limit: 5500, rate: 0.015 }, { limit: 16_500, rate: 0.032 }, { limit: 33_500, rate: 0.043 }, { limit: 66_500, rate: 0.047 }, { limit: 210_000, rate: 0.049 }, { limit: Infinity, rate: 0.059 }],
          mfj: [{ limit: 8000, rate: 0.015 }, { limit: 25_000, rate: 0.032 }, { limit: 50_000, rate: 0.043 }, { limit: 100_000, rate: 0.047 }, { limit: 315_000, rate: 0.049 }, { limit: Infinity, rate: 0.059 }],
        },
        standardDeduction: { single: 16_100, mfj: 32_200 },
      },
      // Supplemental tax (benefit recapture) and New York City / Yonkers tax are left out.
      {
        id: "NY",
        name: "New York",
        brackets: {
          single: [{ limit: 8500, rate: 0.039 }, { limit: 11_700, rate: 0.044 }, { limit: 13_900, rate: 0.0515 }, { limit: 80_650, rate: 0.054 }, { limit: 215_400, rate: 0.059 }, { limit: 1_077_550, rate: 0.0685 }, { limit: 5_000_000, rate: 0.0965 }, { limit: 25_000_000, rate: 0.103 }, { limit: Infinity, rate: 0.109 }],
          mfj: [{ limit: 17_150, rate: 0.039 }, { limit: 23_600, rate: 0.044 }, { limit: 27_900, rate: 0.0515 }, { limit: 161_550, rate: 0.054 }, { limit: 323_200, rate: 0.059 }, { limit: 2_155_350, rate: 0.0685 }, { limit: 5_000_000, rate: 0.0965 }, { limit: 25_000_000, rate: 0.103 }, { limit: Infinity, rate: 0.109 }],
        },
        standardDeduction: { single: 8000, mfj: 16_050 },
      },
      {
        id: "NC",
        name: "North Carolina",
        brackets: same([{ limit: Infinity, rate: 0.0399 }]),
        standardDeduction: { single: 12_750, mfj: 25_500 },
      },
      // 2026 Form ND-1ES schedules.
      {
        id: "ND",
        name: "North Dakota",
        brackets: {
          single: [{ limit: 49_575, rate: 0 }, { limit: 250_400, rate: 0.0195 }, { limit: Infinity, rate: 0.025 }],
          mfj: [{ limit: 82_800, rate: 0 }, { limit: 304_850, rate: 0.0195 }, { limit: Infinity, rate: 0.025 }],
        },
        standardDeduction: { single: 16_100, mfj: 32_200 },
      },
      // ORC 5747.02: $332 plus 2.75% over $26,050. Municipal income tax is left out.
      {
        id: "OH",
        name: "Ohio",
        brackets: same([{ limit: 26_050, rate: 0 }, { limit: Infinity, rate: 0.0275 }]),
        exemption: {
          single: { amount: 2400, steps: [{ over: 40_000, amount: 2150 }, { over: 80_000, amount: 1900 }, { over: 500_000, amount: 0 }] },
          mfj: { amount: 4800, steps: [{ over: 40_000, amount: 4300 }, { over: 80_000, amount: 3800 }, { over: 500_000, amount: 0 }] },
        },
        addedTax: { over: 26_050, amount: 332 },
      },
      {
        id: "OK",
        name: "Oklahoma",
        brackets: {
          single: [{ limit: 3750, rate: 0 }, { limit: 4900, rate: 0.025 }, { limit: 7200, rate: 0.035 }, { limit: Infinity, rate: 0.045 }],
          mfj: [{ limit: 7500, rate: 0 }, { limit: 9800, rate: 0.025 }, { limit: 14_400, rate: 0.035 }, { limit: Infinity, rate: 0.045 }],
        },
        standardDeduction: { single: 6350, mfj: 12_700 },
        exemption: { single: 1000, mfj: 2000 },
      },
      // 2026 withholding formulas (150-206-436). The federal tax subtraction is left out.
      {
        id: "OR",
        name: "Oregon",
        brackets: {
          single: [{ limit: 4550, rate: 0.0475 }, { limit: 11_400, rate: 0.0675 }, { limit: 125_000, rate: 0.0875 }, { limit: Infinity, rate: 0.099 }],
          mfj: [{ limit: 9100, rate: 0.0475 }, { limit: 22_800, rate: 0.0675 }, { limit: 250_000, rate: 0.0875 }, { limit: Infinity, rate: 0.099 }],
        },
        standardDeduction: { single: 2910, mfj: 5820 },
        exemptionCredit: {
          single: { amount: 263, steps: [{ over: 100_000, amount: 0 }] },
          mfj: { amount: 526, steps: [{ over: 200_000, amount: 0 }] },
        },
      },
      // Local earned income tax is left out.
      {
        id: "PA",
        name: "Pennsylvania",
        brackets: same([{ limit: Infinity, rate: 0.0307 }]),
      },
      // Deduction and exemption phase out between $261,000 and $290,800.
      {
        id: "RI",
        name: "Rhode Island",
        brackets: same([{ limit: 82_050, rate: 0.0375 }, { limit: 186_450, rate: 0.0475 }, { limit: Infinity, rate: 0.0599 }]),
        standardDeduction: {
          single: { amount: 11_200, phaseOut: { start: 261_000, rate: 11_200 / 29_800 } },
          mfj: { amount: 22_400, phaseOut: { start: 261_000, rate: 22_400 / 29_800 } },
        },
        exemption: {
          single: { amount: 5250, phaseOut: { start: 261_000, rate: 5250 / 29_800 } },
          mfj: { amount: 10_500, phaseOut: { start: 261_000, rate: 10_500 / 29_800 } },
        },
      },
      // H.4216 (2026): rates and the SC Income Adjusted Deduction.
      {
        id: "SC",
        name: "South Carolina",
        brackets: same([{ limit: 30_000, rate: 0.0199 }, { limit: Infinity, rate: 0.0521 }]),
        standardDeduction: {
          single: { amount: 15_000, phaseOut: { start: 40_000, rate: 15_000 / 55_000 } },
          mfj: { amount: 30_000, phaseOut: { start: 80_000, rate: 30_000 / 110_000 } },
        },
      },
      { id: "SD", name: "South Dakota", brackets: NONE },
      { id: "TN", name: "Tennessee", brackets: NONE },
      { id: "TX", name: "Texas", brackets: NONE },
      // SB 60 (2026). The credit is 6% of the federal standard deduction; phase-out start is the 2025 figure.
      {
        id: "UT",
        name: "Utah",
        brackets: same([{ limit: Infinity, rate: 0.0445 }]),
        exemptionCredit: {
          single: { amount: 966, phaseOut: { start: 18_213, rate: 0.013 } },
          mfj: { amount: 1932, phaseOut: { start: 36_426, rate: 0.013 } },
        },
      },
      // 2025 figures; 2026 not yet published. The 3%-of-AGI minimum is left out.
      {
        id: "VT",
        name: "Vermont",
        brackets: {
          single: [{ limit: 49_400, rate: 0.0335 }, { limit: 119_700, rate: 0.066 }, { limit: 249_700, rate: 0.076 }, { limit: Infinity, rate: 0.0875 }],
          mfj: [{ limit: 82_500, rate: 0.0335 }, { limit: 199_450, rate: 0.066 }, { limit: 304_000, rate: 0.076 }, { limit: Infinity, rate: 0.0875 }],
        },
        standardDeduction: { single: 7650, mfj: 15_300 },
        exemption: { single: 5300, mfj: 10_600 },
      },
      {
        id: "VA",
        name: "Virginia",
        brackets: same([{ limit: 3000, rate: 0.02 }, { limit: 5000, rate: 0.03 }, { limit: 17_000, rate: 0.05 }, { limit: Infinity, rate: 0.0575 }]),
        standardDeduction: { single: 8750, mfj: 17_500 },
        exemption: { single: 930, mfj: 1860 },
      },
      // Taxes capital gains only, not wages.
      { id: "WA", name: "Washington", brackets: NONE },
      // W. Va. Code 11-21-4j.
      {
        id: "WV",
        name: "West Virginia",
        brackets: same([{ limit: 10_000, rate: 0.0211 }, { limit: 25_000, rate: 0.0281 }, { limit: 40_000, rate: 0.0316 }, { limit: 60_000, rate: 0.0422 }, { limit: Infinity, rate: 0.0458 }]),
        exemption: { single: 2000, mfj: 4000 },
      },
      {
        id: "WI",
        name: "Wisconsin",
        brackets: {
          single: [{ limit: 15_110, rate: 0.035 }, { limit: 51_950, rate: 0.044 }, { limit: 332_720, rate: 0.053 }, { limit: Infinity, rate: 0.0765 }],
          mfj: [{ limit: 20_150, rate: 0.035 }, { limit: 69_260, rate: 0.044 }, { limit: 443_630, rate: 0.053 }, { limit: Infinity, rate: 0.0765 }],
        },
        standardDeduction: {
          single: { amount: 13_960, phaseOut: { start: 20_120, rate: 0.12 } },
          mfj: { amount: 25_840, phaseOut: { start: 29_040, rate: 0.19778 } },
        },
        exemption: { single: 700, mfj: 1400 },
      },
      { id: "WY", name: "Wyoming", brackets: NONE },
    ],
  },
};

export const TAX = TAX_YEARS[CURRENT_TAX_YEAR];
