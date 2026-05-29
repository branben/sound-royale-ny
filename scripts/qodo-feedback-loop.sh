#!/bin/bash
# qodo-feedback-loop.sh - Bridge Qodo PR feedback to GAIA queue (+ optional Linear)
# Usage: ./qodo-feedback-loop.sh <owner> <repo> <pr_number> [spawn_polecat]
# 
# What it does:
# 1. Fetches PR comments from qodo-code-review[bot]
# 2. Extracts file paths, line numbers, and Linear issue IDs
# 3. Enqueues GAIA tasks (repo-local runner) aligned to docs/E2E_TASK_LIST.md
# 4. Optionally comments on Linear issues when resolvable
#
# Set SPAWN_POLECAT=1 or pass "spawn" as 4th arg to auto-spawn polecat

set -e

OWNER="${1:-}"
REPO="${2:-}"
PR="${3:-}"
SPAWN="${4:-${SPAWN_POLECAT:-0}}"

if [ -z "$OWNER" ] || [ -z "$REPO" ] || [ -z "$PR" ]; then
    echo "Usage: $0 <owner> <repo> <pr_number> [spawn]"
    echo "  Set SPAWN_POLECAT=1 or pass 'spawn' to auto-spawn polecat"
    exit 1
fi

# Config
GITHUB_TOKEN="${GITHUB_TOKEN:-$GITHUB_PAT}"
# Fallback to gh auth token if not set
if [ -z "$GITHUB_TOKEN" ]; then
    GITHUB_TOKEN=$(gh auth token 2>/dev/null || echo "")
fi
LINEAR_API_KEY="${LINEAR_API_KEY:-}"
BOT_NAME="${BOT_NAME:-qodo-code-review[bot]}"   # comma-separated; each gets filtered
SOURCE_NAME="${SOURCE_NAME:-qodo}"               # used in bead/task IDs and output
BEADS_DIR="${BEADS_DIR:-.gaia_private/beads}"
WRITE_BEADS="${WRITE_BEADS:-0}"
REPO_DIR=$(pwd)
RIG="sound_royale_ny"

if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    SPAWN="0"
fi

if ! command -v jq &> /dev/null; then
    echo "❌ jq is required" >&2
    exit 1
fi

echo "🔍 Checking feedback on $OWNER/$REPO PR #$PR..."

ISSUE_COMMENTS=$(gh api "repos/$OWNER/$REPO/issues/$PR/comments" \
    -H "Authorization: Bearer $GITHUB_TOKEN" 2>/dev/null || echo "[]")
PR_REVIEW_COMMENTS=$(gh api "repos/$OWNER/$REPO/pulls/$PR/comments" \
    -H "Authorization: Bearer $GITHUB_TOKEN" 2>/dev/null || echo "[]")

# Merge both comment sources, deduplicate by id
ALL_COMMENTS=$(echo "$ISSUE_COMMENTS $PR_REVIEW_COMMENTS" | jq -s 'add | group_by(.id) | map(first)')

# Build regex from BOT_NAME (comma-separated, e.g. "qodo-code-review[bot],github-actions[bot]")
BOT_REGEX=$(echo "$BOT_NAME" | sed 's/,/|/g; s/\[/\\[/g; s/\]/\\]/g')

BOT_COMMENTS=$(echo "$ALL_COMMENTS" | jq -r --arg regex "$BOT_REGEX" '[.[] | select(.user.login | test($regex))]')

BOT_URLS=$(echo "$BOT_COMMENTS" | jq -r '.[] | .html_url' | sort -u)

# Combine only bot comment bodies for extraction (do not persist bodies)
BOT_BODIES=$(echo "$BOT_COMMENTS" | jq -r '.[] | .body')

BOT_BODIES_COMBINED=$(echo "$BOT_BODIES" | sed '/^$/d' | head -n 200)

# Extract Linear IDs from bot bodies (if any)
LINEAR_IDS=$(echo "$BOT_BODIES" | grep -oE '[A-Z]+-[0-9]+' | sort -u || true)

# Check if any bot comments exist
HAS_BOT=$(echo "$BOT_COMMENTS" | jq 'length')

