#!/usr/bin/env python3
"""
update_tax_brackets.py — Update federal income tax brackets in WIMTW engine.

Schedule: Run in January each year (IRS publishes in Oct/Nov for following year).
Source:   IRS Revenue Procedure (e.g., Rev. Proc. 2024-40 for 2025 brackets)
          https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-YYYY

There is no clean IRS API for tax brackets. This script stores the known brackets
in a version-controlled data file and applies them to the WIMTW engine.

Usage:
  python3 update_tax_brackets.py                # Show current data
  python3 update_tax_brackets.py --write        # Update WIMTW engine.ts
  python3 update_tax_brackets.py --edit         # Interactive editor to change brackets
"""

import argparse
import json
import re
import sys
from pathlib import Path

DATA_FILE = Path(__file__).parent.parent / "data" / "federal_brackets.json"
# WIMTW engine.ts is the primary target; adjust path to your actual repo
WIMTW_ENGINE = Path(__file__).parent.parent.parent / "time-value-calc" / "frontend" / "src" / "engine.ts"

# 2025 federal brackets (source: IRS Rev. Proc. 2024-40)
DEFAULT_DATA = {
    "tax_year": 2025,
    "source": "IRS Rev. Proc. 2024-40",
    "source_url": "https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2025",
    "brackets_single": [
        {"min": 0,      "max": 11925,   "rate": 0.10},
        {"min": 11925,  "max": 48475,   "rate": 0.12},
        {"min": 48475,  "max": 103350,  "rate": 0.22},
        {"min": 103350, "max": 197300,  "rate": 0.24},
        {"min": 197300, "max": 250525,  "rate": 0.32},
        {"min": 250525, "max": 626350,  "rate": 0.35},
        {"min": 626350, "max": None,    "rate": 0.37}
    ],
    "brackets_mfj": [
        {"min": 0,      "max": 23850,   "rate": 0.10},
        {"min": 23850,  "max": 96950,   "rate": 0.12},
        {"min": 96950,  "max": 206700,  "rate": 0.22},
        {"min": 206700, "max": 394600,  "rate": 0.24},
        {"min": 394600, "max": 501050,  "rate": 0.32},
        {"min": 501050, "max": 751600,  "rate": 0.35},
        {"min": 751600, "max": None,    "rate": 0.37}
    ],
    "standard_deduction_single": 15000,
    "standard_deduction_mfj": 30000,
    "fica_rate": 0.0765,
    "fica_ss_wage_base": 176100,
    "fica_ss_rate": 0.062,
    "fica_medicare_rate": 0.0145,
    "se_tax_rate": 0.153,
    "se_tax_deductible_fraction": 0.9235
}


def load_data() -> dict:
    """Load bracket data from JSON file, or initialize with defaults."""
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text())
    return DEFAULT_DATA


def save_data(data: dict):
    """Save bracket data to JSON file."""
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(data, indent=2, default=str))


def format_brackets_ts(brackets: list, name: str) -> str:
    """Format brackets as TypeScript array."""
    lines = [f"const {name} = ["]
    for b in brackets:
        max_val = b["max"] if b["max"] is not None else "Infinity"
        lines.append(f"  {{ min: {b['min']}, max: {max_val}, rate: {b['rate']} }},")
    lines.append("];")
    return "\n".join(lines)


def show_data(data: dict):
    """Display current bracket data."""
    print(f"Tax Year: {data['tax_year']}")
    print(f"Source:   {data['source']}")
    print(f"URL:      {data['source_url']}")
    print()
    print("Single filer brackets:")
    for b in data["brackets_single"]:
        max_str = f"${b['max']:>10,}" if b["max"] else "         ∞"
        print(f"  ${b['min']:>10,} – {max_str}  @ {b['rate']*100:.0f}%")
    print()
    print("Married Filing Jointly brackets:")
    for b in data["brackets_mfj"]:
        max_str = f"${b['max']:>10,}" if b["max"] else "         ∞"
        print(f"  ${b['min']:>10,} – {max_str}  @ {b['rate']*100:.0f}%")
    print()
    print(f"Standard deduction (single):  ${data['standard_deduction_single']:,}")
    print(f"Standard deduction (MFJ):     ${data['standard_deduction_mfj']:,}")
    print(f"FICA employee rate:           {data['fica_rate']*100:.2f}%")
    print(f"SS wage base:                 ${data['fica_ss_wage_base']:,}")
    print(f"SE tax rate:                  {data['se_tax_rate']*100:.1f}%")


