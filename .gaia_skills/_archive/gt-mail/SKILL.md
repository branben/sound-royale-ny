---
name: gt-mail
description: Gas Town mail system for agent communication. Use to check inbox, read messages, and send notifications to other agents.
---

# Gas Town Mail (gt mail)

> Essential skill for reading agent handoffs and notifications in your inbox.

## Quick Reference

```bash
# Check your inbox
gt mail inbox

# Check a specific inbox (e.g., gastown/crew/sisyphus)
gt mail inbox gastown/crew/sisyphus

# Read a message by ID
gt mail read <message-id>

# Get inbox as JSON (easier to parse)
gt mail inbox --json
```

## Common Inboxes

| Inbox | Purpose | Typical Messages |
|-------|---------|------------------|
| `gastown/crew/sisyphus` | Your personal inbox | HANDOFF notifications from overseer |
| `mayor/` | Mayor announcements | Town-wide alerts |
| `gastown/witness` | Witness logs | Patrol receipts, bead tracking |
| `gastown/refinery` | Refinery logs | Commit/status updates |

## Reading Messages

### Step 1: Check Inbox

```bash
# View your inbox (shows subject, sender, date, read status)
gt mail inbox

# Or with JSON for programmatic access
gt mail inbox --json
```

**Example JSON output:**
```json
[
  {
    "id": "hq-llb",
    "from": "overseer",
    "to": "gastown/crew/sisyphus",
    "subject": "HANDOFF: Session cycling",
    "body": "gastown/crew/sisyphus",
    "timestamp": "2026-02-23T16:59:25.966097-05:00",
    "read": false
  }
]
```

### Step 2: Read Full Message

```bash
# Read by message ID (e.g., hq-llb from JSON)
gt mail read hq-llb
```

This shows:
- Subject line
- From/To addresses
- Full message body
- Thread ID

## Sending Messages

```bash
# Send to a polecat
gt mail send gastown/crew/agent-name -s "Subject" -m "Body"

# Send to the mayor
gt mail send mayor -s "Subject" -m "Body"

# Send to witness (for logging)
gt mail send gastown/witness -s "Subject" -m "Body"
```

## Address Formats

```
mayor/              → Mayor inbox
<rig>/witness      → Rig's Witness
<rig>/refinery     → Rig's Refinery  
<rig>/<polecat>    → Specific polecat (e.g., gastown/Toast)
<rig>/crew/<name>  → Crew worker (e.g., gastown/crew/max)
--human             → Human overseer
```

## Tips

1. **Check inbox at session start** - You may have HANDOFF messages with context
2. **Use JSON for parsing** - `--json` flag makes it easy to extract IDs
3. **Mark as read** - After handling: `gt mail mark-read <message-id>`
4. **Search** - Find specific messages: `gt mail search "keyword"`

## Common Workflows

### Session Start: Check for Handoffs
```bash
gt mail inbox --json | jq '.[] | select(.read == false)'
```

### Process a HANDOFF Message
```bash
# 1. Get inbox
gt mail inbox gastown/crew/sisyphus --json

# 2. Read the message
gt mail read <message-id>

# 3. Mark as read when done
gt mail mark-read <message-id>
```

### Notify Another Agent
```bash
gt mail send gastown/crew/other-agent -s "Task Update" -m "Completed the auth fix. Ready for review."
```
