"""
Linear → GAIA Webhook Bridge

Receives Linear webhooks, validates signatures, and enqueues GAIA tasks.
Not restricted to E2E phases — handles any Linear issue type.
"""

import hashlib
import hmac
import json
import os
import time
import re
from pathlib import Path

from django.conf import settings
from django.http import JsonResponse
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

import logging

logger = logging.getLogger(__name__)

# Keyword → suggested verification command mapping (optional hints)
VERIFY_HINTS = {
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
    "websocket": "npx playwright test tests/e2e --reporter=line",
    "socket": "npx playwright test tests/e2e --reporter=line",
}


def extract_verify_command(text: str) -> str:
    """Try to extract a verification command from issue text, or return default."""
    text_lower = text.lower()
    for keyword, cmd in VERIFY_HINTS.items():
        if keyword in text_lower:
            return cmd
    return "npm run build && npx tsc --noEmit && cd backend && python -m pytest --tb=short"


def extract_file_paths(text: str) -> list[str]:
    """Extract likely file paths from issue description."""
    return re.findall(r'[a-zA-Z0-9_/-]+\.(py|ts|tsx|js|jsx|yml|yaml|json)', text)


def build_gaia_task(issue_id: str, title: str, description: str, labels: list[str], url: str) -> str:
    """Build a flexible GAIA task description from Linear issue data."""
    full_text = f"{title} {description}"
    verify = extract_verify_command(full_text)
    files = extract_file_paths(full_text)

    # Build a clean task description
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
- .ai-tools/.serena/
- test-results/
- playwright-report/
"""


def enqueue_gaia_task(task_text: str, priority: int = 3) -> str:
    """Write a GAIA task to the queue file. Returns task ID."""
    repo_root = Path(__file__).resolve().parent.parent.parent
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
        "source": "linear-webhook",
    }

    with queue_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")

    return task_id


def verify_linear_signature(payload_body: bytes, signature: str, secret: str) -> bool:
    """Verify Linear webhook signature using HMAC-SHA256."""
    if not secret:
        logger.warning("No LINEAR_WEBHOOK_SECRET configured, accepting webhook without verification")
        return True

    if not signature:
        return False

    expected = hmac.new(secret.encode(), payload_body, hashlib.sha256).hexdigest()
    # Linear sends: sha256=<hex>
    if signature.startswith("sha256="):
        signature = signature[7:]

    return hmac.compare_digest(signature, expected)


@method_decorator(csrf_exempt, name="dispatch")
class LinearWebhookView(View):
    """
    Receive Linear webhooks and enqueue GAIA tasks.

    Configure in Linear: Project Settings → Webhooks → Add endpoint
    URL: https://your-domain.com/api/webhooks/linear/
    Secret: matches LINEAR_WEBHOOK_SECRET env var
    """

    def post(self, request):
        secret = getattr(settings, "LINEAR_WEBHOOK_SECRET", os.environ.get("LINEAR_WEBHOOK_SECRET", ""))
        signature = request.headers.get("Linear-Signature", "")
        body = request.body

        if not verify_linear_signature(body, signature, secret):
            logger.warning("Invalid Linear webhook signature")
            return JsonResponse({"error": "Invalid signature"}, status=401)

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            logger.warning("Invalid JSON in Linear webhook payload")
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        # Linear webhooks have different structures based on event type
        # We care about issue.created, issue.updated
        event_type = payload.get("type", payload.get("action", "unknown"))
        data = payload.get("data", payload)

        # Extract issue fields
        issue_id = data.get("identifier", data.get("id", "unknown"))
        title = data.get("title", "Untitled")
        description = data.get("description", "")
        state = data.get("state", {})
        labels = [l.get("name", "") for l in data.get("labels", [])]
        url = data.get("url", f"https://linear.app/issue/{issue_id}")

        # Only process actionable states (not canceled, done, etc.)
        state_name = state.get("name", "").lower() if isinstance(state, dict) else ""
        if state_name in ("canceled", "done", "completed", "backlog", "triage"):
            logger.info(f"Ignoring Linear issue {issue_id} in state '{state_name}'")
            return JsonResponse({"status": "ignored", "reason": f"state={state_name}"}, status=200)

        # Build and enqueue GAIA task
        task_text = build_gaia_task(issue_id, title, description, labels, url)
        priority = 2 if "urgent" in labels or "bug" in labels or "critical" in labels else 3
        task_id = enqueue_gaia_task(task_text, priority)

        logger.info(f"Enqueued GAIA task {task_id} for Linear issue {issue_id}")

        return JsonResponse({
            "status": "enqueued",
            "gaia_task_id": task_id,
            "linear_issue": issue_id,
            "priority": priority,
        }, status=200)

    def get(self, request):
        """Health check endpoint for webhook validation."""
        return JsonResponse({"status": "ok", "webhook": "linear-gaia-bridge"})
