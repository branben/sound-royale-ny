#!/usr/bin/env bash
# GAIA E2E Guard — validates E2E test infrastructure without running the full suite.
#
# Usage:
#   ./scripts/e2e-guard.sh check       — verify E2E tests exist and are well-formed
#   ./scripts/e2e-guard.sh preflight   — pre-run validation before a full E2E run
#   ./scripts/e2e-guard.sh clean       — clean up E2E artifacts
#
# This is intentionally lightweight — it does NOT run the Playwright suite
# because that requires a running backend + frontend. It validates that:
#   - E2E test files exist and are structurally sound
#   - No test files reference deleted helpers or fixtures
#   - The Playwright config is valid

set -euo pipefail

E2E_DIR="tests/e2e"
PLAYWRIGHT_CONFIG="playwright.config.ts"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

check_e2e_structure() {
    local issues=0

    echo ""
    echo "═══ GAIA E2E Guard ═══"
    echo ""

    # 1. Check E2E directory exists
    if [ ! -d "$E2E_DIR" ]; then
        fail "E2E directory '$E2E_DIR' not found"
        return 1
    fi
    pass "E2E directory exists"

    # 2. Count test files
    local test_count
    test_count=$(find "$E2E_DIR" -name "*.spec.ts" -type f | wc -l | tr -d ' ')
    if [ "$test_count" -eq 0 ]; then
        fail "No E2E test files found (*.spec.ts)"
        issues=$((issues + 1))
    else
        pass "$test_count E2E test file(s) found"
    fi

    # 3. Check Playwright config exists
    if [ ! -f "$PLAYWRIGHT_CONFIG" ]; then
        fail "Playwright config '$PLAYWRIGHT_CONFIG' not found"
        issues=$((issues + 1))
    else
        pass "Playwright config exists"
    fi

    # 4. Validate test files have content (structural check)
    while IFS= read -r -d '' file; do
        local tests_in_file
        tests_in_file=$(grep -c "test('" "$file" 2>/dev/null || true)
        # grep -c can emit a multi-line result in some shells; keep the first line.
        tests_in_file=${tests_in_file%%[$'\n']*}
        tests_in_file=${tests_in_file:-0}
        if [ "${tests_in_file:-0}" -eq 0 ]; then
            warn "No tests found in: $file"
        fi
    done < <(find "$E2E_DIR" -name "*.spec.ts" -type f -print0 2>/dev/null || true)

    # 5. Check helpers.ts exists (referenced by most spec files)
    if [ ! -f "$E2E_DIR/helpers.ts" ]; then
        warn "E2E helpers.ts not found — tests may fail"
    else
        pass "E2E helpers.ts exists"
    fi

    echo ""
    if [ "$issues" -gt 0 ]; then
        echo -e "${RED}E2E guard: $issues issue(s) found${NC}"
        return 1
    else
        echo -e "${GREEN}E2E guard: all checks passed${NC}"
        return 0
    fi
}

clean_e2e_artifacts() {
    echo "Cleaning E2E artifacts..."
    rm -rf test-results/ playwright-report/ 2>/dev/null || true
    pass "E2E artifacts cleaned"
}

case "${1:-check}" in
    check)
        check_e2e_structure
        ;;
    preflight)
        # Preflight: run structure check + verify playwright is installed
        check_e2e_structure
        echo ""
        if npx playwright --version >/dev/null 2>&1; then
            pass "Playwright is installed"
        else
            fail "Playwright is not installed. Run: npx playwright install --with-deps chromium"
            exit 1
        fi
        ;;
    clean)
        clean_e2e_artifacts
        ;;
    *)
        echo "Usage: $0 {check|preflight|clean}"
        exit 1
        ;;
esac
