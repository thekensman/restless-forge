# Automation

Recurring jobs that keep the site's data current without manual work.

## Design: ONE consolidated annual refresh + a freshness safety net

Several tools carry rate data that changes yearly (see
`scripts/maintenance/DEPENDENCIES.md` for the full matrix):

| Data | Target file(s) | Source |
|---|---|---|
| Federal brackets, standard deductions | `tools/what-is-my-time-worth/frontend/src/engine.ts` | IRS Rev. Proc. (published ~Oct/Nov) |
| SS wage base | same | SSA announcement (~Oct) |
| State income tax rates (sanity pass) | same (`STATE_TAX_RATES`) | Tax Foundation |
| IRS standard mileage rate | `tools/side-hustle-reality/frontend/src/index.html` + `scripts/maintenance/data/mileage_rate.json` | IRS Notice (~late Dec) |
| CPI annual average | `tools/is-my-raise-real/frontend/src/index.html` | BLS (~Jan 11; `scripts/maintenance/scripts/update_cpi.py` fetches it) |
| Subscription preset prices | `tools/subscription-audit/frontend/src/index.html` + `scripts/maintenance/data/subscription_prices.json` | vendor pricing pages |

Instead of one scheduled job per tool, there is **one consolidated
"Annual data refresh" routine** covering the whole matrix, plus a
**GitHub Actions freshness check** that catches silent failures.

### 1. Annual data refresh (Claude scheduled routine)

Runs mid-January yearly in a fresh Claude Code cloud session. It
researches every value above from authoritative sources (cross-checked,
"open an issue instead of guessing" on conflicts), updates every target
file and maintenance JSON, runs the affected test suites (fixing tests
that assert prior-year constants), and opens **one PR**:
`claude/annual-data-refresh-<YEAR>`. You review and merge; the deploy
workflow ships it.

> **Status note (July 2026):** the original routine covered only the
> WIMTW tax constants, and its 2026 catch-up firing failed silently —
> the 2026 data was applied manually instead. When recreating or
> editing the routine, use the consolidated prompt below (ask Claude:
> "replace the WIMTW tax trigger with the consolidated annual data
> refresh from docs/automation.md").

<details>
<summary>Full routine prompt (canonical copy)</summary>

```
You are performing the consolidated annual data refresh for the
restless-forge repo (thekensman/restless-forge). Work through the data
matrix in docs/automation.md and scripts/maintenance/DEPENDENCIES.md,
updating everything to the CURRENT year:

1. WIMTW (tools/what-is-my-time-worth/frontend/src/engine.ts):
   FEDERAL_BRACKETS_SINGLE / FEDERAL_BRACKETS_MFJ limits,
   STANDARD_DEDUCTION_SINGLE / _MFJ, SS_WAGE_BASE. Update the
   "Tax year YYYY" comment marker (the freshness check greps it).
   Sanity-pass STATE_TAX_RATES for well-sourced changes only.
   Sources: IRS annual inflation-adjustment revenue procedure and the
   SSA wage-base announcement; cross-check two sources per number.
2. IRS standard mileage rate: update IRS_MILE and every "$X.XX/mi"
   label in tools/side-hustle-reality/frontend/src/index.html AND
   scripts/maintenance/data/mileage_rate.json (current_year,
   current_rate, source, history entry). Source: IRS Notice
   (published late December).
3. CPI: run scripts/maintenance/scripts/update_cpi.py (BLS API) or
   research the prior year's annual average CPI-U; add it to the CPI
   table in tools/is-my-raise-real/frontend/src/index.html.
4. Subscription prices: spot-check the preset prices in
   tools/subscription-audit/frontend/src/index.html against current
   vendor pricing; update the file and
   scripts/maintenance/data/subscription_prices.json for clear changes.
5. Search all tool copy for hard-coded stale year references tied to
   this data and update them.

If any figure is unpublished or sources conflict, do NOT guess — open
a GitHub issue titled "Annual data refresh blocked for <YEAR>" listing
what's missing, update everything else, and note the gap in the PR.

Then run the affected tool test suites (npm test --prefix
tools/<name>/frontend), fixing tests that assert prior-year constants
(cite sources in the commit). Commit to a branch named
claude/annual-data-refresh-<YEAR>, push, and open ONE pull request
against main titled "Annual data refresh <YEAR>" with an old→new table
per dataset and source links. Do not merge it yourself.
```

</details>

### 2. Freshness safety net (`.github/workflows/annual-data-check.yml`)

GitHub Actions, cron **Jan 20 yearly** (+ manual `workflow_dispatch`).
Verifies the current-year markers across all the datasets above (WIMTW
"Tax year" comment, mileage JSON year, Side-Hustle rate parity with the
JSON, CPI table entry for the prior year) and **opens a GitHub issue**
listing anything stale. Zero external dependencies — it can't fail the
way a research job can, so a silent refresh failure now surfaces within
two weeks instead of never.

### Maintenance scripts (`scripts/maintenance/`)

Helper updaters + canonical data JSONs from the tool drop.
`update_cpi.py` is a real BLS API fetcher; the others are guided
editors pointing at their sources. `DEPENDENCIES.md` is the
authoritative matrix of what needs updating when, and the annual
routine treats it as its work order.
