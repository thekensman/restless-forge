#!/usr/bin/env bash
#
# run_all.sh — Master maintenance runner for Restless Forge tools.
#
# Schedule: Run mid-January each year (after BLS publishes CPI ~Jan 11).
#           Optionally run quarterly for subscription price updates.
#
# Usage:
#   ./run_all.sh              # Dry run — show what would change, write nothing
#   ./run_all.sh --write      # Apply all changes
#   ./run_all.sh --write --skip-cpi   # Skip CPI fetch (if BLS is down)
#
# Exit codes:
#   0 = all updates succeeded
#   1 = one or more updates failed
#
# Suggested cron:
#   0 8 15 1 * cd /path/to/maintenance && ./run_all.sh --write >> maintenance.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$SCRIPT_DIR/scripts"
LOG_FILE="$SCRIPT_DIR/last_run.log"

WRITE_FLAG=""
SKIP_CPI=false
for arg in "$@"; do
    case "$arg" in
        --write)    WRITE_FLAG="--write" ;;
        --skip-cpi) SKIP_CPI=true ;;
    esac
done

# ─── Status tracking ─────────────────────────────────────
declare -A STATUS
FAILURES=0

run_script() {
    local name="$1"
    local script="$2"
    shift 2
    local args=("$@")

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  $name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if python3 "$script" $WRITE_FLAG "${args[@]}"; then
        STATUS["$name"]="✓ OK"
    else
        STATUS["$name"]="✗ FAILED"
        FAILURES=$((FAILURES + 1))
    fi
}

# ─── Header ───────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════╗"
echo "║    RESTLESS FORGE — ANNUAL MAINTENANCE RUN          ║"
echo "║    $(date '+%Y-%m-%d %H:%M:%S')                          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Mode: ${WRITE_FLAG:-DRY RUN (pass --write to apply)}"
echo "Skip CPI: $SKIP_CPI"

# ─── 1. CPI Inflation Data ───────────────────────────────
if [ "$SKIP_CPI" = false ]; then
    run_script "CPI Inflation Data (Is My Raise Real)" "$SCRIPTS/update_cpi.py"
else
    echo ""
    echo "━━━ SKIPPED: CPI Inflation Data ━━━"
    STATUS["CPI Inflation Data"]="⊘ SKIPPED"
fi

# ─── 2. Federal Tax Brackets ─────────────────────────────
run_script "Federal Tax Brackets & FICA (WIMTW + Side Hustle)" "$SCRIPTS/update_tax_brackets.py"

# ─── 3. IRS Mileage Rate ─────────────────────────────────
# This requires explicit rate input; in dry run it just shows current data
run_script "IRS Mileage Rate (Side Hustle)" "$SCRIPTS/update_mileage_rate.py"

# ─── 4. State Tax Rates ──────────────────────────────────
run_script "State Income Tax Rates (WIMTW)" "$SCRIPTS/update_state_taxes.py"

# ─── 5. Subscription Prices ──────────────────────────────
run_script "Subscription Preset Prices (Sub Audit)" "$SCRIPTS/update_sub_prices.py"

# ─── Summary ──────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║    MAINTENANCE SUMMARY                              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

for key in "CPI Inflation Data (Is My Raise Real)" \
           "Federal Tax Brackets & FICA (WIMTW + Side Hustle)" \
           "IRS Mileage Rate (Side Hustle)" \
           "State Income Tax Rates (WIMTW)" \
           "Subscription Preset Prices (Sub Audit)"; do
    # Find the matching key (may be truncated)
    found=false
    for k in "${!STATUS[@]}"; do
        if [[ "$k" == *"$(echo "$key" | cut -d'(' -f1 | xargs)"* ]] || [[ "$k" == "$key" ]]; then
            printf "  %-50s %s\n" "$k" "${STATUS[$k]}"
            found=true
            break
        fi
    done
    if [ "$found" = false ]; then
        printf "  %-50s %s\n" "$key" "? NOT RUN"
    fi
done

echo ""
echo "  Tools requiring NO data updates:"
echo "    ✓ Am I Actually Saving Money? (pure math, zero deps)"
echo "    ✓ Repair or Replace (appliance lifespans are stable)"
echo "    ✓ Pet Cost Calculator (costs shift slowly, presets are adequate)"
echo ""

if [ $FAILURES -eq 0 ]; then
    echo "═══ ALL UPDATES COMPLETE ═══"
    echo ""
    if [ -n "$WRITE_FLAG" ]; then
        echo "Next steps:"
        echo "  1. Review git diff for each changed file"
        echo "  2. Run test suites (npm test for WIMTW)"
        echo "  3. Build and deploy"
        echo "  4. Spot-check live calculations"
    fi
else
    echo "═══ $FAILURES UPDATE(S) FAILED — review output above ═══"
fi

# ─── Save log ─────────────────────────────────────────────
{
    echo "---"
    echo "run_date: $(date -Iseconds)"
    echo "mode: ${WRITE_FLAG:-dry_run}"
    echo "failures: $FAILURES"
    for k in "${!STATUS[@]}"; do
        echo "  $k: ${STATUS[$k]}"
    done
} >> "$LOG_FILE"

exit $FAILURES
