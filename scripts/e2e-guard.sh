#!/bin/bash
# e2e-guard.sh - Prevent E2E runs from polluting the repo
# 
# Usage: ./scripts/e2e-guard.sh [preflight|check|clean|install-hook]
#
# This script ensures E2E test runs don't leave behind:
# - dist/ changes
# - .serena/ changes  
# - test-results/ artifacts
# - playwright-report/ churn

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

# Config
FORBIDDEN_PATHS=(
    "dist/"
    ".serena/"
    "test-results/"
    "playwright-report/"
)

run_search() {
    local pattern="$1"
    local path="$2"

    if command -v rg >/dev/null 2>&1; then
        rg -n "$pattern" "$path" || true
        return
    fi

    grep -RInE "$pattern" "$path" || true
}

preflight() {
    echo "== Git status =="
    git status --short

    echo ""
    echo "== Playwright server config =="
    run_search "webServer|baseURL" "playwright.config.ts"

    echo ""
    echo "== E2E route fixture patterns =="
    run_search "page\\.route\\('\\*\\*/api/\\*\\*'|toRoomResponse|mockApiRoutes" "tests/e2e"

    echo ""
    echo "Preflight complete. Define an allowed file list before editing."
}

check_forbidden() {
    echo "🔍 Checking for forbidden diffs..."
    
    local found_forbidden=0
    
    for path in "${FORBIDDEN_PATHS[@]}"; do
        if [ -n "$(git status --short -- "$path")" ]; then
            echo "❌ Forbidden diff detected: $path"
            git status --short -- "$path"
            found_forbidden=1
        fi
    done
    
    if [ $found_forbidden -eq 1 ]; then
        echo ""
        echo "⚠️  E2E run created forbidden changes!"
        echo "Run: ./scripts/e2e-guard.sh clean"
        exit 1
    fi
    
    echo "✅ No forbidden diffs detected"
}

clean_artifacts() {
    echo "🧹 Cleaning E2E artifacts..."
    
    for path in "${FORBIDDEN_PATHS[@]}"; do
        if [ -d "$path" ]; then
            echo "  Removing $path"
            rm -rf "$path"
        fi

        if [ -n "$(git ls-tree -r --name-only HEAD -- "$path")" ]; then
            echo "  Restoring tracked $path"
            git restore --source=HEAD --staged --worktree -- "$path" 2>/dev/null || git restore --source=HEAD -- "$path"
        fi
    done

    echo "✅ Artifacts cleaned"
}

install_hook() {
    echo "🔗 Installing post-E2E hook..."
    
    # Add to package.json scripts if not present
    if ! grep -q '"e2e:guard"' package.json; then
        echo "📦 Add this to package.json scripts:"
        echo '  "e2e:guard": "./scripts/e2e-guard.sh check"'
        echo '  "e2e:clean": "./scripts/e2e-guard.sh clean"'
    fi
    
    echo "✅ Hook instructions provided"
}

case "${1:-check}" in
    check)
        check_forbidden
        ;;
    preflight)
        preflight
        ;;
    clean)
        clean_artifacts
        ;;
    install-hook)
        install_hook
        ;;
    *)
        echo "Usage: $0 [preflight|check|clean|install-hook]"
        exit 1
        ;;
esac
