#!/bin/bash
# bd-close-linear: close a bead and post summary to linked Linear issue
# Usage: bd-close-linear <bead-id> [bead-id...]

set -euo pipefail

for bead_id in "$@"; do
  echo "Closing bead: $bead_id"
  
  # Get the issue details before closing
  ISSUE_JSON=$(bd show "$bead_id" --json 2>/dev/null || echo "")
  if [ -z "$ISSUE_JSON" ]; then
    echo "WARNING: Could not fetch details for $bead_id, skipping Linear sync"
    bd close "$bead_id" 2>/dev/null || true
    continue
  fi
  
  # Extract title, body, and look for Linear URL
  TITLE=$(echo "$ISSUE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('title',''))" 2>/dev/null || echo "")
  BODY=$(echo "$ISSUE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('body',''))" 2>/dev/null || echo "")
  
  # Look for Linear URL in title/body/comments (format: https://linear.app/issue/XXX-NNN)
  LINEAR_URL=$(echo "$TITLE $BODY" | grep -oE 'https://linear\.app/issue/[A-Z]+-[0-9]+' | head -1)
  
  # Close the bead
  bd close "$bead_id" 2>/dev/null || true
  
  if [ -z "$LINEAR_URL" ]; then
    echo "No Linear issue linked to $bead_id, closed without sync"
    continue
  fi
  
  # Extract Linear issue ID from URL (e.g., SR-123 from https://linear.app/issue/SR-123)
  LINEAR_ISSUE_ID=$(echo "$LINEAR_URL" | grep -oE '[A-Z]+-[0-9]+' | head -1)
  
  # Build comment body
  COMMENT="✅ **Bead Closed: $bead_id**

**Title:** $TITLE
**Linear Issue:** $LINEAR_URL

---
*Closed via bd-close-linear*"
  
  # Post comment to Linear
  RESPONSE=$(curl -s -X POST https://api.linear.app/graphql \
    -H "Authorization: ${LINEAR_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"mutation(\$issueId: String!, \$body: String!) { commentCreate(input: { issueId: \$issueId, body: \$body }) { success comment { id } } }\", \"variables\": {\"issueId\": \"$LINEAR_ISSUE_ID\", \"body\": \"$COMMENT\"}}")
  
  if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "✅ Linear comment posted to $LINEAR_ISSUE_ID for bead $bead_id"
  else
    echo "WARNING: Failed to post Linear comment for $bead_id: $RESPONSE"
  fi
done