if [ -z "$LINEAR_IDS" ] && [ "$HAS_BOT" = "0" ]; then
    echo "✅ No Linear issue IDs or $SOURCE_NAME comments found."
    exit 0
fi

if [ -z "$LINEAR_IDS" ]; then
    echo "📝 No Linear IDs found, but $SOURCE_NAME comments present - processing anyway"
else
    echo "📝 Found: $LINEAR_IDS"
fi

# Extract file paths from bot comment bodies (look for patterns like "backend/game_engine/views.py")
FILE_PATHS=$(echo "$BOT_BODIES" | grep -oE '[a-zA-Z0-9_/-]+\.(py|ts|tsx|js|jsx|yml|yaml)' | sort -u)

# Keyword → Phase classification (mirrors docs/E2E_TASK_LIST.md mapping table)
# Higher priority number wins; check from lowest priority upward so highest overwrites.
PHASE="Phase 2"
VERIFY="npx playwright test tests/e2e --reporter=line"
SUCCESS="deterministic tests pass 3 consecutive runs with no waitForTimeout"

if echo "$BOT_BODIES" | grep -qiE 'reconnect|resilience|retry|disconnect|drop'; then
    PHASE="Phase 5"; VERIFY="npx playwright test tests/e2e --reporter=line"
    SUCCESS="one reconnection scenario passes without flake"
fi
if echo "$BOT_BODIES" | grep -qiE 'score|elo|elo_change|rating|points|leaderboard'; then
    PHASE="Phase 4"; VERIFY="npx playwright test tests/e2e/scoring-elo.spec.ts --reporter=line"
    SUCCESS="ELO changes asserted end-to-end (UI + API), 3 consecutive passes"
fi
if echo "$BOT_BODIES" | grep -qiE 'battle|gameplay|match|round|websocket|\bws\b|game start'; then
    PHASE="Phase 3"; VERIFY="npx playwright test tests/e2e/battle-flows.spec.ts --reporter=line"
    SUCCESS="one full round flow covered with explicit state assertions"
fi
if echo "$BOT_BODIES" | grep -qiE 'lobby|join|create room|room list|room entry'; then
    PHASE="Phase 2"; VERIFY="npx playwright test tests/e2e/lobby.spec.ts --reporter=line"
    SUCCESS="deterministic navigation into room with stable assertions"
fi
if echo "$BOT_BODIES" | grep -qiE 'smoke|lobby shell|join room|room code|enableE2EMode'; then
    PHASE="Phase 1"; VERIFY="npx playwright test tests/e2e/smoke.spec.ts --reporter=line"
    SUCCESS="2 smoke tests pass 3 consecutive runs with no waitForTimeout"
fi
if echo "$BOT_BODIES" | grep -qiE 'e2e|playwright|selector|flake|harness|fixture|test-results|baseurl|config'; then
    PHASE="Phase 0"; VERIFY="npx playwright test tests/e2e/smoke.spec.ts --reporter=line"
    SUCCESS="smoke spec passes consistently and does not dirty the working tree"
fi

# Step 3 (optional): Build symbols array for bead
SYMBOLS_JSON="[]"
if [ -n "$FILE_PATHS" ]; then
    SYMBOLS_JSON=$(echo "$FILE_PATHS" | jq -R -s 'split("\n") | map(select(length > 0)) | map({
        name: .,
        path: .,
        line: null
    })')
fi

# Step 4: Generate bead ID
BEAD_ID="${REPO}-${SOURCE_NAME}-$(date +%Y%m%d%H%M%S)"

# Determine title
if [ -n "$LINEAR_IDS" ]; then
    BEAD_TITLE="Fix ${SOURCE_NAME} feedback: $LINEAR_IDS"
else
    BEAD_TITLE="Fix ${SOURCE_NAME} feedback on PR #$PR"
fi

# Build full description
BEAD_DESCRIPTION="${SOURCE_NAME} PR Feedback from $OWNER/$REPO PR #$PR

## Source
- PR: https://github.com/$OWNER/$REPO/pull/$PR

