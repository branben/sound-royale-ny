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
    # Excludes: pass followed by finally (cleanup pattern), pass inside
    # get_object/fall-through methods, CancelledError in asyncio cleanup.
    if python3 -c "
import sys
lines = open('$file').readlines()
except_indices = [i for i, l in enumerate(lines) if l.strip().startswith('except') and l.strip().endswith(':')]
for idx in except_indices:
    next_line = lines[idx + 1].strip() if idx + 1 < len(lines) else ''
    if next_line != 'pass':
        continue
    # Check: pass followed by finally dentro    following = [l.strip() for l in lines[idx+2:idx+4] if l.strip()]
    if following and following[0].startswith('finally'):
        continue
    # Check: inside get_object method (look back for def get_object)
    context = ''.join(lines[max(0,idx-10):idx])
    if 'def get_object' in context or 'lookup_field' in context:
        continue
    # Check: except CancelledError (asyncio cleanup)
    if 'CancelledError' in lines[idx]:
        continue
    print(f'BARE_EXCEPT:{idx+1}')
    break
" 2>/dev/null | grep -q "BARE_EXCEPT"; then
        echo -e "${RED}✗${NC} $file: Bare except with pass (silent error)"
        file_issues=$((file_issues + 1))
    fi

    # Pattern 5: player_secret in URL query string (security)
    if grep -nE '(secret|player_secret|password|token)\s*=\s*.*searchParams|searchParams\.set\s*\(\s*["'"'"'](secret|player_secret|password|token)' "$file" 2>/dev/null; then
        echo -e "${RED}✗${NC} $file: Secret/token sent in URL query string"
        file_issues=$((file_issues + 1))
    fi

    # Pattern 6: console.error/warn inside catch block (likely silent)
    if awk '/catch\s*(\([^)]*\))?\s*\{/{in_catch=1; next} in_catch && /\}/{in_catch=0} in_catch && /console\.(error|warn)\(/{print "CONSOLE_IN_CATCH:" NR; in_catch=0}' "$file" 2>/dev/null | grep -q "CONSOLE_IN_CATCH"; then
        echo -e "${YELLOW}⚠${NC} $file: console.error/warn inside catch block without re-throw or user feedback"
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
