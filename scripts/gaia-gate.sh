#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════╗
# ║                    GAIA PRE-PUSH GATE                        ║
# ║               "the polecat inside gas town"                  ║
# ╚══════════════════════════════════════════════════════════════╝
#
# Automatically invoked by .husky/pre-push before code reaches origin.
# Validates your code in an isolated worktree so your working directory
# stays untouched. Only forwards to origin when everything passes.
#
# Architecture (inspired by kunchenguid/no-mistakes):
#   1. Create a disposable Git worktree from the pushed ref
#   2. Run all checks in that isolated environment
#   3. Auto-fix safe issues (lint) and propagate fixes back
#   4. Report/escalate non-obvious issues to the developer
#   5. Push proceeds ONLY if all gates pass
#
# Usage:
#   ./scripts/gaia-gate.sh                        — run all gates
#   ./scripts/gaia-gate.sh --push-ref <sha>       — validate a specific commit
#   ./scripts/gaia-gate.sh --quick                — skip slow tests
#   ./scripts/gaia-gate.sh --local                — run on current working tree

set -euo pipefail

# ── Colors ─────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# ── State ──────────────────────────────────────────────────────
QUICK_MODE=false
LOCAL_MODE=false
WORKTREE_DIR=""
CLEANUP_NEEDED=false
GATE_FAILED=false
AUTO_FIXES_APPLIED=false
PUSH_REF=""
START_TIME=$(date +%s)
REPO_ROOT=""

# ── Parse args ─────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --quick) QUICK_MODE=true; shift ;;
        --local) LOCAL_MODE=true; shift ;;
        --push-ref) PUSH_REF="$2"; shift 2 ;;
        *) shift ;;
    esac
done

# ── Banner ─────────────────────────────────────────────────────
banner() {
    echo ""
    echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}${BOLD}║${NC}              ${BOLD}GAIA PRE-PUSH GATE${NC}                     ${CYAN}${BOLD}║${NC}"
    echo -e "${CYAN}${BOLD}║${NC}         ${GRAY}\"the polecat inside gas town\"${NC}             ${CYAN}${BOLD}║${NC}"
    echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# ── Helpers ────────────────────────────────────────────────────
pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; GATE_FAILED=true; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
info() { echo -e "  ${CYAN}→${NC} $1"; }
detail() { echo -e "    ${GRAY}$1${NC}"; }

section() {
    echo ""
    echo -e "${BOLD}── $1 ──${NC}"
    echo ""
}

cleanup() {
    if [ "$CLEANUP_NEEDED" = true ] && [ -n "$WORKTREE_DIR" ] && [ -d "$WORKTREE_DIR" ]; then
        info "Cleaning up isolated worktree..."
        git worktree remove --force "$WORKTREE_DIR" 2>/dev/null || {
            rm -rf "$WORKTREE_DIR" 2>/dev/null || true
        }
        git worktree prune 2>/dev/null || true
    fi
}

trap cleanup EXIT

# ── Find repo root ─────────────────────────────────────────────
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$(pwd)")

# When the frontend deps aren't installed locally (no node_modules), the
# node-based gates (tsc / eslint / vitest / build) can't run faithfully and
# would hard-fail every push from a clean checkout. CI is the authority for
# those checks, so we skip them with a warning instead of blocking delivery.
# Detect once; backend (Django/pytest), e2e-guard, and secret-scan still run.
FRONTEND_DEPS_PRESENT=false
if [ -e "$REPO_ROOT/node_modules" ]; then
    FRONTEND_DEPS_PRESENT=true
fi

# ── Worktree isolation ─────────────────────────────────────────
setup_worktree() {
    if [ "$LOCAL_MODE" = true ]; then
        info "Running in local mode (current working tree)"
        PROJECT_DIR="$REPO_ROOT"
        return
    fi

    # Determine the ref to validate
    local ref="${PUSH_REF:-HEAD}"

    info "Creating isolated worktree from ${ref:0:9}..."

    # Create a unique temp directory
    WORKTREE_DIR=$(mktemp -d /tmp/gaia-gate-XXXXXX)
    CLEANUP_NEEDED=true

    # Create the worktree
    if ! git worktree add --detach "$WORKTREE_DIR" "$ref" 2>/dev/null; then
        # Fallback: use HEAD directly
        warn "Could not create worktree from $ref, using HEAD..."
        git worktree add "$WORKTREE_DIR" HEAD 2>/dev/null || {
            fail "Failed to create worktree. Falling back to local mode."
            LOCAL_MODE=true
            PROJECT_DIR="$REPO_ROOT"
            return
        }
    fi

    PROJECT_DIR="$WORKTREE_DIR"
    pass "Worktree created at $(basename "$WORKTREE_DIR")"

    # Symlink node_modules instead of reinstalling (fast)
    if [ -d "$REPO_ROOT/node_modules" ]; then
        ln -sf "$REPO_ROOT/node_modules" "$WORKTREE_DIR/node_modules" 2>/dev/null || true
    fi
}

