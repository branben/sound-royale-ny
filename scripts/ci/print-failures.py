#!/usr/bin/env python3
"""Print failing Playwright tests + first error line from results.json.

Used by CI to surface exact e2e-full failures in the run log (GitHub
truncates the default line reporter's failure summary).
"""
import json
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "test-results/results.json"
try:
    data = json.load(open(path))
except FileNotFoundError:
    print("no results file")
    sys.exit(0)


def walk(suite):
    for spec in suite.get("specs", []):
        for test in spec.get("tests", []):
            for result in test.get("results", []):
                status = result.get("status")
                if status not in ("passed", "skipped", None):
                    print(f"FAIL: {spec['file']} :: {spec['title']}")
                    errs = result.get("errors") or [{}]
                    msg = (errs[0].get("message", "") or "")[:500].replace("\n", " ")
                    print(f"    {msg}")
    for child in suite.get("suites", []):
        walk(child)


for suite in data.get("suites", []):
    walk(suite)
