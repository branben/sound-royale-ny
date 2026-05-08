#!/usr/bin/env python3
"""Repo-local GAIA Polecat runner.

This script is the canonical, versioned runner for Sound Royale's GAIA workflow.

Key guarantees:
- Stores all local state under `.gaia_private/gaia/` (never `.beads/`).
- Can inject curated `.gaia_skills/**/SKILL.md` docs into every prompt.
- Detects repo root dynamically (git) so it can be invoked from anywhere.

Providers:
- opencode: recommended (full MCP tools)
- ollama: local model (no MCP tools)
- codex: OpenAI Codex CLI
"""

from __future__ import annotations

import argparse
import json
import os
import re
import random
import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any


DEFAULT_OPENCODE_MODEL = "opencode/big-pickle"
DEFAULT_OLLAMA_MODEL = "deepseek-coder:6.7b"

DEFAULT_PRIVATE_DIR = Path(".gaia_private") / "gaia"
DEFAULT_QUEUE_FILE = DEFAULT_PRIVATE_DIR / "task_queue.jsonl"
DEFAULT_CHECKPOINT_DIR = DEFAULT_PRIVATE_DIR / "checkpoints"
DEFAULT_MEMORY_FILE = DEFAULT_PRIVATE_DIR / "memory.jsonl"
DEFAULT_LOCKS_DIR = DEFAULT_PRIVATE_DIR / "locks"
DEFAULT_PROGRESS_LOG = DEFAULT_PRIVATE_DIR / "progress.log"

SKILLS_DIR = Path(".gaia_skills")

# Keep this curated and short; the goal is stable behavior, not prompt bloat.
DEFAULT_SKILL_ALLOWLIST = [
    "systematic-debugging",
    "verification-before-completion",
    "pii-prevention",
    "pr-comment-monitor",
    "playwright",
    "pr-hardening",
    "e2e-test-hygiene",
    "polecat-operational-hygiene",
    "react",
    "test-driven-development",
    "websocket",
]


def _repo_root_from_git(cwd: Path) -> Path | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=cwd,
            text=True,
            capture_output=True,
            check=False,
        )
    except Exception:
        return None

    if result.returncode != 0:
        return None

    root = result.stdout.strip()
    return Path(root) if root else None


def get_repo_root() -> Path:
    cwd = Path.cwd()
    root = _repo_root_from_git(cwd)
    return root.resolve() if root else cwd.resolve()


def ensure_private_dirs(repo_root: Path) -> None:
    private_dir = repo_root / DEFAULT_PRIVATE_DIR
    private_dir.mkdir(parents=True, exist_ok=True)
    (repo_root / DEFAULT_CHECKPOINT_DIR).mkdir(parents=True, exist_ok=True)
    (repo_root / DEFAULT_LOCKS_DIR).mkdir(parents=True, exist_ok=True)


def warn_if_legacy_beads_exist(repo_root: Path) -> None:
    legacy = repo_root / ".beads"
    if legacy.exists():
        print(
            "⚠ Detected legacy .beads/ directory. This runner does not read/write .beads. "
            "State is stored under .gaia_private/gaia/.",
            file=sys.stderr,
        )


def check_lmstudio_health(base_url: str) -> dict[str, Any]:
    """Verify LM Studio / OpenAI-compatible endpoint returns valid JSON.

    Returns {"ok": True, "models": [...]} on success.
    Returns {"ok": False, "error": str, "hint": str} on failure.
    """
    url = base_url.rstrip("/") + "/models"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = data.get("data", [])
            if not models:
                return {"ok": False, "error": "Endpoint returned empty model list", "hint": "LM Studio may be running but no model is loaded."}
            return {"ok": True, "models": [m.get("id") for m in models]}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")[:200]
        return {"ok": False, "error": f"HTTP {e.code}: {body}", "hint": "Endpoint is reachable but returned an error (ngrok tunnel may be dead or URL changed)."}
    except urllib.error.URLError as e:
        return {"ok": False, "error": str(e.reason), "hint": "Cannot reach endpoint. Check: 1) LM Studio is running, 2) ngrok tunnel is active, 3) URL is correct."}
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"Invalid JSON response: {e}", "hint": "Endpoint returned HTML instead of JSON. ngrok tunnel is likely dead."}
    except Exception as e:
        return {"ok": False, "error": str(e), "hint": "Unexpected error during health check."}