## ${SOURCE_NAME} Comment Links
$(echo "$BOT_URLS" | grep -v '^$' | sed 's/^/- /')

## Files to Review
$(echo "$FILE_PATHS" | grep -v '^$' | sed 's/^/- /')

## Action Required
Review ${SOURCE_NAME} feedback and address any issues flagged.
"

# Create bead JSON (optional)
BEAD_JSON=$(jq -n \
    --arg id "$BEAD_ID" \
    --arg title "$BEAD_TITLE" \
    --arg description "$BEAD_DESCRIPTION" \
    --argjson symbols "$SYMBOLS_JSON" \
    --arg source "$SOURCE_NAME" \
    '{
        id: $id,
        title: $title,
        description: $description,
        status: "open",
        priority: 2,
        issue_type: "task",
        owner: ($source + "-feedback"),
        source: $source,
        created_at: (now | strftime("%Y-%m-%dT%H:%M:%S")),
        updated_at: (now | strftime("%Y-%m-%dT%H:%M:%S")),
        symbols: $symbols
    }')

if [ "$WRITE_BEADS" = "1" ]; then
    mkdir -p "$BEADS_DIR"
    echo "$BEAD_JSON" >> "$BEADS_DIR/issues.jsonl"
    echo "📿 Created bead: $BEAD_ID"
    echo "   Title: $BEAD_TITLE"
fi

# Step 5: Enqueue GAIA task
GAIA_TASK="${PHASE}
Goal: Address ${SOURCE_NAME} feedback for PR #${PR}
Success: ${SUCCESS}
Verification: ${VERIFY}

Source PR: https://github.com/${OWNER}/${REPO}/pull/${PR}
${SOURCE_NAME} comment links:
$(echo "$BOT_URLS" | grep -v '^$' | sed 's/^/- /')

Files:
$(echo "$FILE_PATHS" | grep -v '^$' | sed 's/^/- /')

Notes:
${BOT_BODIES_COMBINED}"

TASK_ID=$(python3 scripts/gaia-polecat.py --queue --priority 2 "$GAIA_TASK" 2>/dev/null | grep -oE 'task-[0-9]+' | tail -n 1 || true)
echo "✅ Enqueued GAIA task: ${TASK_ID:-<unknown>}"

