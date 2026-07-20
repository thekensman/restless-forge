# Restless Forge — Data Dependency Map & Maintenance Schedule

## Overview

Every Restless Forge tool runs client-side with hardcoded data. There are no live API
calls at runtime. This means data must be updated manually (or via these scripts) on a
schedule. The tradeoff is intentional: zero runtime dependencies, zero API keys in
client code, zero points of failure for users. The cost is periodic maintenance.

---

## Dependency Matrix

| Tool | Data Source | Update Frequency | When to Run | Risk if Stale |
|------|-----------|-----------------|-------------|---------------|
| WIMTW (via `data/tax.ts`) | Federal tax brackets | Annually | **Jan 1** (IRS publishes Oct/Nov for next year) | Medium — wrong tax estimates |
| WIMTW | State income tax rates | Annually | **Jan 1** | Low — simplified flat rates |
| WIMTW | FICA rate | Rarely (last changed 2013) | **Jan 1** (verify) | Low |
| WIMTW | SS wage base | Annually | **Jan 1** | Very low — only affects high earners |
| Is My Raise Real | CPI annual average | Annually | **Mid-January** (BLS publishes ~Jan 11) | High — core functionality |
| Side Hustle Reality | IRS standard mileage rate | Annually | **Jan 1** (IRS publishes late Dec) | Medium — affects depreciation calc |
| Side Hustle Reality | SE tax rate | Rarely (last changed 2013) | **Jan 1** (verify) | Low |
| Subscription Audit | Preset subscription prices | Quarterly (optional) | **Jan/Apr/Jul/Oct** | Very low — users can override |
| Repair or Replace | Appliance lifespan data | Rarely | **Annually** (Jan) | Very low — stable data |
| Pet Cost | Average pet cost data | Annually (optional) | **Jan** | Low — users can override |
| TattooSafe | Hourly-rate tiers (`HOURLY_RATES`) | Annually (sanity pass) | **Jan** | Low — market ranges, wide bands |
| PromptDrop | Water-footprint bands (energy/WUE/EWIF) | Annually (stamp: `DATA_VERIFIED_YEAR`) | **Jan** | Medium — research moves fast, tool cites sources |
| PetDose | Dosing table (`MEDICATIONS`) | Annually (sanity pass; **vet-review gated — never auto-edit values**) | **Jan** | High — safety-critical; stamp: `DATA_VERIFIED_YEAR` |

### Tools with ZERO external dependencies:
- **Am I Actually Saving Money?** — Pure math, user inputs everything. Nothing to update. Ever.
- **CookScale** — ingredient densities and unit conversions; physical constants, stable.

> The refresh itself is executed by the annual agent job described in
> `docs/automation.md` — that file's matrix is what the agent reads.
> Keep the two matrices in sync when adding a data-carrying tool.

---

## Data Sources

### 1. CPI Inflation (BLS API)
- **Source:** Bureau of Labor Statistics, Series CUUR0000SA0
- **API:** `https://api.bls.gov/publicAPI/v2/timeseries/data/` (free, no key needed for v1)
- **Published:** Annual average released ~January 11 each year
- **Script:** `scripts/update_cpi.py`
- **Updates:** `is-my-raise-real/index.html` → CPI object

### 2. Federal Tax Brackets (IRS)
- **Source:** IRS Revenue Procedure (published Oct/Nov for following tax year)
- **No clean API** — data is in PDF/HTML revenue procedures
- **Updates:** `data/tax.ts` → append a new `TAX_YEARS`
  entry and bump `CURRENT_TAX_YEAR` (year-keyed, append-only — prior
  years are kept as history). No helper script; the annual agent (or a
  human) edits the file directly, sources cited in comments.

### 3. IRS Standard Mileage Rate
- **Source:** IRS Notice (published late December for following year)
- **Script:** `scripts/update_mileage_rate.py`
- **Updates:** `side-hustle-reality/index.html` → IRS_MILE constant

### 4. State Tax Rates
- **Source:** Tax Foundation annual compilation
- **No clean API** — scraped from Tax Foundation or manually entered
- **Updates:** `data/tax.ts` → `stateRates` in the current
  year's entry (sanity pass; same file as the federal data).

### 5. FICA / SE Tax Rates
- **Source:** SSA.gov
- **Script:** `scripts/update_fica.py`
- **Updates:** WIMTW `engine.ts`, `side-hustle-reality/index.html`

### 6. Subscription Prices (Optional)
- **Source:** Manual research / web search
- **Script:** `scripts/update_sub_prices.py` (manual data entry + file update)
- **Updates:** `subscription-audit/index.html` → DEFAULTS array

---

## Cron Schedule (suggested)

```crontab
# Run annually on January 15 (after BLS publishes CPI ~Jan 11)
0 8 15 1 * cd /path/to/restless-forge-tools/maintenance && ./run_all.sh >> /var/log/restless-forge-maintenance.log 2>&1

# Optional: quarterly subscription price check reminder (just sends a reminder, no auto-update)
0 8 1 1,4,7,10 * echo "Reminder: check subscription preset prices" | mail -s "Restless Forge: Sub price check" you@email.com
```

---

## Manual Steps After Scripts Run

1. Review the diff output from each script
2. Run any existing test suites (`npm test` for WIMTW)
3. Build and deploy (`npm run build`, copy dist/ to VPS)
4. Spot-check live site calculations against a known reference
