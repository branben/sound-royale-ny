#!/bin/bash
# qodo-feedback-loop.sh - Bridge Qodo PR feedback to Beads + GAIA Polecat
# Usage: ./qodo-feedback-loop.sh <owner> <repo> <pr_number> [spawn_polecat]
# 
# What it does:
# 1. Fetches PR comments from qodo-code-review[bot]
# 2. Extracts file paths, line numbers, and Linear issue IDs
# 3. Creates beads with symbolic references
# 4. Optionally spawns polecat to fix the feedback
#
# Set SPAWN_POLECAT=1 or pass "spawn" as 4th arg to auto-spawn polecat

set -e

OWNER="${1:-}"
REPO="${2:-}"
PR="${3:-}"
SPAWN="${4:-${SPAWN_POLECAT:-1}}"

if [ -z "$OWNER" ] || [ -z "$REPO" ] || [ -z "$PR" ]; then
    echo "Usage: $0 <owner> <repo> <pr_number> [spawn]"
    echo "  Set SPAWN_POLECAT=1 or pass 'spawn' to auto-spawn polecat"
    exit 1
fi

# Config
GITHUB_TOKEN="${GITHUB_TOKEN:-$GITHUB_PAT}"
LINEAR_API_KEY="${LINEAR_API_KEY:-}"
QODO_BOT="qodo-code-review[bot]"
BEADS_DIR=".beads"
REPO_DIR=$(pwd)
RIG="sound_royale_ny"

echo "🔍 Checking Qodo feedback on $OWNER/$REPO PR #$PR..."

# Step 1: Get PR comments from qodo-bot (including review comments)
COMMENTS=$(gh api "repos/$OWNER/$REPO/pulls/$PR/comments" \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    --jq '.[] | select(.user.login == "'"$QODO_BOT"'") | {id, body, created_at, path, line}')

if [ -z "$COMMENTS" ]; then
    # Also check review comments
    COMMENTS=$(gh api "repos/$OWNER/$REPO/pulls/$PR/reviews" \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        --jq '.[] | select(.user.login == "'"$QODO_BOT"'") | .body' | jq -s '.' | \
        jq '.[] | {id: .?, body: ., created_at: .?, path: .?, line: .?}')
    
    if [ -z "$COMMENTS" ] || [ "$COMMENTS" = "[]" ]; then
        echo "✅ No Qodo feedback found."
        exit 0
    fi
fi

echo "📝 Found Qodo feedback, processing..."

# Step 2: Extract relevant data
# - Linear issue IDs (PROJ-123)
LINEAR_IDS=$(echo "$COMMENTS" | grep -oE '[A-Z]+-[0-9]+' | sort -u)

# - File paths mentioned in comments
FILE_PATHS=$(echo "$COMMENTS" | jq -r '.path // empty' | grep -v '^$' | sort -u)

# - Raw feedback body for bead
FEEDBACK_BODY=$(echo "$COMMENTS" | jq -r '.body' 2>/dev/null | head -c 5000)

# Step 3: Build symbols array for bead
SYMBOLS_JSON="[]"
if [ -n "$FILE_PATHS" ]; then
    SYMBOLS_JSON=$(echo "$FILE_PATHS" | jq -R -s 'split("\n") | map(select(length > 0)) | map({
        name: .,
        path: .,
        line: null
    })')
fi

# Step 4: Generate bead ID and create bead
BEAD_ID="${REPO}-qodo-$(date +%Y%m%d%H%M%S)"

# Determine title
if [ -n "$LINEAR_IDS" ]; then
    BEAD_TITLE="Fix Qodo feedback: $LINEAR_IDS"
else
    BEAD_TITLE="Fix Qodo feedback on PR #$PR"
fi

# Build full description
BEAD_DESCRIPTION="Qodo PR Feedback from $OWNER/$REPO PR #$PR

## Feedback
$FEEDBACK_BODY

## Files to Review
$(echo "$FILE_PATHS" | grep -v '^$' | sed 's/^/- /')

## Action Required
Review Qodo feedback and address any issues flagged.
"

# Create bead JSON
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

# Write bead
mkdir -p "$BEADS_DIR"
echo "$BEAD_JSON" >> "$BEADS_DIR/issues.jsonl"

echo "📿 Created bead: $BEAD_ID"
echo "   Title: $BEAD_TITLE"

# Step 5: Extract Linear issue IDs and update Linear
if [ -n "$LINEAR_IDS" ]; then
    for ISSUE_ID in $LINEAR_IDS; do
        echo "📋 Updating Linear issue $ISSUE_ID..."
        
        if [ -n "$LINEAR_API_KEY" ]; then
            COMMENT_BODY="🤖 Qodo PR Feedback

$FEEDBACK_BODY

---
Source: $OWNER/$REPO/pull/$PR
Bead: $BEAD_ID"

            curl -s -X POST https://api.linear.app/graphql \
                -H "Authorization: $LINEAR_API_KEY" \
                -H "Content-Type: application/json" \
                -d '{"query":"mutation { issueCommentCreate(input: {issueId: \"'"$ISSUE_ID"'\", body: \""$COMMENT_BODY"\" }) { success } }"}' > /dev/null
            
            echo "   ✅ Added comment to $ISSUE_ID"
        fi
    done
fi

# Step 6: Spawn polecat or notify mayor
if [ "$SPAWN" = "spawn" ] || [ "$SPAWN" = "1" ]; then
    echo "🚀 Spawning polecat for Qodo feedback..."
    
    # Notify mayor
    BODY="Source: Qodo PR Feedback
PR: $OWNER/$REPO/pull/$PR
Bead: $BEAD_ID

Feedback:
$FEEDBACK_BODY"
    gt mail send $RIG/mayor -s "Qodo: Spawn polecat for $BEAD_ID" -m "$BODY" 2>/dev/null || true
    
    # Spawn polecat with bead context
    cd "$REPO_DIR"
    if [ -f "../gaia-polecat" ]; then
        echo "🐱 Spawning polecat: Fix Qodo feedback $BEAD_ID"
        ../gaia-polecat "Fix Qodo feedback from bead $BEAD_ID" 2>/dev/null || \
        echo "⚠️ Polecat spawn failed"
    elif command -v gt &> /dev/null; then
        echo "🐱 Spawning polecat via gt..."
        gt polecat spawn "Fix Qodo feedback" --bead "$BEAD_ID" 2>/dev/null || \
        echo "⚠️ gt polecat spawn failed"
    else
        echo "⚠️ No polecat tooling available"
    fi
else
    # Just notify mayor without spawning
    BODY="Source: Qodo PR Feedback
PR: $OWNER/$REPO/pull/$PR
Bead: $BEAD_ID

Feedback:
$FEEDBACK_BODY"
    gt mail send $RIG/mayor -s "Qodo feedback: $BEAD_ID" -m "$BODY" 2>/dev/null || \
        echo "📬 (gt mail not available)"
fi

# Step 7: Commit bead to git
if git rev-parse --git-dir > /dev/null 2>&1; then
    git add "$BEADS_DIR/issues.jsonl" 2>/dev/null
    if git diff --cached --quiet; then
        echo "✅ Bead already committed"
    else
        git commit -m "bead: $BEAD_TITLE" 2>/dev/null && \
        echo "✅ Bead committed" || \
        echo "⚠️ Bead not committed"
    fi
fi

echo ""
echo "✅ Qodo feedback loop complete!"
echo "   Bead: $BEAD_ID"
echo "   To spawn polecat: ./scripts/qodo-feedback-loop.sh $OWNER $REPO $PR spawn"
