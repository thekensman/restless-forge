/* data/cpi.ts — CPI-U annual-average inflation, percent change year/year.
 *
 * Year-keyed and append-only, matching data/tax.ts. The annual refresh
 * (docs/automation.md) APPENDS the prior year's finalized annual average
 * each January; earlier years never change. Bundled into consuming tools
 * at build time — no runtime fetch.
 *
 * Current consumer: is-my-raise-real.
 * Source: U.S. Bureau of Labor Statistics, series CUUR0000SA0
 * (CPI-U, all items, U.S. city average), annual average % change.
 */

export const CPI_ANNUAL: Record<number, number> = {
  2000: 2.2, 2001: 2.8, 2002: 1.6, 2003: 2.3, 2004: 2.7,
  2005: 3.4, 2006: 3.2, 2007: 2.8, 2008: 3.8, 2009: -0.4,
  2010: 1.6, 2011: 3.2, 2012: 2.1, 2013: 1.5, 2014: 1.6,
  2015: 0.1, 2016: 1.3, 2017: 2.1, 2018: 2.4, 2019: 1.8,
  2020: 1.2, 2021: 4.7, 2022: 8.0, 2023: 4.1, 2024: 2.9, 2025: 2.8,
};

export const LATEST_CPI_YEAR = Math.max(...Object.keys(CPI_ANNUAL).map(Number));
export const LATEST_CPI = CPI_ANNUAL[LATEST_CPI_YEAR];
