#!/usr/bin/env python3
"""
update_cpi.py — Fetch annual CPI-U averages from BLS and update Is My Raise Real.

Schedule: Run mid-January each year (BLS publishes annual averages ~Jan 11).
Source:   Bureau of Labor Statistics, Series CUUR0000SA0 (CPI-U All Items)
API:      https://api.bls.gov/publicAPI/v2/timeseries/data/

Usage:
  python3 update_cpi.py                     # Dry run — show data, don't write
  python3 update_cpi.py --write             # Update the source file
  python3 update_cpi.py --write --file /path/to/index.html  # Custom file path
"""

import argparse
import json
import re
import sys
from pathlib import Path

# BLS API v1 (no registration needed, 25 queries/day limit)
# v2 requires a registration key but has higher limits
BLS_API_URL = "https://api.bls.gov/publicAPI/v1/timeseries/data/"
CPI_SERIES = "CUUR0000SA0"  # CPI-U, All items, US city average, not seasonally adjusted

# Default file location relative to this script
DEFAULT_FILE = Path(__file__).parent.parent / "is-my-raise-real" / "index.html"


def fetch_cpi_data(start_year: int, end_year: int) -> dict:
    """Fetch annual average CPI values from BLS API."""
    import requests

    # BLS API allows max 20 years per request
    all_data = {}
    for chunk_start in range(start_year, end_year + 1, 20):
        chunk_end = min(chunk_start + 19, end_year)

        payload = {
            "seriesid": [CPI_SERIES],
            "startyear": str(chunk_start),
            "endyear": str(chunk_end),
            "annualaverage": True,
        }

        print(f"  Fetching BLS data {chunk_start}–{chunk_end}...", end=" ")
        try:
            resp = requests.post(BLS_API_URL, json=payload, timeout=30)
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"FAILED: {e}")
            return None

        result = resp.json()
        if result.get("status") != "REQUEST_SUCCEEDED":
            print(f"FAILED: BLS returned status={result.get('status')}")
            print(f"  Message: {result.get('message', 'No message')}")
            return None

        series_data = result["Results"]["series"][0]["data"]

        # Extract annual averages (period == "M13")
        for entry in series_data:
            if entry["period"] == "M13":  # M13 = annual average
                year = int(entry["year"])
                value = float(entry["value"])
                all_data[year] = value

        print(f"OK ({len([e for e in series_data if e['period'] == 'M13'])} annual values)")

    return all_data


def compute_inflation_rates(cpi_values: dict) -> dict:
    """Convert raw CPI index values to year-over-year inflation percentages."""
    years = sorted(cpi_values.keys())
    rates = {}
    for i in range(1, len(years)):
        prev = cpi_values[years[i - 1]]
        curr = cpi_values[years[i]]
        rate = round((curr - prev) / prev * 100, 1)
        rates[years[i]] = rate
    return rates


def read_existing_cpi(filepath: Path) -> dict:
    """Parse the existing CPI object from the HTML file."""
    content = filepath.read_text()
    # Match: const CPI = { ... };
    match = re.search(r"const\s+CPI\s*=\s*\{([^}]+)\}", content)
    if not match:
        return {}

    existing = {}
    for pair in re.finditer(r"(\d{4})\s*:\s*(-?[\d.]+)", match.group(1)):
        existing[int(pair.group(1))] = float(pair.group(2))
    return existing


def build_cpi_js_object(rates: dict) -> str:
    """Format the CPI data as a JavaScript object literal."""
    lines = []
    years = sorted(rates.keys())
    # Group into rows of 5 for readability
    for i in range(0, len(years), 5):
        chunk = years[i:i + 5]
        pairs = [f"{y}: {rates[y]}" for y in chunk]
        lines.append("  " + ", ".join(pairs) + ",")

    # Remove trailing comma from last line
    if lines:
        lines[-1] = lines[-1].rstrip(",")

    return "{\n" + "\n".join(lines) + "\n}"