def purge_stale_failed_tasks(repo_root: Path, dry_run: bool = False) -> int:
    """Remove or archive tasks with status 'failed' that lack a valid source marker.

    Returns number of purged tasks.
    """
    queue = load_queue(repo_root)
    kept: list[dict[str, Any]] = []
    purged_count = 0

    for item in queue:
        status = item.get("status", "pending")
        attempts = item.get("attempts", 0)
        # Heuristic: failed with >2 attempts and no explicit source = likely stale
        is_stale = (
            status == "failed"
            and attempts >= 2
            and item.get("source") is None  # legacy .beads/ tasks have no source
        )
        if is_stale:
            purged_count += 1
            if not dry_run:
                # Archive to .gaia_private/gaia/archived_tasks.jsonl
                archive_path = repo_root / DEFAULT_PRIVATE_DIR / "archived_tasks.jsonl"
                archive_path.parent.mkdir(parents=True, exist_ok=True)
                with archive_path.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(item, ensure_ascii=False) + "\n")
        else:
            kept.append(item)

    if purged_count > 0 and not dry_run:
        save_queue(repo_root, kept)
        print(
            f"🗑️  Purged {purged_count} stale failed task(s). Archived to .gaia_private/gaia/archived_tasks.jsonl",
            file=sys.stderr,
        )
    elif purged_count > 0 and dry_run:
        print(
            f"⚠️  {purged_count} stale failed task(s) detected (dry-run, not purged).",
            file=sys.stderr,
        )

    return purged_count


def log_progress(repo_root: Path, task_id: str | None, status: str, attempt: int, error: str | None = None) -> None:
    """Append a timestamped progress entry to progress.log."""
    log_path = repo_root / DEFAULT_PROGRESS_LOG
    entry = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "task_id": task_id,
        "status": status,
        "attempt": attempt,
        "error": error,
    }
    try:
        with log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass  # Progress logging is best-effort


def log_queue_summary(repo_root: Path) -> None:
    """Log a summary of queue state to progress.log."""
    queue = load_queue(repo_root)
    pending = [t for t in queue if t.get("status") == "pending"]
    failed = [t for t in queue if t.get("status") == "failed"]
    running = [t for t in queue if t.get("status") == "running"]
    log_progress(repo_root, None, "queue_summary", 0, f"total={len(queue)} pending={len(pending)} failed={len(failed)} running={len(running)}")


def load_queue(repo_root: Path) -> list[dict[str, Any]]:
    queue_path = repo_root / DEFAULT_QUEUE_FILE
    if not queue_path.exists():
        return []

    items: list[dict[str, Any]] = []
    for line in queue_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            items.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return items


def save_queue(repo_root: Path, queue: list[dict[str, Any]]) -> None:
    queue_path = repo_root / DEFAULT_QUEUE_FILE
    queue_path.parent.mkdir(parents=True, exist_ok=True)

    with queue_path.open("w", encoding="utf-8") as f:
        for item in queue:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")


