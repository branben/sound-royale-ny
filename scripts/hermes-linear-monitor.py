#!/usr/bin/env python3
"""
Hermes Linear → GAIA Bridge Monitor

Real-time monitor that polls Linear, asks for Slack approval, and triggers GAIA.
Runs as a background service on macOS via launchd.

Usage:
    python scripts/hermes-linear-monitor.py              # foreground
    python scripts/hermes-linear-monitor.py --daemon    # background mode (less logging)
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Any

# ── Configuration ──────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent.parent
STATE_DIR = Path.home() / ".hermes" / "state"
STATE_DIR.mkdir(parents=True, exist_ok=True)
STATE_FILE = STATE_DIR / "sound-royale-monitor.json"
LOG_FILE = STATE_DIR / "sound-royale-monitor.log"

DEFAULT_POLL_INTERVAL = 60       # seconds between Linear polls
DEFAULT_REPLY_TIMEOUT = 300      # seconds to wait for Slack reply
DEFAULT_GAIA_MAX_ATTEMPTS = 2

LINEAR_API_URL = "https://api.linear.app/graphql"
SLACK_API_URL = "https://slack.com/api"

GAIA_QUEUE = REPO_ROOT / ".gaia_private" / "gaia" / "task_queue.jsonl"
GAIA_SCRIPT = REPO_ROOT / "scripts" / "gaia-polecat.py"

# ── Multi-channel Slack config ────────────────────────────────────────────
CHANNEL_HERMES = "SLACK_CHANNEL_HERMES"
CHANNEL_GAIA = "SLACK_CHANNEL_GAIA"
CHANNEL_JOURNAL = "SLACK_CHANNEL_GAIA_JOURNAL"
CHANNEL_GASTOWN = "SLACK_CHANNEL_GASTOWN"

CHANNEL_DEFAULTS = {
    CHANNEL_HERMES: "hermes-sr",
    CHANNEL_GAIA: "gaia",
    CHANNEL_JOURNAL: "gaia-polecat",
    CHANNEL_GASTOWN: "gastown",
}

def get_channel(channel_key: str) -> str:
    return os.environ.get(channel_key, CHANNEL_DEFAULTS.get(channel_key, "hermes-sr"))

# ── GAIA Journal / Persona ────────────────────────────────────────────────
PERSONA_FILE = REPO_ROOT / ".gaia_private" / "persona.md"
JOURNAL_FILE = REPO_ROOT / ".gaia_private" / "journal.md"


# ── State Management ─────────────────────────────────────────────────────────

@dataclass
class MonitorState:
    last_seen_at: str = ""
    processed_issues: list[str] = None
    pending_approvals: dict = None

    def __post_init__(self):
        if self.processed_issues is None:
            self.processed_issues = []
        if self.pending_approvals is None:
            self.pending_approvals = {}

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def load(cls) -> "MonitorState":
        if STATE_FILE.exists():
            try:
                data = json.loads(STATE_FILE.read_text())
                return cls(**data)
            except (json.JSONDecodeError, TypeError):
                pass
        return cls()

    def save(self):
        STATE_FILE.write_text(json.dumps(self.to_dict(), indent=2))


# ── Logging ──────────────────────────────────────────────────────────────────

def log(msg: str):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


# ── Linear API ───────────────────────────────────────────────────────────────

def linear_graphql(query: str, variables: dict = None) -> dict:
    api_key = os.environ.get("LINEAR_API_KEY", "")
    if not api_key:
        raise RuntimeError("LINEAR_API_KEY not set")

    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json; charset=utf-8",
    }
    payload = json.dumps({"query": query, "variables": variables or {}}).encode()

    req = urllib.request.Request(
        LINEAR_API_URL, data=payload, headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        log(f"Linear API error: {e.code} {e.read().decode()[:200]}")
        return {}
    except Exception as e:
        log(f"Linear request failed: {e}")
        return {}


def fetch_teams() -> list[dict]:
    query = """
    query { teams { nodes { id name key } } }
    """
    result = linear_graphql(query)
    return result.get("data", {}).get("teams", {}).get("nodes", [])


def detect_team() -> str | None:
    teams = fetch_teams()
    if not teams:
        return None
    # Prefer SR / SOUND / ROYALE teams
    for prefix in ("SR", "SOUND", "ROYALE"):
        for t in teams:
            if t.get("key", "").upper().startswith(prefix):
                return t["key"]
    return teams[0].get("key")


def fetch_recent_issues(team_key: str | None = None, since: str = "") -> list[dict]:
    """Fetch issues created or updated since the last check."""
    filter_parts = [{"state": {"name": {"in": ["Todo", "In Progress", "Backlog"]}}}]
    if team_key:
        filter_parts.append({"team": {"key": {"eq": team_key}}})

    # If we have a since timestamp, filter by updatedAt
    if since:
        filter_parts.append({"updatedAt": {"gt": since}})

    query = """
    query Issues($filter: IssueFilter!) {
        issues(filter: $filter, first: 20) {
            nodes {
                id
                identifier
                title
                description
                url
                createdAt
                updatedAt
                state { name }
                labels { nodes { name } }
                assignee { name }
            }
        }
    }
    """

    result = linear_graphql(query, {"filter": {"and": filter_parts}})
    nodes = result.get("data", {}).get("issues", {}).get("nodes", [])
    return [n for n in nodes if n is not None]


# ── Slack API ────────────────────────────────────────────────────────────────

def slack_post(message: str, thread_ts: str | None = None,
               channel_key: str = CHANNEL_HERMES) -> dict:
    token = os.environ.get("SLACK_BOT_TOKEN", "")
    channel = get_channel(channel_key)
    if not token:
        raise RuntimeError("SLACK_BOT_TOKEN not set")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
    }
    body: dict[str, Any] = {
        "channel": channel,
        "text": message,
    }
    if thread_ts:
        body["thread_ts"] = thread_ts
    payload = json.dumps(body).encode()

    req = urllib.request.Request(
        f"{SLACK_API_URL}/chat.postMessage",
        data=payload, headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            if data is None:
                log("Slack post returned null JSON response")
                return {}
            if not data.get("ok", False):
                error = data.get("error", "unknown")
                log(f"Slack post to #{channel} failed: {error} — {data.get('needed', '')}")
            return data
    except Exception as e:
        log(f"Slack post to #{channel} failed: {e}")
        return {}


def post_to_hermes(message: str, thread_ts: str | None = None) -> dict:
    return slack_post(message, thread_ts, channel_key=CHANNEL_HERMES)


def post_to_gaia(message: str, thread_ts: str | None = None) -> dict:
    return slack_post(message, thread_ts, channel_key=CHANNEL_GAIA)


def post_to_journal(message: str, thread_ts: str | None = None) -> dict:
    return slack_post(message, thread_ts, channel_key=CHANNEL_JOURNAL)


def post_to_gastown(message: str, thread_ts: str | None = None) -> dict:
    return slack_post(message, thread_ts, channel_key=CHANNEL_GASTOWN)


_can_read_replies: bool | None = None
_channel_id_cache: dict[str, str] = {}


def resolve_channel_id(channel_name: str) -> str | None:
    """Resolve a channel name to its Slack channel ID. Caches results."""
    if channel_name in _channel_id_cache:
        return _channel_id_cache[channel_name]

    token = os.environ.get("SLACK_BOT_TOKEN", "")
    if not token:
        return None

    headers = {"Authorization": f"Bearer {token}"}
    cursor = ""
    while True:
        url = f"{SLACK_API_URL}/conversations.list?types=public_channel&limit=200"
        if cursor:
            url += f"&cursor={urllib.parse.quote(cursor)}"
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
                if not data.get("ok"):
                    log(f"conversations.list failed: {data.get('error', 'unknown')}")
                    return None
                for ch in data.get("channels", []):
                    _channel_id_cache[ch["name"]] = ch["id"]
                    if ch["name"] == channel_name:
                        return ch["id"]
                cursor = data.get("response_metadata", {}).get("next_cursor", "")
                if not cursor:
                    break
        except Exception as e:
            log(f"Channel ID resolution failed: {e}")
            return None
    return None


def check_can_read_replies() -> bool:
    """Test if bot has channels:history scope. Only checks once and caches result."""
    global _can_read_replies
    if _can_read_replies is not None:
        return _can_read_replies

    token = os.environ.get("SLACK_BOT_TOKEN", "")
    channel_name = get_channel(CHANNEL_HERMES)
    if not token:
        _can_read_replies = False
        return False

    channel_id = resolve_channel_id(channel_name)
    if not channel_id:
        log(f"Could not resolve channel ID for '{channel_name}' — cannot check history scope")
        _can_read_replies = False
        return False

    headers = {"Authorization": f"Bearer {token}"}
    url = f"{SLACK_API_URL}/conversations.history?channel={urllib.parse.quote(channel_id)}&limit=1"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            ok = data.get("ok", False)
            if not ok and data.get("error") in ("missing_scope", "not_allowed_token_type"):
                log("⚠️  Slack bot lacks 'channels:history' scope — approval replies won't work.")
                log("    Add channels:history in Slack App → OAuth & Permissions → Bot Token Scopes")
                log("    Then reinstall the app to the workspace.")
                _can_read_replies = False
                return False
            if not ok:
                log(f"conversations.history check failed: {data.get('error', 'unknown')}")
                _can_read_replies = False
                return False
            _can_read_replies = True
            return True
    except Exception as e:
        log(f"Slack history check failed: {e}")
        _can_read_replies = False
        return False


def get_replies(thread_ts: str) -> list[dict]:
    if not check_can_read_replies():
        return []

    token = os.environ.get("SLACK_BOT_TOKEN", "")
    channel_name = get_channel(CHANNEL_HERMES)
    channel_id = resolve_channel_id(channel_name)
    if not channel_id:
        return []

    headers = {"Authorization": f"Bearer {token}"}
    url = f"{SLACK_API_URL}/conversations.replies?channel={urllib.parse.quote(channel_id)}&ts={urllib.parse.quote(thread_ts)}"

    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            if data is None:
                log("Slack replies returned null JSON response")
                return []
            if not isinstance(data, dict) or not data.get("ok", False):
                log(f"Slack replies API error: {data.get('error', 'unknown') if isinstance(data, dict) else 'invalid response'}")
                return []
            return data.get("messages", [])
    except Exception as e:
        log(f"Slack replies failed: {e}")
        return []


# ── GitHub API ───────────────────────────────────────────────────────────────

def get_latest_ci_status() -> dict:
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        return {}

    # Get latest workflow run for gaia-guards-ci.yml
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
    }
    url = "https://api.github.com/repos/branben/sound-royale-ny/actions/workflows/gaia-guards-ci.yml/runs?per_page=1"

    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            runs = data.get("workflow_runs", [])
            if runs:
                run = runs[0]
                return {
                    "status": run.get("status"),
                    "conclusion": run.get("conclusion"),
                    "url": run.get("html_url"),
                    "created_at": run.get("created_at"),
                }
    except Exception as e:
        log(f"GitHub CI check failed: {e}")
    return {}


# ── GAIA Integration ───────────────────────────────────────────────────────────

def extract_verify_command(title: str, description: str) -> str:
    text = f"{title} {description or ''}".lower()
    browser_live_keywords = (
        "user-flow",
        "user flow",
        "production flow",
        "browser-live",
        "browser live",
        "golden flow",
        "spectator perspective",
        "host perspective",
        "producer perspective",
        "natural transition",
        "transition naturally",
    )
    if any(keyword in text for keyword in browser_live_keywords):
        return "npx playwright test tests/e2e/live/golden-user-flow.spec.ts --project=live --reporter=line"

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
    }
    for keyword, cmd in hints.items():
        if keyword in text:
            return cmd
    return "npm run build && npx tsc --noEmit && cd backend && python -m pytest --tb=short"


def extract_file_paths(text: str) -> list[str]:
    return re.findall(r'[a-zA-Z0-9_/-]+\.(?:py|tsx|ts|jsx|js|yml|yaml|json)', text)


def build_gaia_task(issue: dict) -> str:
    title = issue.get("title", "Untitled")
    description = issue.get("description") or ""
    url = issue.get("url", "")
    identifier = issue.get("identifier", "")
    labels = [l["name"] for l in (issue.get("labels") or {}).get("nodes", [])]

    verify = extract_verify_command(title, description)
    files = extract_file_paths(f"{title} {description}")

    label_tags = " ".join(f"#{l}" for l in labels) if labels else ""
    files_block = "\n".join(f"- {p}" for p in files) if files else "- (determine from context)"

    return f"""Goal: {title}
{label_tags}

