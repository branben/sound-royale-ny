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
import re


def sanitize_for_logging(bead: dict) -> dict:
    """Remove or redact PII from bead for safe logging.
    
    Prevents accidental PII exposure in dry-run logs.
    """
    sensitive_fields = ["owner", "email", "contact", "phone"]
    pii_patterns = [
        r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",  # Email
        r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b",  # Phone
    ]
    
    sanitized = dict(bead)
    
    # Redact sensitive fields that might contain PII
    for field in sensitive_fields:
        if field in sanitized:
            value = str(sanitized[field])
            # Check if it looks like PII
            if "@" in value or re.search(r"\d{3}[-.]?\d{3}[-.]?\d{4}", value):
                sanitized[field] = "[REDACTED]"
    
    # Redact any PII patterns in string values
    for key, value in sanitized.items():
        if isinstance(value, str):
            for pattern in pii_patterns:
                if re.search(pattern, value):
                    sanitized[key] = "[REDACTED]"
                    break
    
    return sanitized


def add_owner_field(bead: dict) -> dict:
    """Add owner field to bead if missing (for Gas Town integration).
    
    Uses role-based identifier (sound_royale_ny/mayor) instead of personal email.
    See .gaia_skills/pii-prevention/SKILL.md for PII prevention guidelines.
    """
    if "owner" not in bead:
        # Use role-based identifier to prevent PII exposure
        bead["owner"] = "sound_royale_ny/mayor"
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

    # Read beads with error handling for malformed JSONL
    beads = []
    with open(input_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if line:
                try:
                    beads.append(json.loads(line))
                except json.JSONDecodeError as e:
                    print(f"Warning: Skipping malformed JSON at line {line_num}: {e}")
                    continue

    print(f"Loaded {len(beads)} beads from {input_path}")

    # Apply transformation
    transformed = transform_beads(beads, args.transform)

    print(f"Transformed to {len(transformed)} beads using '{args.transform}'")

    if args.dry_run:
        print("\n--- Dry run: changes would be ---")
        for i, (orig, trans) in enumerate(zip(beads, transformed)):
            if orig != trans:
                print(f"\nBead {i}: {orig.get('id', 'unknown')}")
                # Use sanitized output to prevent PII exposure in logs
                print(f"  Before: {json.dumps(sanitize_for_logging(orig), indent=2)[:200]}...")
                print(f"  After:  {json.dumps(sanitize_for_logging(trans), indent=2)[:200]}...")
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