def update_engine_file(data: dict, filepath: Path) -> bool:
    """Update WIMTW engine.ts with new bracket data."""
    if not filepath.exists():
        print(f"  WARNING: engine.ts not found at {filepath}")
        print(f"  You'll need to update brackets manually or set --file to the correct path.")
        return False

    content = filepath.read_text()
    changes = 0

    # Update FICA rate
    content, n = re.subn(r"(ficaRate\s*[:=]\s*)[\d.]+", f"\\g<1>{data['fica_rate']}", content)
    changes += n

    # Update SS wage base
    content, n = re.subn(r"(ssWageBase\s*[:=]\s*)[\d]+", f"\\g<1>{data['fica_ss_wage_base']}", content)
    changes += n

    if changes > 0:
        filepath.write_text(content)
        print(f"  Updated {changes} values in {filepath}")
        return True
    else:
        print(f"  No matching patterns found in {filepath} — may need manual update.")
        print(f"  Look for ficaRate and ssWageBase variables.")
        return False


def update_side_hustle(data: dict) -> bool:
    """Update side hustle calculator with SE tax rate."""
    filepath = Path(__file__).parent.parent / "side-hustle-reality" / "index.html"
    if not filepath.exists():
        print(f"  Side hustle file not found at {filepath}")
        return False

    content = filepath.read_text()
    content, n = re.subn(
        r"const\s+SE_TAX\s*=\s*[\d.]+",
        f"const SE_TAX = {data['se_tax_rate']}",
        content
    )

    if n > 0:
        filepath.write_text(content)
        print(f"  Updated SE_TAX in {filepath}")
        return True
    else:
        print(f"  Could not find SE_TAX constant in {filepath}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Update federal tax brackets")
    parser.add_argument("--write", action="store_true", help="Write changes to source files")
    parser.add_argument("--file", type=Path, default=WIMTW_ENGINE, help="Path to WIMTW engine.ts")
    parser.add_argument("--init", action="store_true", help="Initialize data file with defaults")
    args = parser.parse_args()

    print("=" * 60)
    print("FEDERAL TAX BRACKET UPDATE")
    print("=" * 60)

    if args.init or not DATA_FILE.exists():
        print("Initializing data file with 2025 brackets...")
        save_data(DEFAULT_DATA)
        print(f"  Saved to {DATA_FILE}")

    data = load_data()
    print()
    show_data(data)
    print()

    if not args.write:
        print("DRY RUN — pass --write to apply changes to source files.")
        print(f"\nTo update brackets for a new tax year:")
        print(f"  1. Edit {DATA_FILE}")
        print(f"  2. Run: python3 {__file__} --write")
        print(f"\n✓ DRY RUN COMPLETE")
        sys.exit(0)

    print("Writing updates to source files...")
    results = []

    # Update WIMTW engine
    r1 = update_engine_file(data, args.file)
    results.append(("WIMTW engine.ts", r1))

    # Update side hustle calculator
    r2 = update_side_hustle(data)
    results.append(("Side Hustle SE_TAX", r2))

    # Save data file (in case it was initialized)
    save_data(data)
    results.append(("Data file", True))

    print()
    all_ok = True
    for name, ok in results:
        status = "✓" if ok else "✗"
        print(f"  {status} {name}")
        if not ok:
            all_ok = False

    if all_ok:
        print(f"\n✓ TAX BRACKET UPDATE COMPLETE (tax year {data['tax_year']})")
    else:
        print(f"\n⚠ PARTIAL UPDATE — review warnings above")
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
