#!/usr/bin/env python3
"""
update_sub_prices.py — Update default subscription prices in the Subscription Audit tool.

Schedule: Quarterly (optional). This is low-priority since users can override all prices.
Source:   Manual research — check current pricing pages for each service.

Usage:
  python3 update_sub_prices.py                # Show current presets
  python3 update_sub_prices.py --write        # Apply to subscription-audit/index.html
"""

import argparse
import json
import re
import sys
from pathlib import Path

DATA_FILE = Path(__file__).parent.parent / "data" / "subscription_prices.json"
SUB_AUDIT_FILE = Path(__file__).parent.parent / "subscription-audit" / "index.html"

# Prices as of Q1 2026 — update these quarterly
DEFAULT_DATA = {
    "last_updated": "2026-01",
    "presets": [
        {"name": "Netflix",          "cost": 15.49, "cycle": "monthly", "uses": 12},
        {"name": "Spotify",          "cost": 11.99, "cycle": "monthly", "uses": 25},
        {"name": "Amazon Prime",     "cost": 139,   "cycle": "annual",  "uses": 20},
        {"name": "ChatGPT Plus",     "cost": 20,    "cycle": "monthly", "uses": 30},
        {"name": "Gym",              "cost": 45,    "cycle": "monthly", "uses": 8},
        {"name": "iCloud+",          "cost": 2.99,  "cycle": "monthly", "uses": 30},
        {"name": "YouTube Premium",  "cost": 13.99, "cycle": "monthly", "uses": 20}
    ]
}


def load_data() -> dict:
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text())
    return DEFAULT_DATA


def save_data(data: dict):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(data, indent=2))


def show_data(data: dict):
    print(f"Last updated: {data['last_updated']}")
    print()
    for sub in data["presets"]:
        cycle = sub["cycle"]
        cost_str = f"${sub['cost']:.2f}/{cycle[:2]}"
        print(f"  {sub['name']:<20} {cost_str:<16} ~{sub['uses']} uses/mo")


def build_js_array(presets: list) -> str:
    """Build the JS DEFAULTS array."""
    entries = []
    for p in presets:
        entries.append(
            f"  {{name:'{p['name']}',cost:{p['cost']},cycle:'{p['cycle']}',uses:{p['uses']}}}"
        )
    return "[\n" + ",\n".join(entries) + ",\n]"


def update_file(data: dict, filepath: Path) -> bool:
    if not filepath.exists():
        print(f"  File not found: {filepath}")
        return False

    content = filepath.read_text()
    new_array = build_js_array(data["presets"])

    # Replace the DEFAULTS array
    updated, n = re.subn(
        r"const\s+DEFAULTS\s*=\s*\[[\s\S]*?\];",
        f"const DEFAULTS = {new_array};",
        content
    )

    if n > 0:
        filepath.write_text(updated)
        print(f"  ✓ Updated {len(data['presets'])} presets in {filepath}")
        return True
    else:
        print(f"  Could not find DEFAULTS array in {filepath}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Update subscription preset prices")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--file", type=Path, default=SUB_AUDIT_FILE)
    parser.add_argument("--init", action="store_true")
    args = parser.parse_args()

    print("=" * 60)
    print("SUBSCRIPTION PRESET PRICE UPDATE")
    print("=" * 60)

    if args.init or not DATA_FILE.exists():
        save_data(DEFAULT_DATA)
        print(f"Initialized: {DATA_FILE}\n")

    data = load_data()
    show_data(data)

    if not args.write:
        print(f"\nDRY RUN. To update prices:")
        print(f"  1. Edit {DATA_FILE}")
        print(f"  2. Run: python3 {__file__} --write")
        print(f"\n✓ DRY RUN COMPLETE")
        sys.exit(0)

    print("\nWriting...")
    ok = update_file(data, args.file)
    save_data(data)

    status = "✓ COMPLETE" if ok else "⚠ PARTIAL"
    print(f"\n{status}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
