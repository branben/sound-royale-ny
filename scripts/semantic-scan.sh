#!/usr/bin/env bash
# Semantic regression scan — uses cocoindex to detect churn-driver patterns
# that pre-commit hooks might miss (semantic variations, not literal text).
#
# This is Layer 4 of the guardrail system. It runs in CI on PRs.
# Pre-commit hooks (Layer 1) catch literal patterns. This catches
# semantic variations: catch (e) { /* TODO */ }, except: logging.debug(e), etc.
#
# Requires: cocoindex CLI (already integrated in this repo)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

issues=0

echo ""
echo "═══ Semantic Regression Scan ═══"
echo ""

# Check if cocoindex is available
if ! command -v cocoindex &> /dev/null; then
    echo -e "${YELLOW}⚠${NC} cocoindex not available — skipping semantic scan"
    echo "Install cocoindex to enable this guardrail layer."
    exit 0
fi

# Each query searches for a semantic anti-pattern.
# If any query returns results, the PR introduces a known churn driver.

run_scan() {
    local query="$1"
    local description="$2"
    local severity="${3:-error}"

    local results
    results=$(cocoindex search "$query" --limit 5 2>/dev/null || echo "")

    if [ -n "$results" ] && echo "$results" | grep -q "file_path\|path\|File:"; then
        echo -e "${RED}✗${NC} $description"
        echo "   Query: $query"
        echo "$results" | head -10
        echo ""
        issues=$((issues + 1))
    else
        echo -e "${GREEN}✓${NC} $description"
    fi
}

# Churn driver #1: WebSocket reconnect without state re-fetch
run_scan "websocket reconnect without state refresh or full state fetch" \
    "WebSocket reconnect must re-fetch full state"

# Churn driver #2: Silent error handling
run_scan "empty catch block silent error handling swallow" \
    "No silent error handling (empty catches)"

run_scan "bare except pass python no error handling" \
    "No bare except in Python"

# Churn driver #3: Missing transaction safety
run_scan "database save update without transaction atomic" \
    "DB mutations use transaction.atomic"

# Churn driver #5: Secrets in URLs
run_scan "secret token password in url query parameter" \
    "No secrets in URL query strings"

# Churn driver #6: Audio upload without progress
run_scan "audio upload without progress indicator or validation" \
    "Audio upload has progress + validation"

echo ""
if [ "$issues" -gt 0 ]; then
    echo -e "${RED}Semantic scan: $issues pattern(s) detected${NC}"
    echo ""
    echo "These semantic patterns are known to cause user churn."
    echo "See docs/plans/2026-06-25-001-quality-churn-guardrails-plan.md"
    exit 1
else
    echo -e "${GREEN}✓${NC} Semantic scan: all patterns clean"
    exit 0
fi
