#!/usr/bin/env bash
# Anti-pattern guard — scans staged files for known churn-driver patterns.
# Fails the commit if any pattern is found.
#
# This is the first layer of the guardrail system. It catches literal
# anti-patterns at commit time. Semantic variations are caught by the
# CI semantic scan (cocoindex) — this script is intentionally simple.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

issues=0
files_checked=0

# Get staged files (only the ones being added/modified)
staged_files=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)

if [ -z "$staged_files" ]; then
    echo -e "${GREEN}✓${NC} No staged files to check"
    exit 0
fi

echo ""
echo "═══ Anti-Pattern Guard ═══"
echo ""

# Check a single file for anti-patterns
check_file() {
    local file="$1"
    local file_issues=0

    # Only check source files
    if ! echo "$file" | grep -qE '\.(ts|tsx|py)$'; then
        return 0
    fi

    files_checked=$((files_checked + 1))

    # Pattern 1: Empty TypeScript catch block (with or without param)
    # Matches: } catch {}   OR   } catch (e) {}   OR   } catch (err) {}
    if grep -nE 'catch\s*(\([^)]*\))?\s*\{\s*\}' "$file" 2>/dev/null; then
        echo -e "${RED}✗${NC} $file: Empty catch block (silent error swallowing)"
        file_issues=$((file_issues + 1))
    fi

    # Pattern 2: Catch block with only a comment inside (no throw/return/feedback)
    if grep -nE 'catch\s*(\([^)]*\))?\s*\{[^}]*\}' "$file" 2>/dev/null | grep -v "throw\|return\|console\.\(error\|warn\)\|toast\|setError\|alert\|notify" >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠${NC} $file: Catch block with only comments (likely silent)"
        file_issues=$((file_issues + 1))
    fi

    # Pattern 3+4: Bare except with pass or only comment (Python)
    if awk '/^[[:space:]]*except[[:space:]]*.*:/{found=1; line=NR; next} found && NR==line+1 && /^[[:space:]]*pass/{print "BARE_EXCEPT:" line; found=0} found && NR>line+1{found=0}' "$file" 2>/dev/null | grep -q "BARE_EXCEPT"; then
        echo -e "${RED}✗${NC} $file: Bare except with pass (silent error)"
        file_issues=$((file_issues + 1))
    fi

    # Pattern 5: player_secret in URL query string (security)
    if grep -nE '(secret|player_secret|password|token)\s*=\s*.*searchParams|searchParams\.set\s*\(\s*["'"'"'](secret|player_secret|password|token)' "$file" 2>/dev/null; then
        echo -e "${RED}✗${NC} $file: Secret/token sent in URL query string"
        file_issues=$((file_issues + 1))
    fi

    # Pattern 6: console.error as only error handling (heuristic)
    # Only flag if console.error is the last statement in a catch block
    if grep -nE 'console\.(error|warn)\([^)]*\)\s*;\s*$' "$file" 2>/dev/null; then
        echo -e "${YELLOW}⚠${NC} $file: console.error/warn without re-throw or user feedback"
        file_issues=$((file_issues + 1))
    fi

    issues=$((issues + file_issues))
}

# Check each staged file
while IFS= read -r file; do
    if [ -f "$file" ]; then
        check_file "$file"
    fi
done <<< "$staged_files"

echo ""
if [ "$issues" -gt 0 ]; then
    echo -e "${RED}Anti-pattern guard: $issues issue(s) found in $files_checked file(s)${NC}"
    echo ""
    echo "These patterns are known to cause user churn in production."
    echo "See docs/plans/2026-06-25-001-quality-churn-guardrails-plan.md for context."
    echo ""
    echo "To bypass (not recommended): git commit --no-verify"
    exit 1
else
    echo -e "${GREEN}✓${NC} Anti-pattern guard: $files_checked file(s) clean"
    exit 0
fi
