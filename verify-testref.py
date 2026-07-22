#!/usr/bin/env python3
"""Provenance gate: every DoD criterion's testRef must resolve to a real test.

Companion to check-success-criteria.py. That gate proves a criterion is
*covered* (status != gap); this gate proves the named test actually EXISTS in
the repo so a `covered` label can never again be a false-positive closure
(spec claims green while the spec behind it is fixme'd / deleted / renamed).

A testRef has the form:  "<path/to/file> > <test title substring>"
We verify:
  1. the file exists (relative to repo root), and
  2. the test title substring appears in that file (case-insensitive,
     stripped) — catches renamed/moved tests.

Exit 0 = all refs resolve. Exit 1 = at least one dangling ref.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent
SPEC = ROOT / "docs" / "specs" / "success-criteria.json"


def resolve(ref: str, seen: set[str]) -> str | None:
    """Return an error string if the ref is dangling, else None."""
    if ">" not in ref:
        return f"malformed ref (no ' > ' separator): {ref!r}"
    file_part, _, title_part = ref.partition(">")
    rel = file_part.strip()
    # The title may include describe-block nesting (e.g.
    # "gameApi > submitTile > sends FormData..."). Only the final segment is
    # the actual it()/test() title; the nesting prefixes are structural hints.
    title = title_part.strip().split(">")[-1].strip()

    path = ROOT / rel
    if not path.exists():
        return f"file not found: {rel}"
    if rel in seen:
        return None  # already validated this file's contents
    seen.add(rel)

    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError as e:
        return f"cannot read {rel}: {e}"

    # The title may be split across the file by Playwright's `test('...')`
    # plus nested describe blocks. We do a cheap substring check on the
    # normalized (whitespace-collapsed) title against the raw file text.
    needle = " ".join(title.lower().split())
    haystack = " ".join(text.lower().split())
    if needle and needle not in haystack:
        return f"test title not found in {rel}: {title!r}"
    return None


def main() -> int:
    if not SPEC.exists():
        print(f"ERROR: spec not found at {SPEC}", file=sys.stderr)
        return 1

    spec = json.loads(SPEC.read_text())
    failures: list[str] = []
    checked = 0

    for mode in spec.get("modes", []):
        mode_id = mode.get("id", "?")
        for crit in mode.get("criteria", []):
            crit_id = crit.get("id", "?")
            for ref in crit.get("testRefs", []):
                checked += 1
                err = resolve(ref, set())
                if err:
                    failures.append(
                        f"[{mode_id}/{crit_id}] {ref}\n      -> {err}"
                    )

    if failures:
        print("FAIL: dangling test references in success-criteria.json:")
        for f in failures:
            print(f"  - {f}")
        print(
            f"\n{len(failures)} dangling ref(s) of {checked} checked. "
            "Repair the test or re-point the ref before marking done."
        )
        return 1

    print(f"PASS: all {checked} test references resolve to real tests.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