# ── Gate 1: TypeScript typecheck ───────────────────────────────
gate_typescript() {
    section "Gate 1: TypeScript Typecheck"

    if [ "$FRONTEND_DEPS_PRESENT" = false ]; then
        warn "node_modules missing — skipping TypeScript check (CI is authoritative)"
        return
    fi

    local tsconfig="$PROJECT_DIR/tsconfig.json"
    if [ ! -f "$tsconfig" ]; then
        warn "No tsconfig.json found — skipping"
        return
    fi

    local output
    if output=$(cd "$PROJECT_DIR" && npx tsc --noEmit 2>&1); then
        pass "TypeScript: zero type errors"
    else
        fail "TypeScript type errors found:"
        echo ""
        echo "$output" | head -30 | while IFS= read -r line; do
            echo -e "    ${RED}$line${NC}"
        done
        local error_count
        error_count=$(echo "$output" | grep -c "error TS" || echo "0")
        detail "$error_count type error(s) total"
        echo ""
        return 1
    fi
}

# ── Gate 2: ESLint (with auto-fix) ─────────────────────────────
gate_lint() {
    section "Gate 2: ESLint (lint + auto-fix)"

    if [ "$FRONTEND_DEPS_PRESENT" = false ]; then
        warn "node_modules missing — skipping ESLint (CI is authoritative)"
        return
    fi

    local eslint_config="$PROJECT_DIR/eslint.config.js"
    if [ ! -f "$eslint_config" ]; then
        warn "No eslint.config.js found — skipping"
        return
    fi

    # Run auto-fix first, then check remaining issues
    info "Auto-fixing safe issues..."
    cd "$PROJECT_DIR" && npx eslint . --fix --quiet 2>/dev/null || true

    # Now check what remains (unfixable issues)
    info "Checking for remaining issues..."
    local output
    local exit_code=0
    output=$(cd "$PROJECT_DIR" && npx eslint . --format json 2>/dev/null) || exit_code=$?

    if [ -z "$output" ] || [ "$output" = "[]" ]; then
        pass "ESLint: clean — no issues"
        return
    fi

    # Parse JSON output for error/warning counts (use python3, fall back to python3.11)
    local py_cmd=""
    if command -v python3 >/dev/null 2>&1; then
        py_cmd="python3"
    elif command -v python3.11 >/dev/null 2>&1; then
        py_cmd="python3.11"
    else
        warn "No Python found — using raw ESLint exit code"
        if [ $exit_code -ne 0 ]; then
            fail "ESLint found errors (install Python for detailed report)"
            return 1
        fi
        pass "ESLint: clean"
        return 0
    fi

    local error_count=0
    local warning_count=0
    error_count=$(echo "$output" | $py_cmd -c "
import json, sys
data = json.load(sys.stdin)
errors = sum(1 for f in data for m in f.get('messages', []) if m.get('severity') == 2)
warnings = sum(1 for f in data for m in f.get('messages', []) if m.get('severity') == 1)
print(errors)
" 2>/dev/null || echo "0")

    warning_count=$(echo "$output" | $py_cmd -c "
import json, sys
data = json.load(sys.stdin)
warnings = sum(1 for f in data for m in f.get('messages', []) if m.get('severity') == 1)
print(warnings)
" 2>/dev/null || echo "0")

    if [ "$error_count" -gt 0 ]; then
        fail "ESLint: $error_count error(s), $warning_count warning(s) remain"
        echo "$output" | $py_cmd -c "
import json, sys
data = json.load(sys.stdin)
for f in data:
    for m in f.get('messages', []):
        sev = 'ERROR' if m.get('severity') == 2 else 'WARN'
        print(f\"    {f['filePath']}:{m['line']}:{m['column']}  {sev}  {m['message']}\")
" 2>/dev/null || true
        echo ""
        return 1
    elif [ "$warning_count" -gt 0 ]; then
        warn "ESLint: $warning_count warning(s) — no errors"
        AUTO_FIXES_APPLIED=true
    else
        pass "ESLint: clean"
        AUTO_FIXES_APPLIED=true
    fi
}

# ── Gate 3: Unit tests (Vitest) ────────────────────────────────
gate_unit_tests() {
    if [ "$QUICK_MODE" = true ]; then
        section "Gate 3: Unit Tests ${GRAY}(skipped in quick mode)${NC}"
        warn "Skipping unit tests (--quick mode)"
        return
    fi

    section "Gate 3: Unit Tests (Vitest)"

    if [ "$FRONTEND_DEPS_PRESENT" = false ]; then
        warn "node_modules missing — skipping Vitest (CI is authoritative)"
        return
    fi

    local vitest_config="$PROJECT_DIR/vitest.config.ts"
    if [ ! -f "$vitest_config" ]; then
        warn "No vitest.config.ts found — skipping"
        return
    fi

    info "Running Vitest..."
    # Pin NODE_ENV=test so the gate is hermetic and does not inherit an ambient
    # value (e.g. NODE_ENV=production). React's production jsx-dev-runtime exports
    # `jsxDEV = void 0`, and the SWC dev JSX transform emits jsxDEV(...) calls, so
    # a production env makes every .test.tsx file throw "jsxDEV is not a function".
    if (cd "$PROJECT_DIR" && NODE_ENV=test npx vitest run --reporter=verbose); then
        pass "Unit tests: all passing"
    else
        fail "Unit tests failed"
        return 1
    fi
}

# ── Gate 4: Backend tests ──────────────────────────────────────
gate_backend_tests() {
    if [ "$QUICK_MODE" = true ]; then
        section "Gate 4: Backend Tests ${GRAY}(skipped in quick mode)${NC}"
        warn "Skipping backend tests (--quick mode)"
        return
    fi

    section "Gate 4: Backend Tests (Django)"

    local manage_py="$PROJECT_DIR/backend/manage.py"
    if [ ! -f "$manage_py" ]; then
        warn "No backend/manage.py found — skipping"
        return
    fi

    info "Running Django tests..."
    local py_cmd=""
    if command -v python3 >/dev/null 2>&1 && python3 -c "import django" 2>/dev/null; then
        py_cmd="python3"
    elif command -v python3.11 >/dev/null 2>&1 && python3.11 -c "import django" 2>/dev/null; then
        py_cmd="python3.11"
    else
        warn "No Python with Django installed — skipping backend tests"
        return
    fi
    if (cd "$PROJECT_DIR/backend" && \
        DJANGO_SETTINGS_MODULE=sound_royale_api.settings_test \
        PYTHONPATH="$PROJECT_DIR/backend" \
        "$py_cmd" -m pytest --tb=short -q); then
        pass "Backend tests: all passing"
    else
        fail "Backend tests failed"
        return 1
    fi
}

# ── Gate 5: Build check ─────────────────────────────────────────
gate_build() {
    section "Gate 5: Build Check"

    # Resilience: a missing local install must NOT hard-block a code push.
    # CI runs the authoritative production build on every PR, so a fresh/clean
    # checkout without node_modules should warn + skip rather than fail the
    # entire pre-push gate (env debt must not block delivery).
    if [ ! -e "$PROJECT_DIR/node_modules" ]; then
        warn "node_modules not found at $PROJECT_DIR — skipping build gate."
        warn "Run 'pnpm install' to enable the local build check; CI runs the real build."
        return
    fi

    info "Running production build..."
    if (cd "$PROJECT_DIR" && npm run build); then
        pass "Build: successful"
    else
        fail "Build failed"
        return 1
    fi
}

# ── Gate 6: E2E guard ──────────────────────────────────────────
gate_e2e_guard() {
    section "Gate 6: E2E Guard"

    local guard_script="$PROJECT_DIR/scripts/e2e-guard.sh"
    if [ ! -f "$guard_script" ]; then
        warn "E2E guard script not found — skipping"
        return
    fi

    info "Running E2E guard checks..."
    if bash "$guard_script" check; then
        pass "E2E guard: passed"
    else
        fail "E2E guard checks failed"
        return 1
    fi
}

# ── Gate 7: Secret scan ────────────────────────────────────────
gate_secrets() {
    section "Gate 7: Secret Scan"

    local violations=0

    info "Scanning for secrets..."

    # Check for playerSecret in frontend source (matching CI patterns)
    if command -v rg >/dev/null 2>&1; then
        # playerSecret in console.log (log exposure)
        if rg -q "console\.log[^\n]*playerSecret" "$PROJECT_DIR/src" --type ts --type tsx 2>/dev/null; then
            warn "playerSecret found in console.log"
            violations=$((violations + 1))
        fi

        # playerSecret literal values in API objects
        if rg -q "playerSecret['\"]?\s*:\s*['\"][^'\"]+['\"]" "$PROJECT_DIR/src" --type ts --type tsx 2>/dev/null; then
            warn "playerSecret literal value in API object"
            violations=$((violations + 1))
        fi

        # playerSecret exposure in GameContext (console.log, JSON.stringify, etc.)
        if rg -q "console\.(log|error|warn|debug).*playerSecret" "$PROJECT_DIR/src/context/GameContext.tsx" 2>/dev/null; then
            fail "playerSecret exposed in console.log in GameContext.tsx"
            violations=$((violations + 1))
        fi

        # player_secret in Python backend logs
        if rg -q "print.*player_secret" "$PROJECT_DIR/backend" --type py 2>/dev/null; then
            warn "print() exposing player_secret in backend"
            violations=$((violations + 1))
        fi

        if rg -q "logger.*player_secret" "$PROJECT_DIR/backend" --type py 2>/dev/null; then
            warn "logger exposing player_secret in backend"
            violations=$((violations + 1))
        fi
    fi

    if [ "$violations" -eq 0 ]; then
        pass "Secret scan: clean"
    else
        fail "Secret scan: $violations potential issue(s) found"
        return 1
    fi
}

# ── Apply auto-fixes back to real repo ─────────────────────────
apply_fixes() {
    if [ "$AUTO_FIXES_APPLIED" = true ] && [ "$LOCAL_MODE" = false ] && [ -n "$WORKTREE_DIR" ]; then
        echo ""
        info "Propagating auto-fixes back to working tree..."
        # Copy auto-fixed files back from worktree to real repo
        if [ -d "$WORKTREE_DIR/src" ]; then    # Only sync files that actually changed (via ESLint --fix)
    local changed
    changed=$(cd "$WORKTREE_DIR" && git diff --name-only 2>/dev/null || true)
    if [ -n "$changed" ]; then
        echo "$changed" | while IFS= read -r file; do
            [ -f "$WORKTREE_DIR/$file" ] && cp "$WORKTREE_DIR/$file" "$REPO_ROOT/$file" 2>/dev/null || true
        done
        pass "Auto-fixes applied to working tree"
        echo -e "    ${GRAY}Run 'git add -A' to stage the fixes.${NC}"
    else
        pass "No auto-fixable changes to propagate"
    fi
        fi
    elif [ "$AUTO_FIXES_APPLIED" = true ] && [ "$LOCAL_MODE" = true ]; then
        echo ""
        info "Auto-fixes applied directly to working tree."
        echo -e "    ${GRAY}Run 'git add -A' to stage the fixes.${NC}"
    fi
}

# ── Summary ─────────────────────────────────────────────────────
gate_summary() {
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - START_TIME))

    echo ""
    echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"

    if [ "$GATE_FAILED" = true ]; then
        echo -e "  ${RED}${BOLD}⛔ GATE FAILED — push blocked${NC}"
        echo -e "  ${GRAY}Duration: ${duration}s${NC}"
        echo ""
        echo -e "  ${YELLOW}The polecat found issues. Fix them before pushing.${NC}"
        echo ""
        if [ "$QUICK_MODE" = true ]; then
            echo -e "  ${GRAY}Tip: some checks were skipped in --quick mode.${NC}"
            echo -e "  ${GRAY}Run without --quick for full validation.${NC}"
        fi
        echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"
        echo ""
        return 1
    else
        echo -e "  ${GREEN}${BOLD}✅ ALL GATES PASSED — push allowed${NC}"
        echo -e "  ${GRAY}Duration: ${duration}s${NC}"
        echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"
        echo ""
        return 0
    fi
}

# ── Main ────────────────────────────────────────────────────────
main() {
    banner

    # ── Phase 0: Isolate ───────────────────────────────────
    info "Phase 0: Isolating code..."
    setup_worktree

    # ── Phase 1: Fast gates ────────────────────────────────
    gate_typescript   || true
    gate_lint         || true
    gate_secrets      || true

    # ── Phase 2: Test gates ────────────────────────────────
    gate_unit_tests   || true
    gate_backend_tests || true

    # ── Phase 3: Build + E2E guard ─────────────────────────
    gate_build        || true
    gate_e2e_guard    || true

    # ── Phase 4: Propagate fixes + Report ──────────────────
    apply_fixes
    gate_summary
}

main "$@"
