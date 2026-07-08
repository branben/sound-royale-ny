#!/usr/bin/env python3
"""Gate: fail if docs/specs/success-criteria.json has open gaps or uncovered criteria.

Part of the harness-ready definition-of-done loop (see
docs/plans/2026-07-08-harness-ready-cleanup-plan.md, Phase 2).

Exit code 0 = all criteria covered, no gaps (definition of done met).
Exit code 1 = gaps or uncovered criteria present (merge should be blocked).
"""
import json
import sys
from pathlib import Path

SPEC = Path(__file__).parent / "docs" / "specs" / "success-criteria.json"


def main() -> int:
    if not SPEC.exists():
        print(f"ERROR: spec not found at {SPEC}", file=sys.stderr)
        return 1

    spec = json.loads(SPEC.read_text())
    failures: list[str] = []

    for mode in spec.get("modes", []):
        mode_id = mode.get("id", "?")
        for crit in mode.get("criteria", []):
            status = crit.get("status")
            if status != "covered":
                failures.append(
                    f"[{mode_id}] {crit.get('id')}: status={status!r} "
                    f"(expected 'covered')"
                )

    for gap in spec.get("gaps", []):
        failures.append(
            f"[gap] {gap.get('mode')}/{gap.get('criterion')}: "
            f"{gap.get('note', 'no note')}"
        )

    if failures:
        print("FAIL: definition of done NOT met:")
        for f in failures:
            print(f"  - {f}")
        print(f"\n{len(failures)} open item(s). Close them to green the gate.")
        return 1

    print("PASS: all success criteria covered, no gaps.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
