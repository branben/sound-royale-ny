#!/usr/bin/env python3
"""
Linear → GAIA Task Enqueuer

Polls Linear for open issues and enqueues them as GAIA tasks.
Run manually or via cron. No webhooks needed.

Usage:
    python .linear/coding-tools/linear-to-gaia.py
    # or with custom team filter:
    LINEAR_TEAM=SR python .linear/coding-tools/linear-to-gaia.py

Requires:
    LINEAR_API_KEY environment variable
"""

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import urllib.request
import urllib.error


def linear_graphql_query(query: str, variables: dict, api_key: str) -> dict:
    """Execute a Linear GraphQL query."""
    url = "https://api.linear.app/graphql"
    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json",
    }
    payload = json.dumps({"query": query, "variables": variables}).encode()

    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"Linear API error: {e.code} {e.read().decode()}")
        sys.exit(1)
    except Exception as e:
        print(f"Request failed: {e}")
        sys.exit(1)


def fetch_teams(api_key: str) -> list[dict]:
    """Fetch all teams from Linear."""
    query = """
    query Teams {
        teams {
            nodes {
                id
                name
                key
            }
        }
    }
    """
    result = linear_graphql_query(query, {}, api_key)
    return result.get("data", {}).get("teams", {}).get("nodes", [])


def fetch_open_issues(api_key: str, team_key: str | None = None) -> list[dict]:
    """Fetch open Linear issues (Todo, In Progress, Backlog)."""
    # If no team key specified, try to auto-detect from available teams
    if not team_key:
        teams = fetch_teams(api_key)
        if teams:
            # Use the first team that matches common sound-royale prefixes
            sound_teams = [t for t in teams if t.get("key", "").upper() in ("SR", "SOUND", "ROYALE")]
            if sound_teams:
                team_key = sound_teams[0]["key"]
                print(f"  Auto-detected team: {sound_teams[0]['name']} ({team_key})")
            else:
                # Just use the first team
                team_key = teams[0]["key"]
                print(f"  Using first team: {teams[0]['name']} ({team_key})")
        else:
            print("  No teams found, querying all issues")

    # Build filter: optional team filter + open states
    filter_parts = [{"state": {"name": {"in": ["Todo", "In Progress", "Backlog"]}}}]
    if team_key:
        filter_parts.append({"team": {"key": {"eq": team_key}}})

    query = """
    query Issues($filter: IssueFilter!) {
        issues(filter: $filter, first: 50) {
            nodes {
                id
                identifier
                title
                description
                url
                state {
                    name
                }
                labels {
                    nodes {
                        name
                    }
                }
            }
        }
    }
    """

    result = linear_graphql_query(query, {"filter": {"and": filter_parts}}, api_key)
    issues = result.get("data", {}).get("issues", {}).get("nodes", [])
    return issues


def load_queue(repo_root: Path) -> list[dict[str, Any]]:
    """Load existing GAIA task queue."""
    queue_path = repo_root / ".gaia_private" / "gaia" / "task_queue.jsonl"
    if not queue_path.exists():
        return []

    items = []
    for line in queue_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            items.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return items


def is_already_queued(queue: list[dict], linear_id: str) -> bool:
    """Check if a Linear issue is already in the queue (any status)."""
    for item in queue:
        task_text = item.get("task", "")
        if linear_id in task_text:
            return True
    return False


def extract_verify_command(text: str) -> str:
    """Determine verification command from issue content."""
    text_lower = text.lower()
    hints = {
        "e2e": "npx playwright test tests/e2e --reporter=line",
        "playwright": "npx playwright test tests/e2e --reporter=line",
        "test": "npx playwright test tests/e2e --reporter=line",
        "frontend": "npm run build && npx tsc --noEmit",
        "backend": "cd backend && python -m pytest --tb=short",
        "django": "cd backend && python -m pytest --tb=short",
        "api": "cd backend && python -m pytest --tb=short",
        "ui": "npm run build && npx tsc --noEmit",
        "component": "npm run build && npx tsc --noEmit",
        "ci": "act push || gh run list --limit 1",
    }
    for keyword, cmd in hints.items():
        if keyword in text_lower:
            return cmd
    return "npm run build && npx tsc --noEmit && cd backend && python -m pytest --tb=short"


def extract_file_paths(text: str) -> list[str]:
    """Extract likely file paths from issue description."""
    return re.findall(r'[a-zA-Z0-9_/-]+\.(py|ts|tsx|js|jsx|yml|yaml|json)', text)


def build_gaia_task(issue: dict) -> str:
    """Build GAIA task text from Linear issue."""
    title = issue.get("title", "Untitled")
    description = issue.get("description") or ""
    url = issue.get("url", f"https://linear.app/issue/{issue['identifier']}")
    labels = [l["name"] for l in issue.get("labels", {}).get("nodes", [])]

    full_text = f"{title} {description}"
    verify = extract_verify_command(full_text)
    files = extract_file_paths(full_text)

    label_tags = " ".join(f"#{l}" for l in labels) if labels else ""
    files_block = "\n".join(f"- {p}" for p in files) if files else "- (determine from context)"

    return f"""Goal: {title}
{label_tags}

Source: {url}

Description:
{description[:500]}

Verification: {verify}

Files:
{files_block}

Do not touch:
- dist/
- .serena/
- test-results/
- playwright-report/
"""


def enqueue_task(repo_root: Path, task_text: str, priority: int = 3, source: str = "linear-poll") -> str:
    """Add a task to the GAIA queue."""
    queue_path = repo_root / ".gaia_private" / "gaia" / "task_queue.jsonl"
    queue_path.parent.mkdir(parents=True, exist_ok=True)

    task_id = f"task-{int(time.time())}"
    item = {
        "id": task_id,
        "task": task_text,
        "priority": priority,
        "status": "pending",
        "attempts": 0,
        "next_run_at": None,
        "last_error": None,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "source": source,
    }

    with queue_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")

    return task_id


def main():
    api_key = os.environ.get("LINEAR_API_KEY", "")
    if not api_key:
        print("Error: LINEAR_API_KEY environment variable required")
        print("Get yours from: https://linear.app/settings/api")
        sys.exit(1)

    team_key = os.environ.get("LINEAR_TEAM", None)
    repo_root = Path(__file__).resolve().parent.parent.parent.parent

    print(f"Fetching open issues from Linear...")
    if team_key:
        print(f"  Team filter: {team_key}")

    issues = fetch_open_issues(api_key, team_key)
    print(f"  Found {len(issues)} open issues")

    queue = load_queue(repo_root)
    print(f"  Existing queued tasks: {len(queue)}")

    enqueued = 0
    skipped = 0

    for issue in issues:
        linear_id = issue.get("identifier", issue.get("id"))
        if is_already_queued(queue, linear_id):
            print(f"  ⏭️  {linear_id}: already queued")
            skipped += 1
            continue

        title = issue.get("title", "Untitled")
        labels = [l["name"] for l in issue.get("labels", {}).get("nodes", [])]
        priority = 2 if any(l in labels for l in ["urgent", "bug", "critical"]) else 3

        task_text = build_gaia_task(issue)
        task_id = enqueue_task(repo_root, task_text, priority)

        print(f"  ✅ {linear_id}: {title[:50]}... (task {task_id})")
        enqueued += 1

    print(f"\nDone: {enqueued} enqueued, {skipped} already in queue")
    print(f"\nNext steps:")
    print(f"  1. Review queue: python scripts/gaia-polecat.py --list-queue")
    print(f"  2. Run tasks:     python scripts/gaia-polecat.py --run-queue")


if __name__ == "__main__":
    main()
