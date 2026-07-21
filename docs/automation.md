# Automation

Recurring jobs that keep the site's data current without manual work.

## Design: ONE consolidated annual refresh + a freshness safety net

Several tools carry rate data that changes yearly (see
`scripts/maintenance/DEPENDENCIES.md` for the full matrix):

| Data | Target file(s) | Source |
|---|---|---|
| Federal brackets, standard deductions | `data/tax.ts` (year-keyed `TAX_YEARS` — append, never overwrite) | IRS Rev. Proc. (published ~Oct/Nov) |
| SS wage base | same | SSA announcement (~Oct) |
| State income tax rates (sanity pass) | same (`stateRates`) | Tax Foundation |
| IRS standard mileage rate | `data/mileage.ts` (year-keyed `MILEAGE_RATES` — append) | IRS Notice (~late Dec) |
| CPI annual average | `data/cpi.ts` (year-keyed `CPI_ANNUAL` — append) | BLS series CUUR0000SA0 (~Jan 11) |
| Subscription preset prices | `data/subscription-presets.ts` (`SUBSCRIPTION_PRESETS`) | vendor pricing pages |
| TattooSafe hourly-rate tiers (sanity pass only — market ranges, not year-keyed) | `tools/tattoosafe/frontend/src/engine.ts` (`HOURLY_RATES`) | industry surveys / studio listings |
| PromptDrop water-footprint bands (energy/task, WUE, EWIF) + bump `DATA_VERIFIED_YEAR` | `tools/promptdrop/frontend/src/engine.ts` | company disclosures (Google, OpenAI, AWS/Microsoft WUE) + research (UC Riverside, NREL, Hugging Face) |
| PetDose dosing table — **sanity pass ONLY: never change dose values in the refresh PR.** If any reference disagrees, open a blocking issue for veterinary review; bump `DATA_VERIFIED_YEAR` only when sources agree | `tools/petdose/frontend/src/engine.ts` (`MEDICATIONS`) | veterinary references (Plumb's, Merck Vet Manual) |
| Repair-or-Replace appliance lifespans + Pet Cost averages (optional sanity pass — stable data) | respective `frontend/src/` | industry lifespan surveys / ASPCA cost data |

Instead of one scheduled job per tool, there is **one consolidated
"Annual data refresh" routine** covering the whole matrix, plus a
**GitHub Actions freshness check** that catches silent failures.

**Shared data layer:** cross-tool datasets live in `data/`
(currently `tax.ts`), imported by consuming tools and bundled at build
time — no runtime fetches. Tool-specific data (PetDose doses, PromptDrop
bands, TattooSafe rates) stays in each tool's engine.

**History convention:** shared datasets are **year-keyed and
append-only** — the refresh adds the new year and keeps every prior
year, so old values can be referenced or restored directly. For
tool-specific, non-year-keyed data, git history plus the refresh PR
trail is the historical record (every change lands as a reviewed diff
with sources cited).

### 1. Annual data refresh (`.github/workflows/annual-data-refresh.yml`)

Runs **from GitHub Actions** (cron: Jan 16 yearly, plus manual
`workflow_dispatch`) so every recurring job lives in one place — the
Actions tab. The workflow runs a Claude Code agent
(`anthropics/claude-code-action`) that reads this file and executes the
canonical prompt below: it researches every value above from
authoritative sources (cross-checked, "open an issue instead of
guessing" on conflicts), updates every target file and maintenance
JSON, runs the affected test suites (fixing tests that assert
prior-year constants), and opens **one PR**:
`claude/annual-data-refresh-<YEAR>`. You review and merge; the deploy
workflow ships it.

**Credentials (either one; OAuth takes precedence):** the workflow checks
secrets in this order:

1. **`CLAUDE_CODE_OAUTH_TOKEN`** (subscription auth) — **preferred**. Run
   `claude setup-token` locally, copy the token from claude.ai, and add it
   as a repository secret. The workflow uses your claude.ai subscription
   plan — no API credit needed, runs draw down your active plan. Preferred
   because it's under your control (no external API keys in the repo's
   secret store) and your subscription plan is already paid.

2. **`ANTHROPIC_API_KEY`** (Anthropic API key from
   console.anthropic.com) — **fallback**. Uses your $25-monthly or
   pay-as-you-go API credit. Set this only if you don't have a
   claude.ai subscription plan or prefer to use API credit instead.

With **neither** secret set the workflow skips cleanly (green run with a
notice), and the Jan 20 freshness check remains the backstop: it opens
an issue if the data is stale, and the canonical prompt below can be
pasted into any Claude Code session to do the refresh by hand.

Timing: Jan 16 is after the IRS mileage notice (late Dec) and the BLS
annual CPI release (~Jan 13), and four days before the freshness
safety net verifies the result.

> **History:** this started as a claude.ai scheduled trigger covering
> only the WIMTW tax constants; its 2026 firing failed silently and
> the data was applied manually. The GitHub Actions workflow replaced
> it (July 2026) — if a claude.ai trigger named anything like "WIMTW
> tax update" still exists in your account, delete it so the job
> doesn't run twice.

<details>
<summary>Full routine prompt (canonical copy)</summary>

```
You are performing the consolidated annual data refresh for the
restless-forge repo (thekensman/restless-forge). Work through the data
matrix in docs/automation.md and scripts/maintenance/DEPENDENCIES.md,
updating everything to the CURRENT year:

1. Shared tax data (data/tax.ts): APPEND a new year
   entry to TAX_YEARS (copy the prior year, update brackets, standard
   deductions, ssWageBase, and the source field) and bump
   CURRENT_TAX_YEAR (the freshness check greps it). Do NOT delete
   prior years — the file keeps history by design. Sanity-pass
   stateRates for well-sourced changes only. Consumers (currently
   WIMTW) pick the new year up automatically.
   Sources: IRS annual inflation-adjustment revenue procedure and the
   SSA wage-base announcement; cross-check two sources per number.
2. IRS standard mileage rate (data/mileage.ts): append a new
   MILEAGE_RATES entry (rate + source) and bump CURRENT_MILEAGE_YEAR.
   side-hustle-reality imports it — no per-tool edit. Also check any
   "$X.XX/mi" copy in that tool's HTML. Source: IRS Notice (late Dec).
3. CPI (data/cpi.ts): research the prior year's annual-average CPI-U
   (BLS series CUUR0000SA0) and append it to CPI_ANNUAL. is-my-raise-real
   imports it.
4. Subscription prices (data/subscription-presets.ts): spot-check the
   SUBSCRIPTION_PRESETS costs against current vendor pricing; update in
   place for clear changes.
5. TattooSafe HOURLY_RATES (tools/tattoosafe/frontend/src/engine.ts):
   sanity-pass the four tier ranges against current studio rates; only
   adjust on clear, sourced market drift (these are ranges, not indexed
   figures — most years this is a no-op).
6. Search all tool copy for hard-coded stale year references tied to
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
Runs `scripts/check-data-freshness.mjs` (also runnable locally), which
imports every data module directly — `CURRENT_TAX_YEAR` (data/tax.ts),
`CURRENT_MILEAGE_YEAR` (data/mileage.ts), the prior-year `CPI_ANNUAL`
entry (data/cpi.ts), and the PromptDrop and PetDose `DATA_VERIFIED_YEAR`
exports — then **opens a GitHub issue**
listing anything stale. Zero external dependencies — it can't fail the
way a research job can, so a silent refresh failure now surfaces within
two weeks instead of never.

### Data dependency map (`scripts/maintenance/DEPENDENCIES.md`)

The authoritative matrix of what data needs updating when and where it
lives; the annual routine treats it as its work order. (The old
per-dataset Python updaters + mirror JSONs were retired when the data
moved into the typed `data/` modules — the agent edits those directly.)
