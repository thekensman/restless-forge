# Automation

Recurring jobs that keep the site current without manual work.

## WIMTW annual tax data update

**Status: live — no setup required.** A Claude Code scheduled routine named
`WIMTW annual tax data update` runs once a year and keeps the tax constants
in `tools/what-is-my-time-worth/frontend/src/engine.ts` current.

| | |
|---|---|
| Schedule | January 5, 14:00 UTC, yearly (cron `0 14 5 1 *`) |
| Runs as | Fresh Claude Code session in the restless-forge cloud environment |
| Notifies | Push + email when the run finishes |
| Trigger ID | `trig_011k8BaeWfHvph5gPh834Fs8` |

### What it does each January

1. Researches the new tax year's figures from authoritative sources
   (IRS inflation-adjustment revenue procedure, SSA wage-base announcement),
   cross-checking at least two sources per number.
2. Updates in `engine.ts`: `FEDERAL_BRACKETS_SINGLE`, `FEDERAL_BRACKETS_MFJ`,
   `STANDARD_DEDUCTION_SINGLE`, `STANDARD_DEDUCTION_MFJ`, `SS_WAGE_BASE`;
   sanity-checks `STATE_TAX_RATES`; updates any hard-coded tax-year strings
   in the tool's copy.
3. Runs the tool's test suite and fixes tests that assert old constants.
4. Opens a PR (`claude/wimtw-tax-update-<YEAR>`) with an old→new table and
   source links. **It never merges** — you review and merge.
5. If the new year's figures aren't published yet or sources conflict, it
   opens a GitHub issue instead of guessing.

### Your involvement

Review + merge the PR when the notification arrives. Once merged, the
deploy workflow (`.github/workflows/deploy.yml`) ships it — no server work.

### Managing the routine

Scheduled routines are managed through Claude Code (ask Claude to list,
modify, fire, or delete triggers) or in the Claude Code web UI's routines
settings. To test it off-cycle, ask Claude to fire the trigger by name.
