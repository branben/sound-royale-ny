#!/usr/bin/env python3
"""
Beads Migration Script

Usage:
    python scripts/migrate_beads.py --input .beads/issues.jsonl --output .beads/issues.jsonl --transform add_owner_field

Transforms beads data without directly rewriting the file.
Run this script locally to apply migrations, then commit the script (not the data).

Available transforms:
    - add_owner_field: Adds 'owner' field to beads missing it (for Gas Town integration)
    - deduplicate_ids: Removes duplicate bead IDs, keeping last occurrence
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


def add_owner_field(bead: dict) -> dict:
    """Add owner field to bead if missing (for Gas Town integration)."""
    if "owner" not in bead:
        bead["owner"] = "brandonbennett@Pursuits-Air.lan"
    return bead


def deduplicate_ids(beads: list) -> list:
    """Remove duplicate bead IDs, keeping last occurrence."""
    seen = {}
    for bead in beads:
        seen[bead.get("id")] = bead
    return list(seen.values())


def transform_beads(beads: list, transform: str) -> list:
    """Apply transformation to beads."""
    if transform == "add_owner_field":
        return [add_owner_field(bead) for bead in beads]
    elif transform == "deduplicate_ids":
        return deduplicate_ids(beads)
    else:
        raise ValueError(f"Unknown transform: {transform}")


def main():
    parser = argparse.ArgumentParser(description="Migrate beads data")
    parser.add_argument("--input", required=True, help="Input beads JSONL file")
    parser.add_argument("--output", required=True, help="Output beads JSONL file")
    parser.add_argument(
        "--transform",
        required=True,
        choices=["add_owner_field", "deduplicate_ids"],
        help="Transformation to apply",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Show what would change without writing"
    )

    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)

    # Read beads
    beads = []
    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                beads.append(json.loads(line))

    print(f"Loaded {len(beads)} beads from {input_path}")

    # Apply transformation
    transformed = transform_beads(beads, args.transform)

    print(f"Transformed to {len(transformed)} beads using '{args.transform}'")

    if args.dry_run:
        print("\n--- Dry run: changes would be ---")
        for i, (orig, trans) in enumerate(zip(beads, transformed)):
            if orig != trans:
                print(f"\nBead {i}: {orig.get('id', 'unknown')}")
                print(f"  Before: {json.dumps(orig, indent=2)[:200]}...")
                print(f"  After:  {json.dumps(trans, indent=2)[:200]}...")
        print("\n--- End dry run ---")
        return

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        for bead in transformed:
            f.write(json.dumps(bead, ensure_ascii=False) + "\n")

    print(f"\nWrote {len(transformed)} beads to {output_path}")
    print("\nNext steps:")
    print("  1. Review the changes: git diff")
    print("  2. Commit the migration script (not the data)")
    print(
        "  3. Other devs run: python scripts/migrate_beads.py --input .beads/issues.jsonl --output .beads/issues.jsonl --transform add_owner_field"
    )


if __name__ == "__main__":
    main()
