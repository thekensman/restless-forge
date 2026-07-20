#!/usr/bin/env python3
"""
update_mileage_rate.py — Update IRS standard mileage rate in Side Hustle Reality.

Schedule: Run in January (IRS publishes late December for following year).
Source:   IRS Notice (e.g., IR-2024-312 for 2025 rate)
          https://www.irs.gov/tax-professionals/standard-mileage-rates

The IRS standard mileage rate is used as a proxy for total vehicle operating costs
(gas + depreciation + insurance + maintenance). The Side Hustle calculator separates
gas from this rate to show the depreciation/maintenance component independently.

Usage:
  python3 update_mileage_rate.py                      # Show current rate
  python3 update_mileage_rate.py --rate 0.70 --year 2025 --write  # Update
"""

import argparse
import json
import re
import sys
from pathlib import Path

DATA_FILE = Path(__file__).parent.parent / "data" / "mileage_rate.json"
SIDE_HUSTLE_FILE = Path(__file__).parents[3] / "tools" / "side-hustle-reality" / "frontend" / "src" / "index.html"

# Historical IRS standard mileage rates (business use)
DEFAULT_DATA = {
    "current_year": 2025,
    "current_rate": 0.70,
    "source": "IRS Notice 2025-02",
    "history": {
        "2020": 0.575,
        "2021": 0.56,
        "2022": 0.585,  # Jan-Jun: 0.585, Jul-Dec: 0.625 (used Jan rate)
        "2023": 0.655,
        "2024": 0.67,
        "2025": 0.70
    }
}


def load_data() -> dict:
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text())
    return DEFAULT_DATA


def save_data(data: dict):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(data, indent=2))


def update_side_hustle(rate: float, year: int, filepath: Path) -> bool:
    """Update IRS_MILE constant in side hustle calculator."""
    if not filepath.exists():
        print(f"  File not found: {filepath}")
        return False

    content = filepath.read_text()

    # Update the constant
    content, n1 = re.subn(
        r"const\s+IRS_MILE\s*=\s*[\d.]+;?\s*//.*",
        f"const IRS_MILE = {rate}; // {year} IRS standard mileage rate",
        content
    )

    # Fallback if comment format differs
    if n1 == 0:
        content, n1 = re.subn(
            r"const\s+IRS_MILE\s*=\s*[\d.]+",
            f"const IRS_MILE = {rate}",
            content
        )

    # Also update the breakdown label mentioning the rate
    content, n2 = re.subn(
        r"Vehicle depreciation \(IRS \$[\d.]+/mi\)",
        f"Vehicle depreciation (IRS ${rate:.2f}/mi)",
        content
    )

    if n1 > 0:
        filepath.write_text(content)
        print(f"  Updated IRS_MILE to {rate} in {filepath}")
        if n2 > 0:
            print(f"  Updated breakdown label")
        return True
    else:
        print(f"  Could not find IRS_MILE constant in {filepath}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Update IRS standard mileage rate")
    parser.add_argument("--rate", type=float, help="New mileage rate (e.g., 0.70)")
    parser.add_argument("--year", type=int, help="Tax year for the rate")
    parser.add_argument("--write", action="store_true", help="Write changes to files")
    parser.add_argument("--file", type=Path, default=SIDE_HUSTLE_FILE)
    args = parser.parse_args()

    print("=" * 60)
    print("IRS STANDARD MILEAGE RATE UPDATE")
    print("=" * 60)

    data = load_data()
    if not DATA_FILE.exists():
        save_data(data)

    print(f"Current rate: ${data['current_rate']}/mile ({data['current_year']})")
    print(f"Source: {data['source']}")
    print(f"\nHistory:")
    for yr, rate in sorted(data["history"].items()):
        marker = " ← current" if rate == data["current_rate"] else ""
        print(f"  {yr}: ${rate}/mile{marker}")

    if args.rate and args.year:
        new_rate = args.rate
        new_year = args.year
        print(f"\nProposed change: ${data['current_rate']}/mile → ${new_rate}/mile ({new_year})")

        if not args.write:
            print("\nDRY RUN — pass --write to apply.")
            print(f"\n✓ DRY RUN COMPLETE")
            sys.exit(0)

        data["current_rate"] = new_rate
        data["current_year"] = new_year
        data["history"][str(new_year)] = new_rate
        save_data(data)
        print(f"  ✓ Saved to {DATA_FILE}")

        ok = update_side_hustle(new_rate, new_year, args.file)
        if ok:
            print(f"\n✓ MILEAGE RATE UPDATE COMPLETE")
        else:
            print(f"\n⚠ Data file updated but source file update failed")
        sys.exit(0 if ok else 1)
    else:
        if not args.write:
            print(f"\nNo new rate provided. To update:")
            print(f"  python3 {__file__} --rate 0.72 --year 2026 --write")
            print(f"\n✓ CURRENT DATA DISPLAYED")
            sys.exit(0)


if __name__ == "__main__":
    main()
