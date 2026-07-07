#!/usr/bin/env python3
"""
update_state_taxes.py — Manage simplified state income tax rates for WIMTW.

Schedule: Run in January each year.
Source:   Tax Foundation (https://taxfoundation.org/data/all/state/state-income-tax-rates-and-brackets/)

WIMTW uses simplified flat effective rates (not full bracket systems) for quick
estimation. These are approximate and the site includes a disclaimer to consult a CPA.

Usage:
  python3 update_state_taxes.py              # Show current rates
  python3 update_state_taxes.py --write      # Apply to WIMTW engine.ts
  python3 update_state_taxes.py --edit       # Open data file for editing
"""

import argparse
import json
import re
import sys
from pathlib import Path

DATA_FILE = Path(__file__).parent.parent / "data" / "state_taxes.json"
WIMTW_ENGINE = Path(__file__).parent.parent.parent / "time-value-calc" / "frontend" / "src" / "engine.ts"

# Simplified effective state income tax rates (2025 estimates)
# States with no income tax: AK, FL, NV, NH (wages only), SD, TN (inv only), TX, WA, WY
# These are APPROXIMATE flat effective rates for a ~$65k income, not marginal rates
DEFAULT_DATA = {
    "tax_year": 2025,
    "source": "Tax Foundation 2025 State Income Tax Rates & Brackets",
    "source_url": "https://taxfoundation.org/data/all/state/state-income-tax-rates-and-brackets/",
    "note": "Simplified flat effective rates for WIMTW estimation. Not marginal bracket rates.",
    "rates": {
        "AL": 4.0, "AK": 0, "AZ": 2.5, "AR": 3.9, "CA": 6.0,
        "CO": 4.4, "CT": 5.0, "DE": 5.5, "FL": 0, "GA": 5.49,
        "HI": 6.4, "ID": 5.8, "IL": 4.95, "IN": 3.05, "IA": 4.82,
        "KS": 4.7, "KY": 4.0, "LA": 3.0, "ME": 5.8, "MD": 4.75,
        "MA": 5.0, "MI": 4.25, "MN": 5.35, "MS": 4.7, "MO": 4.8,
        "MT": 5.9, "NE": 5.01, "NV": 0, "NH": 0, "NJ": 5.525,
        "NM": 4.7, "NY": 5.97, "NC": 4.5, "ND": 1.95, "OH": 3.5,
        "OK": 4.75, "OR": 8.0, "PA": 3.07, "RI": 4.75, "SC": 5.0,
        "SD": 0, "TN": 0, "TX": 0, "UT": 4.65, "VT": 5.2,
        "VA": 4.75, "WA": 0, "WV": 5.12, "WI": 5.3, "WY": 0, "DC": 6.0
    }
}


def load_data() -> dict:
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text())
    return DEFAULT_DATA


def save_data(data: dict):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(data, indent=2))


def show_rates(data: dict):
    print(f"Tax Year: {data['tax_year']}")
    print(f"Source:   {data['source']}")
    print(f"Note:     {data['note']}")
    print()

    rates = data["rates"]
    no_tax = [s for s, r in rates.items() if r == 0]
    with_tax = {s: r for s, r in sorted(rates.items(), key=lambda x: -x[1]) if r > 0}

    print("No income tax states:", ", ".join(sorted(no_tax)))
    print()
    print("State rates (highest to lowest):")
    for state, rate in with_tax.items():
        print(f"  {state}: {rate}%")


def update_engine(data: dict, filepath: Path) -> bool:
    """Update the state tax rate map in engine.ts."""
    if not filepath.exists():
        print(f"  Engine file not found: {filepath}")
        return False

    content = filepath.read_text()

    # Build the JS map
    lines = []
    for state in sorted(data["rates"].keys()):
        rate = data["rates"][state]
        lines.append(f'  "{state}": {rate}')

    new_map = "{\n" + ",\n".join(lines) + "\n}"

    # Look for state tax map pattern (various possible names)
    patterns = [
        r"(const\s+STATE_TAX_RATES?\s*[:=]\s*(?:Record<string,\s*number>\s*=\s*)?)\{[^}]+\}",
        r"(const\s+stateTax(?:es|Rates?)\s*[:=]\s*(?:Record<string,\s*number>\s*=\s*)?)\{[^}]+\}",
        r"(const\s+STATE_RATES?\s*[:=]\s*)\{[^}]+\}",
    ]

    for pattern in patterns:
        updated, n = re.subn(pattern, f"\\g<1>{new_map}", content, flags=re.DOTALL)
        if n > 0:
            filepath.write_text(updated)
            print(f"  ✓ Updated state tax rates in {filepath} ({len(data['rates'])} states)")
            return True

    print(f"  Could not find state tax map in {filepath}")
    print(f"  Searched patterns: STATE_TAX_RATES, stateTaxRates, STATE_RATES")
    print(f"  You may need to update state rates manually.")
    return False


def main():
    parser = argparse.ArgumentParser(description="Update state income tax rates")
    parser.add_argument("--write", action="store_true", help="Write to WIMTW engine.ts")
    parser.add_argument("--file", type=Path, default=WIMTW_ENGINE)
    parser.add_argument("--init", action="store_true", help="Initialize data file")
    args = parser.parse_args()

    print("=" * 60)
    print("STATE INCOME TAX RATE UPDATE")
    print("=" * 60)

    if args.init or not DATA_FILE.exists():
        save_data(DEFAULT_DATA)
        print(f"Initialized data file at {DATA_FILE}\n")

    data = load_data()
    show_rates(data)

    if not args.write:
        print(f"\nDRY RUN — pass --write to apply.")
        print(f"To change rates, edit: {DATA_FILE}")
        print(f"\n✓ DRY RUN COMPLETE")
        sys.exit(0)

    print("\nWriting to engine...")
    ok = update_engine(data, args.file)
    save_data(data)

    if ok:
        print(f"\n✓ STATE TAX UPDATE COMPLETE (tax year {data['tax_year']})")
    else:
        print(f"\n⚠ Data file saved, but engine update needs manual intervention.")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
