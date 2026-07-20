/* tools/shared-data/tax.ts — shared, year-keyed US tax data.
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

export interface StateTaxRate {
  id: string;
  name: string;
  rate: number;
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
  /** Simplified flat effective rates (Tax Foundation) — sanity-passed yearly. */
  stateRates: StateTaxRate[];
}

export const CURRENT_TAX_YEAR = 2026;

export const TAX_YEARS: Record<number, TaxYearData> = {
  2026: {
    source: "IRS Rev. Proc. 2025-32; SSA 2026 wage-base announcement; Tax Foundation state rates",
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
    stateRates: [
      { id: "none", name: "No state tax", rate: 0 },
      { id: "AL", name: "Alabama", rate: 0.05 },
      { id: "AK", name: "Alaska", rate: 0 },
      { id: "AZ", name: "Arizona", rate: 0.025 },
      { id: "AR", name: "Arkansas", rate: 0.044 },
      { id: "CA", name: "California", rate: 0.093 },
      { id: "CO", name: "Colorado", rate: 0.044 },
      { id: "CT", name: "Connecticut", rate: 0.05 },
      { id: "DE", name: "Delaware", rate: 0.066 },
      { id: "FL", name: "Florida", rate: 0 },
      { id: "GA", name: "Georgia", rate: 0.055 },
      { id: "HI", name: "Hawaii", rate: 0.075 },
      { id: "ID", name: "Idaho", rate: 0.058 },
      { id: "IL", name: "Illinois", rate: 0.0495 },
      { id: "IN", name: "Indiana", rate: 0.0305 },
      { id: "IA", name: "Iowa", rate: 0.06 },
      { id: "KS", name: "Kansas", rate: 0.057 },
      { id: "KY", name: "Kentucky", rate: 0.04 },
      { id: "LA", name: "Louisiana", rate: 0.0425 },
      { id: "ME", name: "Maine", rate: 0.0715 },
      { id: "MD", name: "Maryland", rate: 0.0575 },
      { id: "MA", name: "Massachusetts", rate: 0.05 },
      { id: "MI", name: "Michigan", rate: 0.0425 },
      { id: "MN", name: "Minnesota", rate: 0.0785 },
      { id: "MS", name: "Mississippi", rate: 0.05 },
      { id: "MO", name: "Missouri", rate: 0.048 },
      { id: "MT", name: "Montana", rate: 0.059 },
      { id: "NE", name: "Nebraska", rate: 0.0584 },
      { id: "NV", name: "Nevada", rate: 0 },
      { id: "NH", name: "New Hampshire", rate: 0 },
      { id: "NJ", name: "New Jersey", rate: 0.0637 },
      { id: "NM", name: "New Mexico", rate: 0.049 },
      { id: "NY", name: "New York", rate: 0.0685 },
      { id: "NC", name: "North Carolina", rate: 0.045 },
      { id: "ND", name: "North Dakota", rate: 0.0195 },
      { id: "OH", name: "Ohio", rate: 0.035 },
      { id: "OK", name: "Oklahoma", rate: 0.0475 },
      { id: "OR", name: "Oregon", rate: 0.09 },
      { id: "PA", name: "Pennsylvania", rate: 0.0307 },
      { id: "RI", name: "Rhode Island", rate: 0.0599 },
      { id: "SC", name: "South Carolina", rate: 0.065 },
      { id: "SD", name: "South Dakota", rate: 0 },
      { id: "TN", name: "Tennessee", rate: 0 },
      { id: "TX", name: "Texas", rate: 0 },
      { id: "UT", name: "Utah", rate: 0.0465 },
      { id: "VT", name: "Vermont", rate: 0.066 },
      { id: "VA", name: "Virginia", rate: 0.0575 },
      { id: "WA", name: "Washington", rate: 0 },
      { id: "WV", name: "West Virginia", rate: 0.052 },
      { id: "WI", name: "Wisconsin", rate: 0.053 },
      { id: "WY", name: "Wyoming", rate: 0 },
    ],
  },
};

export const TAX = TAX_YEARS[CURRENT_TAX_YEAR];
