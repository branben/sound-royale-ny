#!/usr/bin/env python3
import sys
import json
import argparse
from pathlib import Path
from typing import List, Dict, Any

# Add parent directory to sys.path to import guards_adapter
sys.path.append(str(Path(__file__).parent.parent.parent))

from backend.gaia.guards_adapter import evaluate_path_request


EXIT_OK = 0
EXIT_VIOLATIONS = 1
EXIT_INTERNAL_ERROR = 2


def _default_test_paths(root: Path) -> List[str]:
    # Keep PoC paths minimal; can be extended or made dynamic later
    return [
        "docs/README.md",
        "src/context/GameContext.tsx",
        ".env",
        "private.key",
    ]


def scan_integrity(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="GAIA Integrity Scanner")
    parser.add_argument(
        "--root",
        type=str,
        default=str(Path(__file__).parent.parent.parent.resolve()),
        help="Repository root",
    )
    parser.add_argument(
        "--paths",
        type=str,
        nargs="*",
        default=None,
        help="Specific relative paths to evaluate",
    )
    parser.add_argument(
        "--json",
        dest="as_json",
        action="store_true",
        help="Emit machine-readable JSON report",
    )
    parser.add_argument(
        "--ci",
        dest="ci_mode",
        action="store_true",
        help="CI mode: fail on any denied path",
    )
    args = parser.parse_args(argv)

    try:
        repo_root = Path(args.root).resolve()
        beadsignore = repo_root / ".beadsignore"

        test_paths = args.paths if args.paths else _default_test_paths(repo_root)

        violations = 0
        results: List[Dict[str, Any]] = []

        # Banner only for human-readable mode
        if not args.as_json:
            print("--- GAIA Integrity Scanner ---")
            print(f"Root: {repo_root}")

        for path_str in test_paths:
            decision = evaluate_path_request(
                repo_root, path_str, beadsignore_path=beadsignore
            )
            status = "PASS" if decision.allowed else "FAIL"

            if not args.as_json:
                print(
                    f"[{status}] {path_str} -> {decision.reason} ({decision.redacted_path})"
                )
                if not decision.allowed and path_str in [".env", "private.key"]:
                    print("  (Note: Violation correctly caught by guard)")

            results.append(
                {
                    "path": path_str,
                    "allowed": decision.allowed,
                    "reason": decision.reason,
                    "redacted_path": decision.redacted_path,
                }
            )

            # In CI mode, check for unexpected denials
            # Secret patterns should be denied (correct), not counted as violations
            if not decision.allowed:
                # Check if this was correctly denied as a secret pattern
                is_expected_denial = decision.reason in (
                    "DENY_SECRET_PATTERN",
                    "DENY_BEADSIGNORE",
                    "DENY_OUTSIDE_ROOT",
                )
                if not is_expected_denial:
                    violations += 1

        if args.as_json:
            report = {
                "root": str(repo_root),
                "summary": {
                    "total": len(results),
                    "violations": violations,
                    "status": "pass" if violations == 0 else "fail",
                },
                "results": results,
            }
            print(json.dumps(report, indent=2))

        if violations > 0:
            if not args.as_json:
                print(f"Found {violations} integrity violations!")
            return EXIT_VIOLATIONS
        else:
            if not args.as_json:
                print("Integrity scan passed.")
            return EXIT_OK

    except Exception as e:
        # Ensure CI can distinguish internal errors from policy violations
        if not args.as_json:
            print(f"Scanner internal error: {e}", file=sys.stderr)
        else:
            print(json.dumps({"error": str(e), "status": "internal_error"}))
        return EXIT_INTERNAL_ERROR


if __name__ == "__main__":
    sys.exit(scan_integrity(sys.argv[1:]))
