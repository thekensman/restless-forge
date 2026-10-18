# State income tax in What Is My Time Worth

**Status: done (2026-10-18).** This replaced a flat rate per state (one bracket
rate applied to the whole salary, which overstated tax wherever a state taxes in
brackets: California, single, $105,000 came to $9,765 instead of $5,520). The
yearly refresh that keeps it current is step 1 of the routine prompt in
`docs/automation.md`.

## The model

`data/tax.ts` holds `states` in each year's entry: the 50 states and DC. Each
entry has:

- `brackets` for single and married filing jointly, on state taxable income;
- `standardDeduction` and `exemption`, taken off income;
- `exemptionCredit`, taken off the tax (California, Oregon, Utah's 6% credit
  and others);
- for Arkansas, `highIncome`: a second table that applies to all taxable
  income over $94,700;
- for Ohio, `addedTax`: the $332 added once taxable income passes $26,050.

A deduction, exemption or credit is either a number or an `Allowance` with a
linear `phaseOut` (start, rate, floor) and/or `steps`. `calcStateTax(gross,
stateId, filingStatus)` in the engine measures phase-outs on gross income, which
stands in for AGI.

The written plan left phase-outs out. They went in because several bite at
ordinary salaries. On $65,000 single, leaving them out would have understated
tax by about $355 in South Carolina, $608 in Utah and $290 in Wisconsin. In
Connecticut, a $15,000 exemption would have applied to people who have none
left above $45,000.

Left out, and said so in the copy:

- local income taxes (New York City, Yonkers, Maryland counties, Ohio and
  Pennsylvania municipalities, and others);
- credits other than the personal exemption credit;
- New York's and Connecticut's benefit recapture, and Connecticut's phase-out of
  its 2% bracket;
- deducting federal tax from state income (Alabama, Missouri, Oregon and
  others);
- Vermont's 3%-of-AGI minimum above $150,000, and Arkansas's bracket
  adjustment between $94,701 and $97,600;
- itemized deductions, dependents, and age or blindness additions.

## How the 2026 numbers were settled

Sources:

- Tax Foundation, "State Individual Income Tax Rates and Brackets, 2026"
  (the `.xlsx` linked from the page, published February 2026);
- PolicyEngine US 2.49.4, its YAML parameters read without running the package;
- the state's own statute or revenue publication wherever the two disagreed.

Only statutory numbers were copied, never code or text.

| State | Field | Tax Foundation | PolicyEngine | Used | Settled by |
|---|---|---|---|---|---|
| AR | rates | 2%, 3.9% | 0% to 3.7%, plus a high-income table | PolicyEngine | Act 1 of 2026 (HB 1001, 1st Extraordinary Session) |
| AZ | standard deduction | $8,350 / $16,700 | $16,100 / $32,200 | PolicyEngine | Laws 2026, ch. 140 (A.R.S. 43-1041, indexed like the federal amount) |
| CA | standard deduction | $5,540 / $11,080 | $5,706 / $11,412 | PolicyEngine | FTB's 2026 Form 540-ES instructions use the 2025 amounts |
| DC | standard deduction | $16,100 / $32,200 | $15,000 / $30,000 | PolicyEngine | D.C. Act 26-214: DC's own amount, indexed from 2025; 2026 index not yet published |
| GA | rate, standard deduction | 5.19%, $12,000 / $24,000 | 4.99%, $15,000 / $30,000 | PolicyEngine | HB 463 (2026) |
| HI | standard deduction | $4,400 / $8,800 | $8,000 / $16,000 | PolicyEngine | HRS 235-2.4(a)(2)(F), as enacted by HB 2404 (2024) |
| IL | exemption | $2,925 | $2,850 (2025) | Tax Foundation | IDOR Booklet IL-700-T 2026 |
| LA | standard deduction | $12,875 / $25,750 | $12,838 / $25,676 | PolicyEngine | LDR Revenue Information Bulletin 26-019 |
| ME | standard deduction | $8,350 / $16,700 | $15,700 / $31,400 | PolicyEngine | 36 M.R.S. 5124-C(1-C) |
| ME | brackets | $27,399 / $64,849 | $27,400 / $64,850 | PolicyEngine | Not settled: Maine's 2026 rate schedule refuses automated fetches. $1 apart. |
| ME | exemption | $5,300 | $5,150 (2025) | $5,150 | Not settled; the published 2025 figure is used |
| ND | brackets | 2025 widths | $49,575 / $250,400 (single) | PolicyEngine | 2026 Form ND-1ES schedules |
| OH | tax above $26,050 | 2.75% | $332 + 2.75% | PolicyEngine | ORC 5747.02(A)(3)(c) |
| OR | exemption credit | $256 | $256 (2025) | $263 | 2026 withholding formulas, 150-206-436 (allowance amount) |
| OR | standard deduction | $2,910 / $5,820 | $2,835 / $5,670 (2025) | Tax Foundation | 2026 withholding formulas, 150-206-436 |
| SC | rates, deduction | 0%, 3%, 6%; federal deduction | 1.99%, 5.21%; SC Income Adjusted Deduction | PolicyEngine | H.4216 (Act 110 of 2026), first applies to 2026 |
| UT | rate | 4.5% | 4.45% | PolicyEngine | SB 60 (2026), retrospective to January 1, 2026 |
| WV | rates | 2.22% to 4.82% | 2.11% to 4.58% | PolicyEngine | W. Va. Code 11-21-4j |

These still use the latest published year, because the 2026 figure was not
out on 2026-10-18:

- California: brackets, deduction and credit (2025);
- Idaho: bracket threshold (2025);
- Massachusetts: surtax threshold (2025);
- Vermont: brackets, deduction and exemption (2025);
- DC: standard deduction (2025 base);
- Utah: credit phase-out start (2025);
- Maine: standard deduction phase-out start and exemption (2025).

Each state's comment in `data/tax.ts` says the same. The January refresh should
update them.