def update_file(filepath: Path, new_rates: dict) -> bool:
    """Replace the CPI object in the HTML file."""
    content = filepath.read_text()

    new_js = build_cpi_js_object(new_rates)
    new_block = f"const CPI = {new_js};"

    # Replace the existing CPI block
    updated, count = re.subn(
        r"const\s+CPI\s*=\s*\{[^}]+\};",
        new_block,
        content,
    )

    if count == 0:
        print("  ERROR: Could not find CPI object in file to replace.")
        return False

    # Also update LATEST_YEAR and LATEST_CPI if they exist
    latest_year = max(new_rates.keys())
    latest_cpi = new_rates[latest_year]
    updated = re.sub(
        r"const\s+LATEST_YEAR\s*=\s*[^;]+;",
        f"const LATEST_YEAR = Math.max(...Object.keys(CPI).map(Number));",
        updated,
    )
    updated = re.sub(
        r"const\s+LATEST_CPI\s*=\s*[^;]+;",
        f"const LATEST_CPI = CPI[LATEST_YEAR];",
        updated,
    )

    filepath.write_text(updated)
    return True


def main():
    parser = argparse.ArgumentParser(description="Update CPI inflation data from BLS")
    parser.add_argument("--write", action="store_true", help="Actually write changes to file")
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE, help="Path to index.html")
    parser.add_argument("--start-year", type=int, default=2000, help="First year to fetch")
    args = parser.parse_args()

    print("=" * 60)
    print("CPI INFLATION DATA UPDATE")
    print("=" * 60)
    print(f"Source: BLS Series {CPI_SERIES}")
    print(f"Target: {args.file}")
    print()

    # Determine end year (current year; BLS may not have it yet)
    from datetime import datetime
    current_year = datetime.now().year

    # Step 1: Fetch from BLS
    print("[1/4] Fetching CPI data from BLS API...")
    cpi_values = fetch_cpi_data(args.start_year - 1, current_year)  # Need year before for first rate
    if cpi_values is None:
        print("\n✗ FAILED: Could not fetch CPI data from BLS.")
        sys.exit(1)

    # Step 2: Compute inflation rates
    print("[2/4] Computing year-over-year inflation rates...")
    rates = compute_inflation_rates(cpi_values)
    print(f"  Computed rates for {min(rates.keys())}–{max(rates.keys())}")

    # Step 3: Compare with existing
    print("[3/4] Comparing with existing data...")
    if args.file.exists():
        existing = read_existing_cpi(args.file)
        new_years = set(rates.keys()) - set(existing.keys())
        changed_years = {y for y in rates if y in existing and abs(rates[y] - existing[y]) > 0.05}

        if new_years:
            print(f"  NEW years: {sorted(new_years)}")
            for y in sorted(new_years):
                print(f"    {y}: {rates[y]}%")
        if changed_years:
            print(f"  CHANGED years: {sorted(changed_years)}")
            for y in sorted(changed_years):
                print(f"    {y}: {existing[y]}% → {rates[y]}%")
        if not new_years and not changed_years:
            print("  No changes detected — data is current.")
    else:
        print(f"  WARNING: File not found at {args.file}")
        new_years = set(rates.keys())

    # Step 4: Write
    print("[4/4] Writing updates...")
    if not args.write:
        print("  DRY RUN — pass --write to apply changes.")
        print(f"\n  Data that would be written ({len(rates)} years):")
        for y in sorted(rates.keys()):
            print(f"    {y}: {rates[y]}%")
        print("\n✓ DRY RUN COMPLETE")
        sys.exit(0)

    if not args.file.exists():
        print(f"  ✗ FAILED: Target file does not exist: {args.file}")
        sys.exit(1)

    if update_file(args.file, rates):
        print(f"  ✓ Updated {args.file}")
        print(f"  Latest year: {max(rates.keys())} ({rates[max(rates.keys())]}%)")
        print(f"\n✓ CPI UPDATE COMPLETE")
        sys.exit(0)
    else:
        print(f"\n✗ FAILED: Could not update file.")
        sys.exit(1)


if __name__ == "__main__":
    main()
