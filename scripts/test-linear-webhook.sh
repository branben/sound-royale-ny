#!/usr/bin/env bash
# Test Linear webhook integration locally
# Usage: ./scripts/test-linear-webhook.sh

set -euo pipefail

URL="http://127.0.0.1:8000/webhooks/linear/"
SECRET="${LINEAR_WEBHOOK_SECRET:-test-secret}"

# Build a sample Linear issue.created payload
PAYLOAD=$(jq -n \
  --arg id "SR-$(date +%s)" \
  --arg title "Test webhook: Add leaderboard component" \
  --arg desc "We need a leaderboard on the game over screen.\n\nFiles:\n- src/components/game/Leaderboard.tsx\n- src/pages/Room.tsx" \
  --arg url "https://linear.app/issue/SR-123" \
  '{
    type: "Issue",
    action: "create",
    data: {
      id: "issue-id-123",
      identifier: "SR-123",
      title: $title,
      description: $desc,
      url: $url,
      state: { name: "Todo" },
      labels: [{ name: "frontend" }, { name: "ui" }]
    }
  }')

# Compute HMAC-SHA256 signature (if secret provided)
if command -v openssl >/dev/null 2>&1; then
    SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')
    HEADER="sha256=$SIG"
else
    echo "⚠️ openssl not available, skipping signature"
    HEADER=""
fi

echo "Payload:"
echo "$PAYLOAD" | jq .
echo ""

if [ -n "$HEADER" ]; then
    echo "Sending to $URL with signature..."
    curl -s -X POST "$URL" \
        -H "Content-Type: application/json" \
        -H "Linear-Signature: $HEADER" \
        -d "$PAYLOAD" | jq .
else
    echo "Sending to $URL without signature (dev mode)..."
    curl -s -X POST "$URL" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" | jq .
fi

echo ""
echo "Checking queue..."
QUEUE_FILE=".gaia_private/gaia/task_queue.jsonl"
if [ -f "$QUEUE_FILE" ]; then
    echo "✅ Queue exists. Last task:"
    tail -1 "$QUEUE_FILE" | jq .
else
    echo "❌ No queue file found"
fi
