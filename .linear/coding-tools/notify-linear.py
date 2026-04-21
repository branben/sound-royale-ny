#!/usr/bin/env python3
"""
Notify Linear of completed GAIA tasks.

Reads the GAIA queue for tasks that have status "completed" or "failed"
and posts a comment to the corresponding Linear issue.

Usage:
    python .linear/coding-tools/notify-linear.py

Requires:
    LINEAR_API_KEY environment variable
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path


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
        return {}
    except Exception as e:
        print(f"Request failed: {e}")
        return {}


def resolve_issue_uuid(linear_id: str, api_key: str) -> str | None:
    """Resolve a Linear issue identifier (e.g. 'SR-42') to a UUID."""
    # If already a UUID, return as-is
    if re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', linear_id, re.I):
        return linear_id

    query = """
    query IssueByKey($term: String!) {
        issues(filter: { identifier: { eq: $term } }) {
            nodes { id identifier }
        }
    }
    """
    result = linear_graphql_query(query, {"term": linear_id}, api_key)
    nodes = result.get("data", {}).get("issues", {}).get("nodes", [])
    if nodes:
        return nodes[0]["id"]
    return None


def post_comment(issue_uuid: str, body: str, api_key: str) -> bool:
    """Post a comment to a Linear issue."""
    query = """
    mutation AddComment($id: String!, $body: String!) {
        issueCommentCreate(input: { issueId: $id, body: $body }) {
            success
            comment { id }
        }
    }
    """
    result = linear_graphql_query(query, {"id": issue_uuid, "body": body}, api_key)
    success = result.get("data", {}).get("issueCommentCreate", {}).get("success", False)
    return success


def extract_linear_id(task_text: str) -> str | None:
    """Extract Linear issue identifier from task text."""
    # Look for patterns like "SR-42" or full URLs
    match = re.search(r'linear\.app/issue/([A-Z]+-\d+)', task_text)
    if match:
        return match.group(1)
    # Also look for bare identifiers in the task
    match = re.search(r'\b([A-Z]{1,10}-\d+)\b', task_text)
    if match:
        return match.group(1)
    return None


def load_queue(repo_root: Path) -> list[dict]:
    """Load GAIA task queue."""
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


def load_notified(repo_root: Path) -> set[str]:
    """Load set of already-notified task IDs."""
    notified_path = repo_root / ".gaia_private" / "gaia" / "linear_notified.json"
    if not notified_path.exists():
        return set()
    try:
        data = json.loads(notified_path.read_text())
        return set(data.get("notified", []))
    except (json.JSONDecodeError, KeyError):
        return set()


def save_notified(repo_root: Path, notified: set[str]) -> None:
    """Save notified task IDs."""
    notified_path = repo_root / ".gaia_private" / "gaia" / "linear_notified.json"
    notified_path.write_text(json.dumps({"notified": sorted(notified)}, indent=2))


def main():
    api_key = os.environ.get("LINEAR_API_KEY", "")
    if not api_key:
        print("Error: LINEAR_API_KEY not set")
        sys.exit(1)

    repo_root = Path(__file__).resolve().parent.parent.parent.parent
    queue = load_queue(repo_root)
    notified = load_notified(repo_root)

    # Find completed/failed tasks that haven't been notified
    actionable = [t for t in queue
                  if t.get("status") in ("completed", "failed")
                  and t.get("id") not in notified
                  and t.get("source") in ("linear-webhook", "linear-poll")]

    if not actionable:
        print("No new completed tasks to notify Linear about.")
        return

    print(f"Found {len(actionable)} completed/failed tasks to notify.")

    for task in actionable:
        task_id = task.get("id", "unknown")
        status = task.get("status", "unknown")
        task_text = task.get("task", "")

        linear_id = extract_linear_id(task_text)
        if not linear_id:
            print(f"  ⚠️ {task_id}: Could not extract Linear issue ID")
            notified.add(task_id)
            continue

        issue_uuid = resolve_issue_uuid(linear_id, api_key)
        if not issue_uuid:
            print(f"  ⚠️ {task_id}: Could not resolve {linear_id} to UUID")
            continue

        emoji = "✅" if status == "completed" else "❌"
        body = f"{emoji} **GAIA {status.upper()}** — Task `{task_id}`\n\n"

        if status == "failed":
            last_error = task.get("last_error", "Unknown error")
            body += f"**Error:** {last_error}\n\n"
            body += "Please review and re-queue if needed."
        else:
            body += "Changes have been committed. Please review the branch/PR."

        if post_comment(issue_uuid, body, api_key):
            print(f"  ✅ {task_id}: Notified Linear {linear_id}")
            notified.add(task_id)
        else:
            print(f"  ❌ {task_id}: Failed to notify Linear {linear_id}")

    save_notified(repo_root, notified)
    print(f"Done. {len(notified)} total tasks notified.")


if __name__ == "__main__":
    main()
