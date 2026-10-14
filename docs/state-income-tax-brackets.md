# State income tax brackets for What Is My Time Worth: to do

**Status: not started.** Planned for its own session. The data source,
`taxfoundation.org`, is blocked by the cloud environment's network policy, and an
allowlist change only reaches sessions started after it. Written 2026-10-14
during the AdSense-readiness work.

Two jobs: **TODO 1** adds the initial 2026 numbers and the model that uses
them; **TODO 2** puts state brackets into the yearly data refresh. The last
section lists the copy that has to change when they land.

## Why

`calcStateTax(gross, rate)` in
`tools/what-is-my-time-worth/frontend/src/engine.ts` returns `gross × rate`. The
rate comes from `TAX.stateRates` in `data/tax.ts` (the 2026 entry): one number
per state, applied to the whole salary, with no standard deduction and no
exemption.

Those numbers are bracket rates, not effective rates. California is stored as
9.3%, New York 6.85%, Oregon 9%, Minnesota 7.85%, Hawaii 7.5%, each a middle or
upper bracket of that state's schedule. Applied to the whole salary, they
overstate state tax for most salaries wherever a state taxes in brackets.

Measured example, California, single, $105,000:

| | State tax |
|---|---|
| Calculator today: 9.3% × $105,000 | $9,765 |
| California's 2025 schedule: $105,000 − $5,706 standard deduction = $99,294 taxable; 1%, 2%, 4%, 6% and 8% bands up to $72,724, 9.3% above; $5,673, minus the $153 personal exemption credit | about $5,520 |

The calculator overstates this case by about $4,200 a year, roughly $1.70 an hour
of real wage at the calculator's default 2,532 work hours. 2026 indexing moves
the real figure slightly. Flat-tax states (Illinois, Pennsylvania, Colorado and
others) are already close, apart from their missing exemptions and deductions.

Other facts for the next session:

- Only What Is My Time Worth reads state tax data: its engine, `app.ts` and
  `__tests__/engine.test.ts`. The header of `data/tax.ts` notes two hidden
  finance tools that will migrate to it later.
- `data/tax.ts` holds only the 2026 year, so changing the shape of its state data
  rewrites no history.
- The state list has 51 entries: "No state tax" plus the 50 states. DC is missing,
  so people working in DC have no correct choice.
- Until this lands, the site says what the calculator does: the FAQ, the About
  page, the global FAQ, the state tooltip and the job-offers article all describe
  one flat rate per state that usually overstates.

## TODO 1: add the initial numbers (2026)

### Before starting the session

Add `taxfoundation.org` under Allowed domains in the environment's Network
access settings, then start a new session. `pypi.org` and
`files.pythonhosted.org` are already allowed, which the cross-check needs.

### Get the numbers

1. From Tax Foundation's "State Individual Income Tax Rates and Brackets, 2026"
   (<https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/>),
   take for every state and DC:
   - single and married-filing-jointly brackets (rate and threshold);
   - the standard deduction for single filers and couples;
   - the personal exemption for single filers and couples, noting whether it is
     a deduction from income or a credit against tax;
   - the footnotes.
   If the table is not in the page's HTML, use the data file the page links on
   the same domain.
2. Cross-check every value against PolicyEngine US (`policyengine-us` on PyPI;
   2.41.2 was current on 2026-10-13). Download the wheel into its own empty
   directory, unzip it, and read the YAML parameter files under
   `policyengine_us/parameters/gov/states/<state>/tax/income/` with
   `python3 -I`. Never import or run the package. Use the values dated 2026, and
   note any that PolicyEngine projects (uprates) rather than takes from a
   published schedule.
3. Settle every mismatch from the state revenue department's own 2026
   schedule. Never guess: a value that can't be settled stays out, and the PR
   says so.
4. Put the mismatch table in the PR body. Columns: state, field, Tax Foundation,
   PolicyEngine, resolution, source.

The repo copies statutory numbers only, never code or text. The `source` field
cites Tax Foundation and mentions the PolicyEngine cross-check.

### Data model (`data/tax.ts`)

```ts
export interface StateIncomeTax {
  id: string;   // "CA"; include "DC"
  name: string;
  /** Brackets on state taxable income. Empty: the state does not tax wages. */
  bracketsSingle: TaxBracket[]; // limit = upper bound; the top bracket is Infinity
  bracketsMfj: TaxBracket[];
  /** 0 when the state has none; the federal amount when the state uses it. */
  standardDeductionSingle: number;
  standardDeductionMfj: number;
  /** Personal exemption taken off income. */
  exemptionSingle: number;
  exemptionMfj: number;
  /** Personal exemption taken off the tax instead (California, for one). */
  exemptionCreditSingle?: number;
  exemptionCreditMfj?: number;
}
```

- Replace the 2026 `stateRates` with `states` (the 50 states and DC) and delete
  `StateTaxRate`.
- Massachusetts' 4% surtax becomes its top bracket. A state that starts from
  federal taxable income stores the 2026 federal standard deduction explicitly.
- Left out, and said so in the copy:
  - local income taxes (New York City, Yonkers, Maryland counties, cities in
    Ohio, Pennsylvania and Michigan, and others);
  - credits other than the personal exemption credit;
  - phase-outs and benefit recapture;
  - deducting federal tax from state income (Alabama, Missouri and others).

