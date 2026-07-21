/* data/mileage.ts — IRS standard mileage rate (business use), USD/mile.
 *
 * Year-keyed and append-only, matching data/tax.ts. The annual refresh
 * (docs/automation.md) APPENDS the new year and bumps
 * CURRENT_MILEAGE_YEAR; prior years stay for reference and reversion.
 * Bundled into consuming tools at build time — no runtime fetch.
 *
 * Current consumer: side-hustle-reality.
 * Source: IRS annual standard-mileage notice (published late December).
 */

export interface MileageYearData {
  /** Business-use standard mileage rate, USD per mile. */
  rate: number;
  source: string;
}

export const CURRENT_MILEAGE_YEAR = 2026;

export const MILEAGE_RATES: Record<number, MileageYearData> = {
  2020: { rate: 0.575, source: "IRS annual standard-mileage notice" },
  2021: { rate: 0.56, source: "IRS annual standard-mileage notice" },
  2022: { rate: 0.585, source: "IRS annual standard-mileage notice" },
  2023: { rate: 0.655, source: "IRS annual standard-mileage notice" },
  2024: { rate: 0.67, source: "IRS annual standard-mileage notice" },
  2025: { rate: 0.7, source: "IRS annual standard-mileage notice" },
  2026: { rate: 0.725, source: "IRS Notice 2026-10" },
};

export const MILEAGE = MILEAGE_RATES[CURRENT_MILEAGE_YEAR];
