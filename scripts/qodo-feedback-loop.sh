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
QODO_BOT="qodo-code-review[bot]"
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

COMMENTS_JSON=$(gh api "repos/$OWNER/$REPO/issues/$PR/comments" \
    -H "Authorization: Bearer $GITHUB_TOKEN")

COMMENT_AUTHORS=$(echo "$COMMENTS_JSON" | jq '[.[] | .user.login]')

QODO_COMMENT_URLS=$(echo "$COMMENTS_JSON" | jq -r --arg bot "$QODO_BOT" '.[] | select(.user.login == $bot) | .html_url' | sort -u)

# Combine only Qodo bot comment bodies for extraction (do not persist bodies)
QODO_BODIES=$(echo "$COMMENTS_JSON" | jq -r --arg bot "$QODO_BOT" '.[] | select(.user.login == $bot) | .body')

QODO_BODIES_COMBINED=$(echo "$QODO_BODIES" | sed '/^$/d' | head -n 200)

# Extract Linear IDs from Qodo bodies (if any)
LINEAR_IDS=$(echo "$QODO_BODIES" | grep -oE '[A-Z]+-[0-9]+' | sort -u || true)

# Check if any comments contain "qodo" (Qodo bot)
HAS_QODO=$(echo "$COMMENT_AUTHORS" | grep -c "qodo" 2>/dev/null || echo "0")

if [ -z "$LINEAR_IDS" ] && [ "$HAS_QODO" -eq 0 ]; then
    echo "✅ No Linear issue IDs or Qodo comments found."
    exit 0
fi

if [ -z "$LINEAR_IDS" ]; then
    echo "📝 No Linear IDs found, but Qodo comments present - processing anyway"
else
    echo "📝 Found: $LINEAR_IDS"
fi

# Extract file paths from Qodo comment bodies (look for patterns like "backend/game_engine/views.py")
FILE_PATHS=$(echo "$QODO_BODIES" | grep -oE '[a-zA-Z0-9_/-]+\.(py|ts|tsx|js|jsx|yml|yaml)' | sort -u)

PHASE="Phase 2"
if echo "$QODO_BODIES" | grep -qiE 'e2e|playwright|selector|flake|harness|fixture|test-results'; then
    PHASE="Phase 0"
fi
if echo "$QODO_BODIES" | grep -qiE 'smoke|lobby|join room|room code'; then
    PHASE="Phase 1"
fi

SUCCESS="See docs/E2E_TASK_LIST.md success criteria for ${PHASE}"
VERIFY="npx playwright test tests/e2e/smoke.spec.ts --reporter=line"
if [ "$PHASE" != "Phase 1" ]; then
    VERIFY="npx playwright test tests/e2e --reporter=line"
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
BEAD_ID="${REPO}-qodo-$(date +%Y%m%d%H%M%S)"

# Determine title
if [ -n "$LINEAR_IDS" ]; then
    BEAD_TITLE="Fix Qodo feedback: $LINEAR_IDS"
else
    BEAD_TITLE="Fix Qodo feedback on PR #$PR"
fi

# Build full description
BEAD_DESCRIPTION="Qodo PR Feedback from $OWNER/$REPO PR #$PR

## Source
- PR: https://github.com/$OWNER/$REPO/pull/$PR

## Qodo Comment Links
$(echo "$QODO_COMMENT_URLS" | grep -v '^$' | sed 's/^/- /')

## Files to Review
$(echo "$FILE_PATHS" | grep -v '^$' | sed 's/^/- /')

## Action Required
Review Qodo feedback and address any issues flagged.
"

