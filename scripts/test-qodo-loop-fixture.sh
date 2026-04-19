#!/bin/bash
# test-qodo-loop-fixture.sh — dry-run Phase 2 Linear integration locally
# Usage: ./scripts/test-qodo-loop-fixture.sh
# Does NOT make real API calls (sets LINEAR_API_KEY="" to force fallback path)
# Does NOT write beads (WRITE_BEADS=0)
# Does NOT spawn polecat (SPAWN_POLECAT=0)

set -e
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "=== Phase 2 fixture dry-run ==="

# Inject a fake Qodo comment by mocking gh api output
export GITHUB_TOKEN="fake-token"
export LINEAR_API_KEY=""   # Force fallback: post to PR instead of Linear
export WRITE_BEADS=0
export SPAWN_POLECAT=0

# Override gh to return canned fixture JSON
GH_BIN=$(mktemp -d)/gh
cat > "$GH_BIN" << 'EOF'
#!/bin/bash
# Fake gh — returns canned Qodo comment fixture
if [[ "$*" == *"issues/"*"/comments"* && "$*" != *"-X POST"* ]]; then
    cat << 'FIXTURE'
[
  {
    "user": { "login": "qodo-code-review[bot]" },
    "body": "Found potential issue in backend/game_engine/views.py line 42.\nRelated Linear ticket: SR-12\nConsider adding input validation.",
    "html_url": "https://github.com/branben/sound-royale-ny/pull/99#issuecomment-1"
  }
]
FIXTURE
elif [[ "$*" == *"-X POST"* ]]; then
    echo "   [DRY-RUN] gh api POST suppressed (no real token)"
fi
EOF
chmod +x "$GH_BIN"
export PATH="$GH_BIN:$PATH"  # Wrong: GH_BIN is a file not a dir

# Fix: put it in a bin dir
GH_DIR=$(dirname "$GH_BIN")
mv "$GH_BIN" "$GH_DIR/gh"
export PATH="$GH_DIR:$PATH"

echo ""
echo "--- Running qodo-feedback-loop.sh with fixture ---"
bash scripts/qodo-feedback-loop.sh branben sound-royale-ny 99 2>&1

echo ""
echo "--- GAIA queue after fixture run ---"
python3 scripts/gaia-polecat.py --list-queue 2>&1 | grep -E "(pending|Phase)" | tail -5

echo ""
echo "=== Fixture run complete ==="
echo "Expected:"
echo "  - Phase detected from 'lobby/join/smoke' keywords (or default Phase 2)"
echo "  - GAIA task enqueued (visible in --list-queue)"
echo "  - LINEAR_API_KEY absent → fallback path logged (no real Linear call)"
echo "  - No repo churn (test-results/, dist/ untouched)"
echo ""
echo "Repo hygiene check:"
git status --porcelain | grep -v '^\?\?' | grep -v '.gaia_private' && echo "⚠️ Unexpected dirty files" || echo "✅ Clean (untracked only)"