### Engine (`tools/what-is-my-time-worth/frontend/src/engine.ts`)

- Move the bracket loop out of `calcFederalIncomeTax` into
  `taxFromBrackets(taxable, brackets)`, and use it for federal and state tax.
- `calcStateTax(gross, state, filingStatus)`:
  1. Subtract the standard deduction and the exemption from gross, floored at 0.
  2. Apply `taxFromBrackets`.
  3. Subtract any exemption credit, floor at 0 and round to cents.
- In `WageInputs` and `JobInputs`, `stateTaxRate: number` becomes
  `stateId: string` (`"none"` or a state id). Export `STATES` (`{ id, name }`)
  in place of `STATE_TAX_RATES`.
- `app.ts` reads the state select in two places, the wage calculator and the
  job comparison. Both pass `stateId`. The selects list `STATES` after a "No
  state tax" option, and the default stays Illinois.
- `taxTooltips()` in `engine.ts` builds the tooltip text at runtime. Its state
  line changes from the flat-rate wording to brackets, the standard deduction
  and what is left out.

### Tests (`tools/what-is-my-time-worth/frontend/src/__tests__/engine.test.ts`)

- Hand-worked cases from the source table, each with its arithmetic in a
  comment:
  - California, single and married filing jointly, $105,000 (exemption credit);
  - New York, single, $85,000;
  - Oregon, single, $60,000;
  - Minnesota, single, $75,000;
  - New Jersey, single, $90,000 (no standard deduction, $1,000 exemption);
  - Pennsylvania, $65,000 (flat, no deduction);
  - Illinois, single, $65,000 (flat, with exemption);
  - Massachusetts, $1.2 million (surtax bracket);
  - Texas and `"none"` return 0.
- Data integrity:
  - 51 unique ids;
  - brackets ascending and ending at `Infinity`;
  - every rate at least 0 and below 0.15;
  - married-filing-jointly thresholds at or above single ones;
  - AK, FL, NV, NH, SD, TN, TX, WA and WY have empty brackets.
- Replace the flat-rate `calcStateTax` and `STATE_TAX_RATES` tests, and move
  the `calculateRealWage` and `compareJobs` fixtures to `stateId`.

## TODO 2: put state brackets in the yearly job

The annual refresh routine is described in `docs/automation.md` and runs from
GitHub Actions on January 16.

- **`docs/automation.md`, data matrix:** replace the "State income tax rates
  (sanity pass)" row with:

  ```
  | State income tax brackets, standard deductions, exemptions | same (`states` in each year's entry) | Tax Foundation "State Individual Income Tax Rates and Brackets" (~February), cross-checked against PolicyEngine US |
  ```

- **`docs/automation.md`, routine prompt step 1:** replace "Sanity-pass
  stateRates for well-sourced changes only." with:

  ```
  Copy every state's entry into the new year, then update its brackets,
  standard deductions and exemptions from Tax Foundation's table for the new
  year, cross-checking each value against PolicyEngine US (read its YAML
  parameters; never run the package) and settling mismatches from the state's
  revenue department. Tax Foundation usually publishes in February, after this
  job runs: if the new table is not out yet, carry last year's state figures
  forward, say so in the PR, and list the states to revisit in the "Annual data
  refresh blocked" issue.
  ```

- **The routine's environment** must allow `taxfoundation.org`. PyPI is already
  allowed.
- **`scripts/maintenance/DEPENDENCIES.md`:**
  - Matrix: replace the WIMTW "State income tax rates" row with:

    ```
    | WIMTW (via `data/tax.ts`) | State brackets, standard deductions, exemptions | Annually | **Jan 1** changes; Tax Foundation table ~February | Medium: wrong state tax |
    ```
  - Section "4. State Tax Rates": the update target becomes `states`, with the
    cross-check.
- **The freshness check** greps `CURRENT_TAX_YEAR` and needs no change.

## Copy to update when the brackets land

- `tools/what-is-my-time-worth/frontend/src/faq/index.html`, "How accurate are
  the tax estimates?". Update both the visible answer and the FAQPage JSON-LD:
  brackets, deduction and exemption per state, and what is left out.
- The tax sentence in `tools/what-is-my-time-worth/frontend/src/about/index.html`
  and `site/faq.html`.
- The "Tax estimates are approximations" note in
  `tools/what-is-my-time-worth/frontend/src/index.html`.
- `articles/comparing-job-offers-across-states/index.md`: the state-tax section
  explains the flat approximation. Rewrite it from the new engine's California
  and Texas numbers and recheck its conclusion.
- Worked examples computed on the flat model. Recompute them, since Illinois'
  personal exemption will move them slightly:
  - `articles/what-your-real-hourly-wage-subtracts/index.md` ($65,000 comes to
    $17.83 an hour);
  - `articles/life-energy-and-ymoyl/index.md` ($75,000 comes to $20.47).
- The FAQ claim that "a remote job paying $15,000 less can have a higher real
  hourly wage" held on the flat model ($23.10 against $21.76). Recheck it.
- Run `npm run sync-content`, then bump the "Updated" line and `dateModified`
  on every edited article.