# Create bead JSON (optional)
BEAD_JSON=$(jq -n \
    --arg id "$BEAD_ID" \
    --arg title "$BEAD_TITLE" \
    --arg description "$BEAD_DESCRIPTION" \
    --argjson symbols "$SYMBOLS_JSON" \
    '{
        id: $id,
        title: $title,
        description: $description,
        status: "open",
        priority: 2,
        issue_type: "task",
        owner: "qodo-feedback",
        source: "qodo",
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
Goal: Address Qodo feedback for PR #${PR}
Success: ${SUCCESS}
Verification: ${VERIFY}

Source PR: https://github.com/${OWNER}/${REPO}/pull/${PR}
Qodo comment links:
$(echo "$QODO_COMMENT_URLS" | grep -v '^$' | sed 's/^/- /')

Files:
$(echo "$FILE_PATHS" | grep -v '^$' | sed 's/^/- /')

Notes:
${QODO_BODIES_COMBINED}"

TASK_ID=$(python3 scripts/gaia-polecat.py --queue --priority 2 "$GAIA_TASK" | tail -n 1 | tr -d '\n' || true)
echo "✅ Enqueued GAIA task: ${TASK_ID:-<unknown>}"

# Step 6: Extract Linear issue IDs and update Linear
if [ -n "$LINEAR_IDS" ]; then
    for ISSUE_ID in $LINEAR_IDS; do
        echo "📋 Updating Linear issue $ISSUE_ID..."
        
        if [ -n "$LINEAR_API_KEY" ]; then
            # Resolve human keys (ABC-123) to UUID via issueSearch; if already UUID, use as-is.
            LINEAR_UUID="$ISSUE_ID"
            if ! echo "$ISSUE_ID" | grep -qiE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
                SEARCH_QUERY=$(jq -n --arg term "$ISSUE_ID" '{query:"query($term:String!){issueSearch(term:$term){nodes{id identifier}}}",variables:{term:$term}}')
                SEARCH_RES=$(curl -s -X POST https://api.linear.app/graphql \
                    -H "Authorization: $LINEAR_API_KEY" \
                    -H "Content-Type: application/json" \
                    -d "$SEARCH_QUERY" || true)
                LINEAR_UUID=$(echo "$SEARCH_RES" | jq -r '.data.issueSearch.nodes[0].id // empty')
            fi

            if [ -z "$LINEAR_UUID" ]; then
                echo "   ⚠️ Could not resolve $ISSUE_ID to Linear UUID; skipping comment"
                continue
            fi

            COMMENT_BODY=$(jq -n --arg owner "$OWNER" --arg repo "$REPO" --arg pr "$PR" --arg task_id "$TASK_ID" --arg phase "$PHASE" \
                '"🤖 Qodo → GAIA\n\n" +
                "Phase: " + $phase + "\n" +
                "PR: https://github.com/" + $owner + "/" + $repo + "/pull/" + $pr + "\n" +
                "GAIA task: " + $task_id')

            MUTATION=$(jq -n --arg id "$LINEAR_UUID" --arg body "$COMMENT_BODY" '{query:"mutation($id:String!,$body:String!){issueCommentCreate(input:{issueId:$id,body:$body}){success}}",variables:{id:$id,body:$body}}')

            curl -s -X POST https://api.linear.app/graphql \
                -H "Authorization: $LINEAR_API_KEY" \
                -H "Content-Type: application/json" \
                -d "$MUTATION" > /dev/null

            echo "   ✅ Added comment to $ISSUE_ID"
        fi
    done
fi

# Step 7: Spawn polecat or notify mayor (local only)
if [ "$SPAWN" = "spawn" ] || [ "$SPAWN" = "1" ]; then
    echo "🚀 Spawning polecat for Qodo feedback..."
    
    # Notify mayor
    BODY="Source: Qodo PR Feedback
PR: $OWNER/$REPO/pull/$PR
Bead: $BEAD_ID

Feedback (truncated):
$QODO_BODIES_COMBINED"
    gt mail send $RIG/mayor -s "Qodo: Spawn polecat for $BEAD_ID" -m "$BODY" 2>/dev/null || true
    
    # Spawn polecat with task context
    cd "$REPO_DIR"
    if [ -f "../gaia-polecat" ]; then
        echo "🐱 Spawning polecat: Fix Qodo feedback (GAIA task ${TASK_ID:-unknown})"
        ../gaia-polecat "Fix Qodo feedback from GAIA task ${TASK_ID:-unknown}" 2>/dev/null || \
        echo "⚠️ Polecat spawn failed"
    elif command -v gt &> /dev/null; then
        echo "🐱 Spawning polecat via gt..."
        gt polecat spawn "Fix Qodo feedback" 2>/dev/null || \
        echo "⚠️ gt polecat spawn failed"
    else
        echo "⚠️ No polecat tooling available"
    fi
else
    # Just notify mayor without spawning
    BODY="Source: Qodo PR Feedback
PR: $OWNER/$REPO/pull/$PR
GAIA task: ${TASK_ID:-unknown}

Feedback (truncated):
$QODO_BODIES_COMBINED"
    gt mail send $RIG/mayor -s "Qodo feedback: $BEAD_ID" -m "$BODY" 2>/dev/null || \
        echo "📬 (gt mail not available)"
fi

echo ""
echo "✅ Qodo feedback loop complete!"
if [ "$WRITE_BEADS" = "1" ]; then
    echo "   Bead: $BEAD_ID"
fi
echo "   GAIA task: ${TASK_ID:-<unknown>}"
echo "   To spawn polecat (local): ./scripts/qodo-feedback-loop.sh $OWNER $REPO $PR spawn"