# Step 6: Extract Linear issue IDs and update Linear
if [ -n "$LINEAR_IDS" ]; then
    for ISSUE_ID in $LINEAR_IDS; do
        echo "📋 Updating Linear issue $ISSUE_ID..."
        
        if [ -n "$LINEAR_API_KEY" ]; then
            # Resolve human keys (SR-42) to UUID via issues(filter) query.
            # If it already looks like a UUID, skip resolution.
            LINEAR_UUID="$ISSUE_ID"
            if ! echo "$ISSUE_ID" | grep -qiE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
                SEARCH_QUERY=$(jq -n --arg term "$ISSUE_ID" \
                    '{query:"query IssueByKey($term:String!){issues(filter:{identifier:{eq:$term}}){nodes{id identifier}}}",variables:{term:$term}}')
                SEARCH_RES=$(curl -s -X POST https://api.linear.app/graphql \
                    -H "Authorization: $LINEAR_API_KEY" \
                    -H "Content-Type: application/json" \
                    -d "$SEARCH_QUERY" || true)
                LINEAR_UUID=$(echo "$SEARCH_RES" | jq -r '.data.issues.nodes[0].id // empty')
                if [ -z "$LINEAR_UUID" ]; then
                    echo "   ⚠️ Resolution failed for $ISSUE_ID. API response: $(echo "$SEARCH_RES" | jq -c '.errors // .error // "unknown"')"
                fi
            fi

            if [ -z "$LINEAR_UUID" ]; then
                echo "   ⚠️ Could not resolve $ISSUE_ID to Linear UUID; skipping comment"
                continue
            fi

            COMMENT_BODY=$(jq -n --arg owner "$OWNER" --arg repo "$REPO" --arg pr "$PR" --arg task_id "$TASK_ID" --arg phase "$PHASE" --arg source "$SOURCE_NAME" \
                '"🤖 " + $source + " → GAIA\n\n" +
                "Phase: " + $phase + "\n" +
                "PR: https://github.com/" + $owner + "/" + $repo + "/pull/" + $pr + "\n" +
                "GAIA task: " + $task_id')

            MUTATION=$(jq -n --arg id "$LINEAR_UUID" --arg body "$COMMENT_BODY" \
                '{query:"mutation AddComment($id:String!,$body:String!){issueCommentCreate(input:{issueId:$id,body:$body}){success comment{id}}}",variables:{id:$id,body:$body}}')

            MUTATION_RES=$(curl -s -X POST https://api.linear.app/graphql \
                -H "Authorization: $LINEAR_API_KEY" \
                -H "Content-Type: application/json" \
                -d "$MUTATION" || true)

            MUTATION_OK=$(echo "$MUTATION_RES" | jq -r '.data.issueCommentCreate.success // false')
            if [ "$MUTATION_OK" = "true" ]; then
                echo "   ✅ Posted comment to Linear $ISSUE_ID ($LINEAR_UUID)"
            else
                echo "   ❌ Linear comment failed for $ISSUE_ID: $(echo "$MUTATION_RES" | jq -c '.errors // .error // "unknown"')"
            fi
        else
            echo "   ℹ️ LINEAR_API_KEY not set; posting GAIA task ID to PR instead"
            gh api "repos/$OWNER/$REPO/issues/$PR/comments" \
                -X POST \
                -F "body=🤖 **${SOURCE_NAME} → GAIA** (no Linear key)\n\nPhase: $PHASE\nGAIA task: ${TASK_ID:-unknown}\nPR: https://github.com/$OWNER/$REPO/pull/$PR" \
                > /dev/null 2>&1 || echo "   ⚠️ PR comment also failed (gh not authed?)"
        fi
    done
fi

# Step 7: Spawn polecat or notify mayor (local only)
if [ "$SPAWN" = "spawn" ] || [ "$SPAWN" = "1" ]; then
    echo "🚀 Spawning polecat for ${SOURCE_NAME} feedback..."
    
    # Notify mayor
    BODY="Source: ${SOURCE_NAME} PR Feedback
PR: $OWNER/$REPO/pull/$PR
Bead: $BEAD_ID

Feedback (truncated):
$BOT_BODIES_COMBINED"
    gt mail send $RIG/mayor -s "${SOURCE_NAME}: Spawn polecat for $BEAD_ID" -m "$BODY" 2>/dev/null || true
    
    # Spawn polecat with task context
    cd "$REPO_DIR"
    if [ -f "../gaia-polecat" ]; then
        echo "🐱 Spawning polecat: Fix ${SOURCE_NAME} feedback (GAIA task ${TASK_ID:-unknown})"
        ../gaia-polecat "Fix ${SOURCE_NAME} feedback from GAIA task ${TASK_ID:-unknown}" 2>/dev/null || \
        echo "⚠️ Polecat spawn failed"
    elif command -v gt &> /dev/null; then
        echo "🐱 Spawning polecat via gt..."
        gt polecat spawn "Fix ${SOURCE_NAME} feedback" 2>/dev/null || \
        echo "⚠️ gt polecat spawn failed"
    else
        echo "⚠️ No polecat tooling available"
    fi
else
    # Just notify mayor without spawning
    BODY="Source: ${SOURCE_NAME} PR Feedback
PR: $OWNER/$REPO/pull/$PR
GAIA task: ${TASK_ID:-unknown}

Feedback (truncated):
$BOT_BODIES_COMBINED"
    gt mail send $RIG/mayor -s "${SOURCE_NAME} feedback: $BEAD_ID" -m "$BODY" 2>/dev/null || \
        echo "📬 (gt mail not available)"
fi

echo ""
echo "✅ ${SOURCE_NAME} feedback loop complete!"
if [ "$WRITE_BEADS" = "1" ]; then
    echo "   Bead: $BEAD_ID"
fi
echo "   GAIA task: ${TASK_ID:-<unknown>}"
echo "   To spawn polecat (local): ./scripts/qodo-feedback-loop.sh $OWNER $REPO $PR spawn"
