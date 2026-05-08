# Linear → GAIA Coding Tools

Poll Linear for open issues and automatically enqueue them as GAIA tasks. No webhooks needed.

## Setup

### 1. Get Linear API Key

1. Go to [Linear Settings → API](https://linear.app/settings/api)
2. Create a **Personal API Key**
3. Save it to your shell profile:
   ```bash
   export LINEAR_API_KEY="lin_api_..."
   ```

### 2. Optional: Filter by Team

If you have multiple teams, set the team key (e.g., `SR` for Sound Royale):
```bash
export LINEAR_TEAM="SR"
```

### 3. Run the Sync

```bash
# Manual run
python .linear/coding-tools/linear-to-gaia.py

# Or use the shell wrapper
.linear/coding-tools/sync
```

## How It Works

1. Queries Linear GraphQL API for open issues (Todo, In Progress, Backlog)
2. Checks if each issue is already in `.gaia_private/gaia/task_queue.jsonl`
3. Builds a GAIA task with:
   - Goal (issue title)
   - Description
   - Auto-detected verification command (E2E, backend, frontend)
   - Extracted file paths from issue description
4. Enqueues with priority 2 for bugs/critical, 3 for everything else

## Automate with Cron

Run every 15 minutes:
```bash
# Edit crontab
crontab -e

# Add:
*/15 * * * * cd /Users/brandonbennett/pursuit/sound-royale-ny && LINEAR_API_KEY=lin_api_xxx LINEAR_TEAM=SR .linear/coding-tools/sync >> /tmp/linear-gaia.log 2>&1
```

Or use `launchd` on macOS (see `.linear/coding-tools/com.linear.gaia.sync.plist` template).

## Files

- `linear-to-gaia.py` — Main sync script (Python, no dependencies)
- `sync` — Shell wrapper with environment checks