def add_to_queue(repo_root: Path, task: str, priority: int = 5) -> str:
    task_id = f"task-{int(time.time())}"
    queue_item = {
        "id": task_id,
        "task": task,
        "priority": priority,
        "status": "pending",
        "attempts": 0,
        "next_run_at": None,
        "last_error": None,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    queue = load_queue(repo_root)
    queue.append(queue_item)
    save_queue(repo_root, queue)

    return task_id


def get_next_task(repo_root: Path) -> dict[str, Any] | None:
    queue = load_queue(repo_root)
    now = time.time()

    pending: list[dict[str, Any]] = []
    for t in queue:
        if t.get("status") != "pending":
            continue

        nra = t.get("next_run_at")
        if nra is None:
            pending.append(t)
            continue

        try:
            if float(nra) <= now:
                pending.append(t)
        except (TypeError, ValueError):
            pending.append(t)

    if not pending:
        return None

    pending.sort(key=lambda x: (x.get("priority", 5), x.get("created_at", "")))
    return pending[0]


def update_task_status(repo_root: Path, task_id: str, status: str) -> None:
    queue = load_queue(repo_root)
    for item in queue:
        if item.get("id") == task_id:
            item["status"] = status
            item["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    save_queue(repo_root, queue)


def update_task_fields(repo_root: Path, task_id: str, fields: dict[str, Any]) -> None:
    queue = load_queue(repo_root)
    for item in queue:
        if item.get("id") == task_id:
            for k, v in fields.items():
                item[k] = v
            item["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    save_queue(repo_root, queue)


def save_checkpoint(repo_root: Path, task_id: str, subtask_index: int, output: str) -> None:
    import time

    checkpoint_dir = repo_root / DEFAULT_CHECKPOINT_DIR
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    checkpoint = {
        "task_id": task_id,
        "subtask_index": subtask_index,
        "output": output,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    checkpoint_file = checkpoint_dir / f"{task_id}.json"
    with checkpoint_file.open("w", encoding="utf-8") as f:
        json.dump(checkpoint, f, indent=2)


def load_checkpoint(repo_root: Path, task_id: str) -> dict[str, Any] | None:
    checkpoint_file = repo_root / DEFAULT_CHECKPOINT_DIR / f"{task_id}.json"
    if not checkpoint_file.exists():
        return None

    with checkpoint_file.open("r", encoding="utf-8") as f:
        return json.load(f)


def clear_checkpoint(repo_root: Path, task_id: str) -> None:
    checkpoint_file = repo_root / DEFAULT_CHECKPOINT_DIR / f"{task_id}.json"
    if checkpoint_file.exists():
        checkpoint_file.unlink()


def load_skill_text(repo_root: Path, allowlist: list[str]) -> str:
    skills_root = repo_root / SKILLS_DIR
    if not skills_root.exists():
        return ""

    blocks: list[str] = []

    for skill in allowlist:
        skill_path = skills_root / skill / "SKILL.md"
        if not skill_path.exists():
            continue

        content = skill_path.read_text(encoding="utf-8", errors="ignore").strip()
        if not content:
            continue

        blocks.append(f"# Skill: {skill}\n\n{content}\n")

    if not blocks:
        return ""

    return "\n\n".join(blocks)


def acquire_task_lock(repo_root: Path, task_id: str) -> Path | None:
    locks_dir = repo_root / DEFAULT_LOCKS_DIR
    locks_dir.mkdir(parents=True, exist_ok=True)
    lock_path = locks_dir / f"{task_id}.lock"

    try:
        fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(f"pid={os.getpid()}\n")
            f.write(f"created_at={time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    except FileExistsError:
        return None

    return lock_path


def release_task_lock(lock_path: Path | None) -> None:
    if not lock_path:
        return
    try:
        lock_path.unlink(missing_ok=True)
    except Exception:
        return


SUPERPOWERS_PROMPT = """
## MANDATORY GAIA WORKFLOWS

You MUST follow these workflows for EVERY task:

### 1. Systematic Debugging (for bug fixes)
Before fixing ANY bug:
- NO "quick fixes" - find root cause first
- Investigate: Read error messages, reproduce consistently, check recent changes
- Trace data flow to find where bad values originate
- If 3+ fix attempts fail: STOP and escalate to human

### 2. Verification Before Completion (ALWAYS)
- NEVER claim "done" without FRESH verification evidence
- Before claiming success, run:
  - Type check: `npx tsc --noEmit`
  - Build: `npm run build`
- Show actual command OUTPUT in your response
"""


def extract_keywords(task: str) -> list[str]:
    stop_words = {
        "the",
        "a",
        "an",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "shall",
        "to",
        "of",
        "in",
        "for",
        "on",
        "with",
        "at",
        "by",
        "from",
        "as",
        "into",
        "through",
        "during",
        "before",
        "after",
        "above",
        "below",
        "between",
        "under",
        "again",
        "further",
        "then",
        "once",
        "here",
        "there",
        "when",
        "where",
        "why",
        "how",
        "all",
        "each",
        "few",
        "more",
        "most",
        "other",
        "some",
        "such",
        "no",
        "nor",
        "not",
        "only",
        "own",
        "same",
        "so",
        "than",
        "too",
        "very",
        "just",
        "and",
        "but",
        "if",
        "or",
        "because",
        "until",
        "while",
        "this",
        "that",
        "these",
        "those",
        "it",
        "its",
        "fix",
        "add",
        "update",
        "remove",
        "create",
    }

    words = re.findall(r"\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b", task.lower())
    return [w for w in words if w not in stop_words]


def load_memory_artifacts(repo_root: Path) -> list[dict[str, Any]]:
    memory_path = repo_root / DEFAULT_MEMORY_FILE
    if not memory_path.exists():
        return []

    beads: list[dict[str, Any]] = []
    for line in memory_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            beads.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    return beads


def find_relevant_memory(task: str, beads: list[dict[str, Any]], max_items: int = 5) -> list[dict[str, Any]]:
    keywords = extract_keywords(task)
    if not keywords:
        return []

    scored: list[tuple[int, dict[str, Any]]] = []
    for bead in beads:
        score = 0
        title = str(bead.get("title", "")).lower()
        description = str(bead.get("description", "")).lower()

        for kw in keywords:
            if kw in title:
                score += 10
            if kw in description:
                score += 1

        if score > 0:
            scored.append((score, bead))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [b for _, b in scored[:max_items]]


def format_symbolic_context(items: list[dict[str, Any]]) -> str:
    if not items:
        return ""

    lines: list[str] = ["## RELEVANT MEMORY (Symbolic)", ""]
    for item in items:
        lines.append(f"### {item.get('title', 'Untitled')}")
        desc = str(item.get("description", "")).strip()
        if desc:
            lines.append(desc[:600])

        symbols = item.get("symbols") or []
        if isinstance(symbols, list) and symbols:
            lines.append("**Symbol References:**")
            for sym in symbols[:10]:
                name = sym.get("name", "") if isinstance(sym, dict) else ""
                path = sym.get("path", "") if isinstance(sym, dict) else ""
                line = sym.get("line") if isinstance(sym, dict) else None
                if path and line:
                    lines.append(f"- {name}: {path}:{line}")
                elif path:
                    lines.append(f"- {name}: {path}")

        lines.append("")

    return "\n".join(lines)


def build_prompt(repo_root: Path, task: str, skill_allowlist: list[str]) -> str:
    skills_text = load_skill_text(repo_root, skill_allowlist)

    memory_items = find_relevant_memory(task, load_memory_artifacts(repo_root))
    memory_context = format_symbolic_context(memory_items)

    prompt_parts = [
        f"You are working in the sound-royale-ny project at {repo_root}.",
        "",
        f"Task: {task}",
        "",
        memory_context,
        "",
        SUPERPOWERS_PROMPT,
        "",
    ]

    if skills_text:
        prompt_parts.append("## PROJECT SKILLS (curated)\n")
        prompt_parts.append(skills_text)

    prompt_parts.append(
        "Use Serena MCP tools (find_symbol/read_file/replace_content/etc.) for navigation and edits when available."
    )
    prompt_parts.append("After completing the task, show VERIFICATION EVIDENCE (command output).")

    return "\n".join([p for p in prompt_parts if p is not None])


def _extract_first_json_object(text: str) -> str | None:
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue

        if ch == '"':
            in_str = True
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]

    return None


def compile_task_contract_lmstudio(
    task: str,
    skill_allowlist: list[str],
    base_url: str,
    model: str,
    max_tokens: int,
) -> dict[str, Any]:
    url = base_url.rstrip("/") + "/chat/completions"

    system = (
        "You are GAIA-Compiler. Output STRICT JSON only. "
        "No prose, no markdown, no trailing text. "
        "Keep strings short."
    )

    allowed = ", ".join(skill_allowlist)
    user = (
        "Return JSON with keys: goal, scope, skills_to_inject, stop_conditions, provider_recommendation. "
        f"skills_to_inject must be a subset of: [{allowed}]. "
        "provider_recommendation must be one of: local, opencode. "
        "skills_to_inject max length 3. stop_conditions max length 3.\n\n"
        f"Task: {task}"
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.1,
        "max_tokens": max_tokens,
    }

    cmd = [
        "curl",
        "-sS",
        url,
        "-H",
        "Content-Type: application/json",
        "-d",
        json.dumps(payload, ensure_ascii=False),
    ]

    result = subprocess.run(cmd, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"LM Studio curl failed: {result.returncode}")

    try:
        data = json.loads(result.stdout)
        content = data["choices"][0]["message"]["content"]
    except Exception as e:
        raise RuntimeError(f"LM Studio response parse failed: {e}")

    # Try strict parse first
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        extracted = _extract_first_json_object(content)
        if extracted:
            try:
                return json.loads(extracted)
            except json.JSONDecodeError:
                pass

    # Fallback: minimal safe contract
    return {
        "goal": task[:160],
        "scope": "",
        "skills_to_inject": skill_allowlist[:3],
        "stop_conditions": ["Provide verification evidence"],
        "provider_recommendation": "opencode",
    }


def build_executor_prompt(
    repo_root: Path,
    task: str,
    contract: dict[str, Any],
    skill_allowlist: list[str],
) -> str:
    requested_skills = contract.get("skills_to_inject")
    if not isinstance(requested_skills, list):
        requested_skills = []

    selected = [s for s in requested_skills if isinstance(s, str) and s in skill_allowlist]
    if not selected:
        selected = skill_allowlist[:3]

    skills_text = load_skill_text(repo_root, selected)
    contract_json = json.dumps(contract, indent=2, ensure_ascii=False)

    prompt_parts = [
        f"You are an executor agent working in the sound-royale-ny project at {repo_root}.",
        "You MUST follow the task contract exactly; do not broaden scope.",
        "",
        f"Original task: {task}",
        "",
        "## TASK CONTRACT (authoritative)",
        contract_json,
        "",
        SUPERPOWERS_PROMPT,
        "",
    ]

    if skills_text:
        prompt_parts.append("## PROJECT SKILLS (selected)\n")
        prompt_parts.append(skills_text)

    prompt_parts.append(
        "Use Serena MCP tools (find_symbol/read_file/replace_content/etc.) for navigation and edits when available."
    )
    prompt_parts.append("After completing the task, show VERIFICATION EVIDENCE (command output).")

    return "\n".join([p for p in prompt_parts if p is not None])


def run_opencode(repo_root: Path, prompt: str, model: str) -> int:
    cmd = ["opencode", "run", "--dir", str(repo_root), "--model", model, prompt]
    result = subprocess.run(cmd, cwd=repo_root, text=True)
    return result.returncode


def run_ollama(repo_root: Path, prompt: str, model: str) -> int:
    cmd = ["ollama", "run", model]
    result = subprocess.run(cmd, cwd=repo_root, text=True, input=prompt)
    return result.returncode


def run_codex(repo_root: Path, prompt: str) -> int:
    cmd = [
        "codex",
        "exec",
        "--dangerously-bypass-approvals-and-sandbox",
        prompt,
    ]
    result = subprocess.run(cmd, cwd=repo_root, text=True)
    return result.returncode


def _git_changed_paths(repo_root: Path) -> list[str]:
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return []

    paths: list[str] = []
    for line in result.stdout.splitlines():
        line = line.rstrip("\n")
        if not line:
            continue

        entry = line[3:].strip()
        if " -> " in entry:
            entry = entry.split(" -> ", 1)[1].strip()

        if entry:
            paths.append(entry)

    return paths


def _restore_paths(repo_root: Path, paths: list[str]) -> None:
    if not paths:
        return

    subprocess.run(
        ["git", "restore", "--"] + paths,
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )

    subprocess.run(
        ["git", "clean", "-fd", "--"] + paths,
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )


def detect_forbidden_changes(repo_root: Path, forbidden_prefixes: list[str]) -> list[str]:
    if not forbidden_prefixes:
        return []

    changed = _git_changed_paths(repo_root)
    forbidden: list[str] = []
    for p in changed:
        for pref in forbidden_prefixes:
            if p == pref or p.startswith(pref):
                forbidden.append(p)
                break

    return sorted(set(forbidden))


def main() -> None:
    parser = argparse.ArgumentParser(description="GAIA Polecat (repo-local runner)")
    parser.add_argument("task", nargs="?", help="Task description")
    parser.add_argument(
        "--provider",
        "-p",
        choices=["opencode", "ollama", "codex"],
        default="opencode",
        help="AI provider to use (default: opencode)",
    )
    parser.add_argument("--model", "-m", help="Model override (provider-specific)")
    parser.add_argument("--queue", "-q", action="store_true", help="Add task to queue")
    parser.add_argument("--priority", type=int, default=5, help="Queue priority (1=highest)")
    parser.add_argument("--list-queue", action="store_true", help="List queued tasks")
    parser.add_argument("--run-queue", action="store_true", help="Run queued tasks")
    parser.add_argument(
        "--health-check",
        action="store_true",
        help="Verify LM Studio / OpenAI endpoint health before run-queue (default: enabled when compiler-provider=lmstudio)",
    )
    parser.add_argument(
        "--skills",
        default=",".join(DEFAULT_SKILL_ALLOWLIST),
        help="Comma-separated skill names to inject (default: curated allowlist)",
    )

    parser.add_argument(
        "--compiler-provider",
        choices=["none", "lmstudio"],
        default=os.environ.get("GAIA_COMPILER_PROVIDER", "lmstudio"),
        help="Local compiler stage to produce a minimal task contract (default: lmstudio)",
    )
    parser.add_argument(
        "--compiler-model",
        default=os.environ.get("GAIA_COMPILER_MODEL", "qwen3.5-0.8b"),
        help="Compiler model id (default: qwen3.5-0.8b)",
    )
    parser.add_argument(
        "--lmstudio-base-url",
        default=os.environ.get("LMSTUDIO_BASE_URL", "http://localhost:1234/v1"),
        help="LM Studio OpenAI-compatible base URL (default: http://localhost:1234/v1)",
    )
    parser.add_argument(
        "--compiler-max-tokens",
        type=int,
        default=220,
        help="Max tokens for compiler output (default: 220)",
    )
    parser.add_argument(
        "--compile-only",
        action="store_true",
        help="Only compile and print the task contract (no provider execution)",
    )

    parser.add_argument(
        "--max-attempts",
        type=int,
        default=3,
        help="Max attempts per queued task before marking failed (default: 3)",
    )
    parser.add_argument(
        "--backoff-base-seconds",
        type=int,
        default=30,
        help="Base seconds for exponential backoff on failure (default: 30)",
    )

    parser.add_argument(
        "--forbid-paths",
        default=os.environ.get(
            "GAIA_FORBID_PATHS",
            "dist/,.ai-tools/.serena/,test-results/,playwright-report/,scripts/gaia-polecat.py",
        ),
        help=(
            "Comma-separated path prefixes that must not be modified by runs "
            "(default: dist/,.ai-tools/.serena/,test-results/,playwright-report/,scripts/gaia-polecat.py)"
        ),
    )
    parser.add_argument(
        "--allow-forbidden-diff",
        action="store_true",
        default=False,
        help="Do not fail the run if forbidden paths changed (they will still be reverted)",
    )

    args = parser.parse_args()

    repo_root = get_repo_root()
    ensure_private_dirs(repo_root)
    warn_if_legacy_beads_exist(repo_root)

    # Auto-purge stale failed tasks (legacy .beads/ migration leftovers)
    purge_stale_failed_tasks(repo_root, dry_run=False)

    skill_allowlist = [s.strip() for s in str(args.skills).split(",") if s.strip()]
    forbidden_prefixes = [p.strip() for p in str(args.forbid_paths).split(",") if p.strip()]

    if args.list_queue:
        queue = load_queue(repo_root)
        if not queue:
            print("Queue is empty")
            return

        print(f"Queue ({len(queue)} tasks):")
        for item in queue:
            status = item.get("status", "pending")
            priority = item.get("priority", 5)
            task = str(item.get("task", ""))[:80]
            print(f"  [{priority}] {status}: {task}...")
        return

    if args.run_queue:
        # Health check before starting queue processing
        if args.health_check or args.compiler_provider == "lmstudio":
            health = check_lmstudio_health(str(args.lmstudio_base_url))
            if not health.get("ok"):
                print(f"❌ Health check failed: {health.get('error')}", file=sys.stderr)
                print(f"💡 Hint: {health.get('hint')}", file=sys.stderr)
                print("Aborting --run-queue. Fix infrastructure and retry.", file=sys.stderr)
                raise SystemExit(1)
            print(f"✅ Health check passed: {len(health.get('models', []))} model(s) available", file=sys.stderr)

        # Initialize progress logging
        log_queue_summary(repo_root)
        last_progress_log = time.time()
        PROGRESS_LOG_INTERVAL = 300  # 5 minutes

        while True:
            next_task = get_next_task(repo_root)
            if not next_task:
                queue = load_queue(repo_root)
                pending = [t for t in queue if t.get("status") == "pending"]
                if not pending:
                    print("Queue empty")
                    log_queue_summary(repo_root)
                    return

                # Periodic progress logging while waiting
                if time.time() - last_progress_log >= PROGRESS_LOG_INTERVAL:
                    log_queue_summary(repo_root)
                    last_progress_log = time.time()

                # Pending tasks exist but are not yet due.
                time.sleep(5)
                continue

            task_id = str(next_task["id"])
            task = str(next_task["task"])

            lock_path = acquire_task_lock(repo_root, task_id)
            if not lock_path:
                # Another worker is already processing this task.
                time.sleep(1)
                continue

            try:
                update_task_status(repo_root, task_id, "running")
                log_progress(repo_root, task_id, "running", int(next_task.get("attempts") or 0) + 1)

                contract: dict[str, Any] | None = None
                if args.compiler_provider == "lmstudio":
                    contract = compile_task_contract_lmstudio(
                        task=task,
                        skill_allowlist=skill_allowlist,
                        base_url=str(args.lmstudio_base_url),
                        model=str(args.compiler_model),
                        max_tokens=int(args.compiler_max_tokens),
                    )

                prompt = (
                    build_executor_prompt(repo_root, task, contract, skill_allowlist)
                    if contract is not None
                    else build_prompt(repo_root, task, skill_allowlist)
                )

                exit_code = 1
                if args.provider == "opencode":
                    exit_code = run_opencode(repo_root, prompt, args.model or DEFAULT_OPENCODE_MODEL)
                elif args.provider == "ollama":
                    exit_code = run_ollama(repo_root, prompt, args.model or DEFAULT_OLLAMA_MODEL)
                else:
                    exit_code = run_codex(repo_root, prompt)

                forbidden = detect_forbidden_changes(repo_root, forbidden_prefixes)
                if forbidden:
                    _restore_paths(repo_root, forbidden)
                    if not args.allow_forbidden_diff:
                        exit_code = 1
                        save_checkpoint(
                            repo_root,
                            task_id,
                            0,
                            "Forbidden paths changed and reverted: " + ", ".join(forbidden),
                        )

                if exit_code == 0:
                    update_task_status(repo_root, task_id, "completed")
                    update_task_fields(
                        repo_root,
                        task_id,
                        {"next_run_at": None, "last_error": None},
                    )
                    log_progress(repo_root, task_id, "completed", int(next_task.get("attempts") or 0) + 1)
                    clear_checkpoint(repo_root, task_id)
                    continue

                attempts = int(next_task.get("attempts") or 0) + 1
                if attempts >= int(args.max_attempts):
                    update_task_status(repo_root, task_id, "failed")
                    update_task_fields(
                        repo_root,
                        task_id,
                        {
                            "attempts": attempts,
                            "last_error": f"Exit: {exit_code}",
                            "next_run_at": None,
                        },
                    )
                    log_progress(repo_root, task_id, "failed", attempts, f"Exit: {exit_code}")
                    save_checkpoint(repo_root, task_id, 0, f"Exit: {exit_code}")
                    continue

                # Exponential backoff with jitter
                base = int(args.backoff_base_seconds)
                delay = base * (2 ** (attempts - 1))
                delay = int(delay + random.randint(0, max(3, int(delay * 0.2))))
                update_task_status(repo_root, task_id, "pending")
                update_task_fields(
                    repo_root,
                    task_id,
                    {
                        "attempts": attempts,
                        "last_error": f"Exit: {exit_code}",
                        "next_run_at": time.time() + delay,
                    },
                )
                log_progress(repo_root, task_id, "retry", attempts, f"Exit: {exit_code}; retry in {delay}s")
                save_checkpoint(repo_root, task_id, 0, f"Exit: {exit_code}; retry in {delay}s")

            finally:
                release_task_lock(lock_path)

    if not args.task:
        parser.print_help()
        raise SystemExit(2)

    if args.queue:
        task_id = add_to_queue(repo_root, args.task, args.priority)
        print(f"✅ Added to queue: {task_id}")
        return

    contract: dict[str, Any] | None = None
    if args.compiler_provider == "lmstudio":
        contract = compile_task_contract_lmstudio(
            task=str(args.task),
            skill_allowlist=skill_allowlist,
            base_url=str(args.lmstudio_base_url),
            model=str(args.compiler_model),
            max_tokens=int(args.compiler_max_tokens),
        )

    if args.compile_only:
        print(json.dumps(contract or {}, indent=2, ensure_ascii=False))
        return

    prompt = (
        build_executor_prompt(repo_root, str(args.task), contract, skill_allowlist)
        if contract is not None
        else build_prompt(repo_root, str(args.task), skill_allowlist)
    )

    if args.provider == "opencode":
        exit_code = run_opencode(repo_root, prompt, args.model or DEFAULT_OPENCODE_MODEL)
    elif args.provider == "ollama":
        exit_code = run_ollama(repo_root, prompt, args.model or DEFAULT_OLLAMA_MODEL)
    else:
        exit_code = run_codex(repo_root, prompt)

    forbidden = detect_forbidden_changes(repo_root, forbidden_prefixes)
    if forbidden:
        _restore_paths(repo_root, forbidden)
        if not args.allow_forbidden_diff:
            exit_code = 1
            print("Forbidden paths changed and reverted: " + ", ".join(forbidden), file=sys.stderr)

    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