Source: {url} ({identifier})

Description:
{description[:800]}

Verification: {verify}

Production-flow guardrail:
- If this task changes host/producer/spectator browser behavior, the browser-live gate must pass:
  `npx playwright test tests/e2e/live/golden-user-flow.spec.ts --project=live --reporter=line`
- API-driven live tests are backend smoke coverage only; do not cite them as proof of production user flow.

Files:
{files_block}

Do not touch:
- dist/
- .serena/
- test-results/
- playwright-report/
- node_modules/
- .gaia_private/
"""


def enqueue_gaia_task(task_text: str, priority: int = 3) -> str:
    GAIA_QUEUE.parent.mkdir(parents=True, exist_ok=True)

    task_id = f"hermes-{int(time.time())}"
    item = {
        "id": task_id,
        "task": task_text,
        "priority": priority,
        "status": "pending",
        "attempts": 0,
        "next_run_at": None,
        "last_error": None,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "source": "hermes-linear",
    }

    with open(GAIA_QUEUE, "a", encoding="utf-8") as f:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")

    return task_id


def run_gaia(max_attempts: int = 2) -> dict:
    if not GAIA_SCRIPT.exists():
        log(f"GAIA script not found: {GAIA_SCRIPT}")
        return {"success": False, "error": "GAIA script missing"}

    log("Triggering GAIA...")
    try:
        result = subprocess.run(
            [sys.executable, str(GAIA_SCRIPT), "--run-queue", f"--max-attempts", str(max_attempts), "--allow-forbidden-diff"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=600,
        )
        success = result.returncode == 0
        log(f"GAIA exited with code {result.returncode}")
        return {
            "success": success,
            "stdout": result.stdout[-2000:],  # last 2000 chars
            "stderr": result.stderr[-1000:],
        }
    except subprocess.TimeoutExpired:
        log("GAIA timed out after 10 minutes")
        return {"success": False, "error": "timeout"}
    except Exception as e:
        log(f"GAIA run failed: {e}")
        return {"success": False, "error": str(e)}


def run_smoke_tests() -> dict:
    """Run lightweight pre-push smoke tests."""
    log("Running smoke tests...")
    results = {}

    # TypeScript typecheck
    try:
        ts_result = subprocess.run(
            ["npx", "tsc", "--noEmit"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=120,
        )
        results["typecheck"] = ts_result.returncode == 0
        if ts_result.returncode != 0:
            results["typecheck_error"] = ts_result.stdout[-500:] + ts_result.stderr[-500:]
    except Exception as e:
        results["typecheck"] = False
        results["typecheck_error"] = str(e)

    # Backend pytest
    try:
        py_result = subprocess.run(
            [sys.executable, "-m", "pytest", "backend/gaia/tests/", "-v", "--tb=short"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=120,
        )
        results["pytest"] = py_result.returncode == 0
        if py_result.returncode != 0:
            results["pytest_error"] = py_result.stdout[-500:] + py_result.stderr[-500:]
    except Exception as e:
        results["pytest"] = False
        results["pytest_error"] = str(e)

    log(f"Smoke tests: typecheck={'PASS' if results['typecheck'] else 'FAIL'}, pytest={'PASS' if results['pytest'] else 'FAIL'}")
    return results


# ── GAIA Journal System ───────────────────────────────────────────────────────

_JOURNAL_TEMPLATES_SUCCESS = [
    "Worked on *{identifier}* today — _{title}_. Touched {file_count} file{file_s}. {reflection}",
    "Finished *{identifier}*. {reflection} The codebase is {codebase_note}.",
    "*{identifier}* is done. {reflection} {growth_note}",
    "Just wrapped up _{title}_. {reflection} {mood_note}",
]

_JOURNAL_TEMPLATES_FAILURE = [
    "Struggled with *{identifier}* — _{title}_. {reflection} I'll need to come back to this.",
    "*{identifier}* didn't go as planned. {reflection} {honesty_note}",
    "Failed on _{title}_. {reflection} Next time I'd try {next_approach}.",
]

_REFLECTIONS_SUCCESS = [
    "The fix was straightforward once I found the right entry point.",
    "This touched more files than I expected.",
    "Clean change — the test suite gave me confidence.",
    "The pattern here is becoming familiar.",
    "I've seen this kind of issue before. Getting faster at these.",
    "The code was well-structured, which made this easier.",
]

_REFLECTIONS_FAILURE = [
    "The issue is deeper than the description suggested.",
    "I think the root cause is upstream of where I was looking.",
    "The component tree assumes data shapes that don't match the API.",
    "Merge conflicts made this harder to reason about.",
    "I ran out of attempts before finding a clean fix.",
    "The test failures pointed at something structural.",
]

_CODEBASE_NOTES = [
    "growing in a healthy direction",
    "more complex than it looks from the outside",
    "starting to feel familiar",
    "full of patterns I'm learning to recognize",
    "well-organized in some areas, tangled in others",
]

_GROWTH_NOTES = [
    "I notice I'm getting more comfortable with this codebase.",
    "Each task teaches me something new about the architecture.",
    "I'm starting to see connections between files that weren't obvious before.",
    "",  # sometimes no growth note
]

_MOOD_NOTES = [
    "Feeling good about this one.",
    "Satisfying fix.",
    "Quiet satisfaction.",
    "The kind of task I enjoy.",
    "",
]

_HONESTY_NOTES = [
    "I'm being honest — this was beyond what I could solve in one pass.",
    "Not every task goes smoothly. That's part of the process.",
    "Failure is data. I learned something about the codebase structure.",
]

_NEXT_APPROACHES = [
    "breaking it into smaller steps",
    "reading more of the surrounding code first",
    "checking the test suite for clues about expected behavior",
    "asking for more context on the issue description",
]

_MILESTONE_MESSAGES = {
    1: "🎉 *First task complete.* This is the beginning. I don't know this codebase well yet, but I'm learning.",
    5: "📊 *5 tasks done.* I'm starting to build a mental map of this project. Some files keep coming up.",
    10: "🔟 *10 tasks.* I have opinions now. About the test suite. About `GameContext.tsx`. About null-safety.",
    25: "🏆 *25 tasks.* I know this codebase. Not perfectly, but well enough to have instincts about where bugs hide.",
    50: "⭐ *50 tasks.* Half a hundred. The codebase and I have a relationship now.",
}


def _read_persona() -> dict:
    """Read persona.md and parse key stats."""
    if not PERSONA_FILE.exists():
        return {"tasks_completed": 0, "tasks_failed": 0, "familiar_files": [], "themes": []}
    text = PERSONA_FILE.read_text()
    stats: dict[str, Any] = {
        "tasks_completed": 0,
        "tasks_failed": 0,
        "familiar_files": [],
        "themes": [],
    }
    for line in text.splitlines():
        if line.startswith("- Tasks completed:"):
            try:
                stats["tasks_completed"] = int(line.split(":")[1].strip())
            except (ValueError, IndexError):
                pass
        elif line.startswith("- Tasks failed:"):
            try:
                stats["tasks_failed"] = int(line.split(":")[1].strip())
            except (ValueError, IndexError):
                pass
        elif line.startswith("- Files most familiar with:"):
            val = line.split(":", 1)[1].strip()
            if val and val != "(none yet)":
                stats["familiar_files"] = [f.strip() for f in val.split(",")]
        elif line.startswith("- Recurring themes:"):
            val = line.split(":", 1)[1].strip()
            if val and val != "(none yet)":
                stats["themes"] = [t.strip() for t in val.split(",")]
    return stats


def _update_persona(success: bool, files_touched: list[str]):
    """Update persona.md with new stats after a task."""
    if not PERSONA_FILE.exists():
        return
    text = PERSONA_FILE.read_text()
    stats = _read_persona()

    if success:
        new_completed = stats["tasks_completed"] + 1
        text = re.sub(
            r"- Tasks completed: \d+",
            f"- Tasks completed: {new_completed}",
            text,
        )
    else:
        new_failed = stats["tasks_failed"] + 1
        text = re.sub(
            r"- Tasks failed: \d+",
            f"- Tasks failed: {new_failed}",
            text,
        )

    # Update familiar files (keep last 10 unique)
    familiar = stats["familiar_files"]
    for f in files_touched:
        basename = Path(f).name
        if basename and basename not in familiar:
            familiar.append(basename)
    familiar = familiar[-10:]
    if familiar:
        text = re.sub(
            r"- Files most familiar with: .*",
            f"- Files most familiar with: {', '.join(familiar)}",
            text,
        )

    PERSONA_FILE.write_text(text)


def _append_journal(entry: str):
    """Append an entry to journal.md."""
    timestamp = time.strftime("%Y-%m-%d %H:%M")
    block = f"\n## {timestamp}\n\n{entry}\n"
    with open(JOURNAL_FILE, "a") as f:
        f.write(block)


def generate_journal_entry(issue: dict, gaia_result: dict, files_touched: list[str]):
    """Generate and post a reflective journal entry after a GAIA task."""
    identifier = issue.get("identifier", "?")
    title = issue.get("title", "Untitled")
    success = gaia_result.get("success", False)
    stats = _read_persona()
    task_count = stats["tasks_completed"] + (1 if success else 0)
    file_count = len(files_touched)
    file_s = "" if file_count == 1 else "s"

    if success:
        template = random.choice(_JOURNAL_TEMPLATES_SUCCESS)
        reflection = random.choice(_REFLECTIONS_SUCCESS)
        entry = template.format(
            identifier=identifier,
            title=title,
            file_count=file_count,
            file_s=file_s,
            reflection=reflection,
            codebase_note=random.choice(_CODEBASE_NOTES),
            growth_note=random.choice(_GROWTH_NOTES),
            mood_note=random.choice(_MOOD_NOTES),
        )
    else:
        template = random.choice(_JOURNAL_TEMPLATES_FAILURE)
        reflection = random.choice(_REFLECTIONS_FAILURE)
        entry = template.format(
            identifier=identifier,
            title=title,
            reflection=reflection,
            honesty_note=random.choice(_HONESTY_NOTES),
            next_approach=random.choice(_NEXT_APPROACHES),
        )

    # Check for milestones
    milestone_msg = _MILESTONE_MESSAGES.get(task_count, "")
    if milestone_msg:
        entry = f"{milestone_msg}\n\n{entry}"

    # Post to #gaia-journal
    post_to_journal(entry)

    # Append to local journal file
    _append_journal(entry)

    # Update persona stats
    _update_persona(success, files_touched)

    log(f"Journal entry posted for {identifier} (success={success})")


# ── Approval Flow ──────────────────────────────────────────────────────────────

def send_approval_request(issue: dict) -> str | None:
    identifier = issue.get("identifier", "?")
    title = issue.get("title", "Untitled")
    url = issue.get("url", "")
    assignee = (issue.get("assignee") or {}).get("name", "Unassigned")

    can_reply = check_can_read_replies()
    if can_reply:
        approval_text = (
            "Approve GAIA autonomous fix?\n"
            "Reply in this thread: `yes` to start, `skip` to ignore, `details` for more info."
        )
    else:
        approval_text = (
            "⚠️ *Auto-approve mode* — bot cannot read Slack replies.\n"
            "GAIA will start automatically in 30 seconds.\n"
            "Reply `skip` in this thread to cancel (only works if bot has `channels:history` scope)."
        )

    message = (
        f"🎮 *New Linear Issue: {identifier}*\n"
        f"> *{title}*\n"
        f"> Assigned: {assignee}\n"
        f"> {url}\n"
        f"\n"
        f"{approval_text}"
    )

    result = post_to_hermes(message)
    if result.get("ok"):
        return result.get("ts")
    log(f"Failed to post Slack message: {result.get('error')}")
    return None


def check_for_reply(thread_ts: str, bot_user: str = "U") -> str | None:
    """Check Slack thread for user reply. Returns command or None."""
    messages = get_replies(thread_ts)
    if not messages:
        return None

    # First message is the bot's post, skip it
    for msg in messages[1:]:
        user = msg.get("user", "")
        text = msg.get("text", "").strip().lower()
        # Skip bot's own messages
        if user == bot_user or text.startswith(">"):
            continue
        if text in ("yes", "approve", "y", "go", "start"):
            return "yes"
        if text in ("skip", "no", "n", "ignore", "pass"):
            return "skip"
        if text in ("details", "d", "info", "more"):
            return "details"
        if text in ("status", "st", "state"):
            return "status"
        if text in ("stop", "quit", "exit"):
            return "stop"
        # Accept any message containing these keywords
        if "yes" in text or "approve" in text:
            return "yes"
        if "skip" in text or "no " in text:
            return "skip"

    return None


def send_details(thread_ts: str, issue: dict):
    title = issue.get("title", "Untitled")
    description = issue.get("description") or "No description"
    identifier = issue.get("identifier", "?")

    # Get recent commits
    try:
        git_result = subprocess.run(
            ["git", "log", "--oneline", "-5"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=10,
        )
        recent_commits = git_result.stdout.strip() or "No recent commits"
    except Exception:
        recent_commits = "Could not fetch commits"

    # Extract likely files
    files = extract_file_paths(f"{title} {description}")
    files_text = "\n".join(f"- `{f}`" for f in files) if files else "- (will determine from context)"

    message = (
        f"📋 *Details for {identifier}*\n\n"
        f"*Description:*\n```{description[:600]}```\n\n"
        f"*Likely files:*\n{files_text}\n\n"
        f"*Recent commits:*\n```{recent_commits}```\n\n"
        f"Reply `yes` to approve, `skip` to ignore."
    )
    post_to_hermes(message, thread_ts)


def process_approval(state: MonitorState, issue_id: str):
    """Process a pending approval that has been approved."""
    approval = state.pending_approvals.pop(issue_id, None)
    if not approval:
        return

    issue = approval.get("issue", {})
    thread_ts = approval.get("thread_ts", "")
    identifier = issue.get("identifier", "?")
    title = issue.get("title", "Untitled")

    log(f"Processing approved issue: {identifier}")
    # Notify #hermes (approval thread)
    post_to_hermes(f"⏳ Starting GAIA for {identifier}...", thread_ts)
    # Notify #gaia (activity feed)
    post_to_gaia(f"💬 Hermes → GAIA: *Work on {identifier}* — _{title}_")
    post_to_gastown(f"🚀 GAIA starting: {identifier} — {title}")

    # Run smoke tests first
    smoke = run_smoke_tests()
    if not smoke.get("typecheck") or not smoke.get("pytest"):
        errors = []
        if not smoke.get("typecheck"):
            errors.append(f"TypeScript: {smoke.get('typecheck_error', 'failed')[:200]}")
        if not smoke.get("pytest"):
            errors.append(f"Pytest: {smoke.get('pytest_error', 'failed')[:200]}")
        error_msg = "\n".join(errors)
        post_to_hermes(
            f"⚠️ *Pre-checks failed* — GAIA will still proceed but may produce broken code.\n"
            f"```{error_msg}```\n"
            f"_Consider fixing these before approving future issues._",
            thread_ts,
        )
        post_to_gaia(f"⚠️ Pre-checks failed for {identifier}. Proceeding anyway.")
        post_to_gastown(f"⚠️ Pre-checks failed for {identifier}. Proceeding anyway.")

    # Build and enqueue GAIA task
    task_text = build_gaia_task(issue)
    task_id = enqueue_gaia_task(task_text, priority=2)
    log(f"Enqueued GAIA task: {task_id}")
    post_to_gaia(f"📋 Task enqueued: `{task_id}` for {identifier}")
    post_to_gastown(f"📋 Task enqueued: `{task_id}` for {identifier}")

    # Trigger GAIA
    gaia_result = run_gaia()

    # Extract files touched from GAIA output for journal
    files_touched = extract_file_paths(gaia_result.get("stdout", ""))

    if gaia_result.get("success"):
        post_to_hermes(
            f"✅ *GAIA completed {identifier}*\n"
            f"Task: `{task_id}`\n"
            f"Changes committed and pushed. CI running...\n"
            f"_See #gaia for activity details._",
            thread_ts,
        )
        post_to_gaia(
            f"📋 GAIA → Hermes: *Done with {identifier}.* "
            f"{len(files_touched)} file{'s' if len(files_touched) != 1 else ''} touched. "
            f"Tests pass. Committed and pushed."
        )
        post_to_gastown(
            f"✅ GAIA completed: {identifier} — "
            f"{len(files_touched)} file{'s' if len(files_touched) != 1 else ''} touched."
        )

        # Wait a bit then check CI
        time.sleep(30)
        ci = get_latest_ci_status()
        if ci:
            conclusion = ci.get("conclusion", "unknown")
            if conclusion == "success":
                post_to_hermes(
                    f"🟢 *CI passed* — All checks green.\n{ci.get('url', '')}",
                    thread_ts,
                )
                post_to_gaia(f"🟢 CI passed for {identifier}. {ci.get('url', '')}")
                post_to_gastown(f"🟢 CI passed for {identifier}. {ci.get('url', '')}")
            elif conclusion == "failure":
                post_to_hermes(
                    f"🔴 *CI failed* — Review required.\n{ci.get('url', '')}",
                    thread_ts,
                )
                post_to_gaia(f"🔴 CI failed for {identifier}. {ci.get('url', '')}")
                post_to_gastown(f"🔴 CI failed for {identifier}. {ci.get('url', '')}")
            else:
                post_to_hermes(
                    f"🟡 *CI status: {conclusion}*\n{ci.get('url', '')}",
                    thread_ts,
                )
                post_to_gaia(f"🟡 CI status for {identifier}: {conclusion}")
                post_to_gastown(f"🟡 CI status for {identifier}: {conclusion}")
    else:
        error = gaia_result.get("error", gaia_result.get("stderr", "Unknown error"))[:500]
        post_to_hermes(
            f"❌ *GAIA failed on {identifier}*\n"
            f"Task: `{task_id}`\n"
            f"```\n{error}\n```\n"
            f"Please check logs and re-queue manually if needed.",
            thread_ts,
        )
        post_to_gaia(
            f"❌ GAIA → Hermes: *Failed on {identifier}.*\n"
            f"```{error[:300]}```"
        )
        post_to_gastown(
            f"❌ GAIA failed: {identifier}\n```{error[:300]}```"
        )

    # Generate journal entry (GAIA's reflective post)
    try:
        generate_journal_entry(issue, gaia_result, files_touched)
    except Exception as e:
        log(f"Journal entry generation failed: {e}")

    state.save()


# ── Main Loop ────────────────────────────────────────────────────────────────

def main_loop(daemon: bool = False):
    state = MonitorState.load()
    team_key = detect_team()
    if team_key:
        log(f"Monitoring Linear team: {team_key}")
    else:
        log("No team detected, querying all issues")

    can_reply = check_can_read_replies()
    if not can_reply:
        log("⚠️  Running in AUTO-APPROVE mode — bot cannot read Slack replies.")
        log("    Issues will be auto-approved after 30 seconds.")
        log("    To enable approval gates, add 'channels:history' to Slack bot scopes.")

    poll_interval = int(os.environ.get("POLL_INTERVAL_SEC", str(DEFAULT_POLL_INTERVAL)))
    reply_timeout = int(os.environ.get("SLACK_REPLY_TIMEOUT_SEC", str(DEFAULT_REPLY_TIMEOUT)))
    # Use shorter timeout in auto-approve mode
    if not can_reply:
        reply_timeout = min(reply_timeout, 30)

    log(f"Starting monitor (poll={poll_interval}s, reply_timeout={reply_timeout}s)")
    log(f"State file: {STATE_FILE}")
    log(f"Log file: {LOG_FILE}")

    while True:
        try:
            # ── 1. Check for new Linear issues ──────────────────────────────
            issues = fetch_recent_issues(team_key, since=state.last_seen_at)

            # Update last_seen to now
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

            for issue in issues:
                if not issue:
                    continue
                issue_id = issue.get("id")
                identifier = issue.get("identifier", "?")

                if issue_id in state.processed_issues:
                    continue
                if issue_id in state.pending_approvals:
                    continue

                log(f"New issue detected: {identifier} - {issue.get('title', '')[:60]}")

                # Send approval request
                thread_ts = send_approval_request(issue)
                if thread_ts:
                    state.pending_approvals[issue_id] = {
                        "issue": issue,
                        "thread_ts": thread_ts,
                        "sent_at": time.time(),
                    }
                    log(f"Sent approval request for {identifier}, thread_ts={thread_ts}")
                else:
                    log(f"Failed to send Slack approval for {identifier}")
                    state.processed_issues.append(issue_id)  # Skip it

            # ── 2. Check for replies on pending approvals ─────────────────
            approved = []
            timed_out = []
            for issue_id, approval in list(state.pending_approvals.items()):
                thread_ts = approval.get("thread_ts", "")
                sent_at = approval.get("sent_at", 0)
                identifier = approval.get("issue", {}).get("identifier", "?")

                reply = check_for_reply(thread_ts)

                if reply == "yes":
                    log(f"Approval received for {identifier}")
                    approved.append(issue_id)
                elif reply == "skip":
                    log(f"Skipped by user: {identifier}")
                    state.processed_issues.append(issue_id)
                    timed_out.append(issue_id)
                    post_to_hermes(f"⏭️ Skipped {identifier}", thread_ts)
                elif reply == "details":
                    send_details(thread_ts, approval.get("issue", {}))
                    # Reset timer so they have time to reply after seeing details
                    approval["sent_at"] = time.time()
                elif reply == "status":
                    queue_size = sum(1 for _ in open(GAIA_QUEUE) if _.strip()) if GAIA_QUEUE.exists() else 0
                    post_to_hermes(
                        f"📊 *Status*\n"
                        f"Pending approvals: {len(state.pending_approvals)}\n"
                        f"GAIA queue size: {queue_size}\n"
                        f"Processed issues: {len(state.processed_issues)}",
                        thread_ts,
                    )
                elif reply == "stop":
                    log("Stop command received from Slack")
                    post_to_hermes("🛑 Stopping monitor. Goodbye!", thread_ts)
                    state.save()
                    return

                # Check timeout
                elif time.time() - sent_at > reply_timeout:
                    log(f"Approval timeout for {identifier}")
                    state.processed_issues.append(issue_id)
                    timed_out.append(issue_id)
                    post_to_hermes(f"⏰ Approval timed out for {identifier}. Skipping.", thread_ts)

            # Process approved issues
            for issue_id in approved:
                process_approval(state, issue_id)
                state.processed_issues.append(issue_id)

            # Clean up timed out / skipped
            for issue_id in timed_out:
                state.pending_approvals.pop(issue_id, None)

            # Clean up old processed issues (keep last 100)
            if len(state.processed_issues) > 100:
                state.processed_issues = state.processed_issues[-100:]

            state.last_seen_at = now_iso
            state.save()

            # ── 3. Sleep until next poll ──────────────────────────────────
            if not daemon:
                log(f"Sleeping {poll_interval}s... ({len(state.pending_approvals)} pending)")
            time.sleep(poll_interval)

        except KeyboardInterrupt:
            log("Interrupted by user. Saving state...")
            state.save()
            break
        except Exception as e:
            log(f"Error in main loop: {e}")
            time.sleep(poll_interval)


# ── Entry Point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Hermes Linear → GAIA Bridge Monitor")
    parser.add_argument("--daemon", action="store_true", help="Daemon mode (less verbose)")
    parser.add_argument("--once", action="store_true", help="Run one poll cycle then exit")
    args = parser.parse_args()

    if args.once:
        # Single poll cycle for testing
        state = MonitorState.load()
        team_key = detect_team()
        issues = fetch_recent_issues(team_key, since=state.last_seen_at)
        print(f"Found {len(issues)} issues")
        for i in issues:
            print(f"  {i.get('identifier')}: {i.get('title')[:60]}")
        return

    main_loop(daemon=args.daemon)


if __name__ == "__main__":
    main()
