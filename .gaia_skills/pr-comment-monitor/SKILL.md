---
name: pr-comment-monitor
description: Monitor PR for comments from human reviewers and bots (like Qodo). Use after creating or updating a PR to catch feedback early.
---

# PR Comment Monitor

> Essential skill for catching feedback immediately after PR creation/update.

## Problem

PRs often get comments from:
1. **Qodo-code-review bot** - Automated code review
2. **Human reviewers** - Manual feedback
3. **CI checks** - Test failures

Missing these comments delays iteration cycles.

## Solution

After ANY PR operation, immediately check for new comments:

```bash
# After creating/updating a PR
gh pr view <PR_NUMBER> --json comments
```

## Workflow

### After PR Creation

```bash
# 1. Create PR
gh pr create --title "..." --body "..."

# 2. Immediately check for comments (within 30 seconds)
gh pr view 32 --json comments
```

### After PR Update (new commit push)

```bash
# 1. Push new commit
git push

# 2. Wait 30 seconds for CI + Qodo to run
sleep 30

# 3. Check comments
gh pr view <PR_NUMBER> --json comments
```

## Parsing Comments

### Check for Qodo Bot

```bash
# Filter for Qodo comments
gh pr view 32 --json comments | jq '.comments[] | select(.author.login == "qodo-code-review")'
```

### Check for Human Comments

```bash
# Filter for non-bot comments
gh pr view 32 --json comments | jq '.comments[] | select(.author.login != "qodo-code-review")'
```

### Check for CI Failures

```bash
# Look for "CI Feedback" in comments
gh pr view 32 --json comments | jq '.comments[] | select(.body | contains("CI Feedback"))'
```

## Common Qodo Patterns

| Comment Type | Trigger | Action |
|--------------|---------|--------|
| CI Feedback | Test failure | Fix tests, push update |
| Compliance | Style/security | Address issues |
| Code Suggestions | Optional improvements | Review and apply if useful |

## Full Example Script

```bash
#!/bin/bash
# Check PR for comments after creation/update

PR_NUM="$1"
if [ -z "$PR_NUM" ]; then
    echo "Usage: $0 <PR_NUMBER>"
    exit 1
fi

echo "Checking PR #$PR_NUM for comments..."

# Get all comments
COMMENTS=$(gh pr view "$PR_NUM" --json comments)

# Count comments
COUNT=$(echo "$COMMENTS" | jq '.comments | length')
echo "Found $COUNT comment(s)"

# Check for Qodo
QODO_COUNT=$(echo "$COMMENTS" | jq '[.comments[] | select(.author.login == "qodo-code-review")] | length')
if [ "$QODO_COUNT" -gt 0 ]; then
    echo "🐶 Qodo: $QODO_COUNT comment(s)"
    
    # Check for CI failures
    CI_FAILURES=$(echo "$COMMENTS" | jq '[.comments[] | select(.author.login == "qodo-code-review" and .body | contains("CI Feedback"))] | length')
    if [ "$CI_FAILURES" -gt 0 ]; then
        echo "❌ CI Failures detected!"
        # Extract failure details
        echo "$COMMENTS" | jq -r '.comments[] | select(.author.login == "qodo-code-review" and .body | contains("CI Feedback")) | .body' | head -100
    fi
fi

# Check for humans
HUMAN_COUNT=$(echo "$COMMENTS" | jq '[.comments[] | select(.author.login != "qodo-code-review")] | length')
if [ "$HUMAN_COUNT" -gt 0 ]; then
    echo "👤 Human: $HUMAN_COUNT comment(s)"
fi

# List all comment authors
echo ""
echo "Comment authors:"
echo "$COMMENTS" | jq -r '.comments[] | "  - \(.author.login): \(.body[0:80])..."'
```

## Usage in GAIA Workflow

1. **After PR creation**: Run comment check immediately
2. **After push**: Wait 30s, then check
3. **If comments found**: 
   - Critical (CI failure) → Fix immediately
   - Compliance → Address in next commit
   - Suggestions → Add to backlog, not urgent

## Integration with qodo-feedback-loop

The `scripts/qodo-feedback-loop.sh` already handles Qodo feedback:
```bash
./scripts/qodo-feedback-loop.sh branben sound-royale-ny 32 spawn
```

This creates a bead and optionally spawns a polecat to fix the feedback.
