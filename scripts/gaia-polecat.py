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
import subprocess
import sys
from pathlib import Path
from typing import Any


DEFAULT_OPENCODE_MODEL = "opencode/big-pickle"
DEFAULT_OLLAMA_MODEL = "deepseek-coder:6.7b"

DEFAULT_PRIVATE_DIR = Path(".gaia_private") / "gaia"
DEFAULT_QUEUE_FILE = DEFAULT_PRIVATE_DIR / "task_queue.jsonl"
DEFAULT_CHECKPOINT_DIR = DEFAULT_PRIVATE_DIR / "checkpoints"
DEFAULT_MEMORY_FILE = DEFAULT_PRIVATE_DIR / "memory.jsonl"

SKILLS_DIR = Path(".gaia_skills")

# Keep this curated and short; the goal is stable behavior, not prompt bloat.
DEFAULT_SKILL_ALLOWLIST = [
    "systematic-debugging",
    "verification-before-completion",
    "pii-prevention",
    "pr-comment-monitor",
    "playwright",
    "pr-hardening",
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


def warn_if_legacy_beads_exist(repo_root: Path) -> None:
    legacy = repo_root / ".beads"
    if legacy.exists():
        print(
            "⚠ Detected legacy .beads/ directory. This runner does not read/write .beads. "
            "State is stored under .gaia_private/gaia/.",
            file=sys.stderr,
        )


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
    import time

    task_id = f"task-{int(time.time())}"
    queue_item = {
        "id": task_id,
        "task": task,
        "priority": priority,
        "status": "pending",
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    queue = load_queue(repo_root)
    queue.append(queue_item)
    save_queue(repo_root, queue)

    return task_id


def get_next_task(repo_root: Path) -> dict[str, Any] | None:
    queue = load_queue(repo_root)
    pending = [t for t in queue if t.get("status") == "pending"]
    if not pending:
        return None

    pending.sort(key=lambda x: x.get("priority", 5))
    return pending[0]


def update_task_status(repo_root: Path, task_id: str, status: str) -> None:
    queue = load_queue(repo_root)
    for item in queue:
        if item.get("id") == task_id:
            item["status"] = status
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
        "--skills",
        default=",".join(DEFAULT_SKILL_ALLOWLIST),
        help="Comma-separated skill names to inject (default: curated allowlist)",
    )

    args = parser.parse_args()

    repo_root = get_repo_root()
    ensure_private_dirs(repo_root)
    warn_if_legacy_beads_exist(repo_root)

    skill_allowlist = [s.strip() for s in str(args.skills).split(",") if s.strip()]

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
        while True:
            next_task = get_next_task(repo_root)
            if not next_task:
                print("Queue empty")
                return

            task_id = str(next_task["id"])
            task = str(next_task["task"])

            update_task_status(repo_root, task_id, "running")
            prompt = build_prompt(repo_root, task, skill_allowlist)

            exit_code = 1
            if args.provider == "opencode":
                exit_code = run_opencode(repo_root, prompt, args.model or DEFAULT_OPENCODE_MODEL)
            elif args.provider == "ollama":
                exit_code = run_ollama(repo_root, prompt, args.model or DEFAULT_OLLAMA_MODEL)
            else:
                exit_code = run_codex(repo_root, prompt)

            if exit_code == 0:
                update_task_status(repo_root, task_id, "completed")
                clear_checkpoint(repo_root, task_id)
            else:
                update_task_status(repo_root, task_id, "failed")
                save_checkpoint(repo_root, task_id, 0, f"Exit: {exit_code}")

    if not args.task:
        parser.print_help()
        raise SystemExit(2)

    if args.queue:
        task_id = add_to_queue(repo_root, args.task, args.priority)
        print(f"✅ Added to queue: {task_id}")
        return

    prompt = build_prompt(repo_root, args.task, skill_allowlist)

    if args.provider == "opencode":
        raise SystemExit(run_opencode(repo_root, prompt, args.model or DEFAULT_OPENCODE_MODEL))

    if args.provider == "ollama":
        raise SystemExit(run_ollama(repo_root, prompt, args.model or DEFAULT_OLLAMA_MODEL))

    raise SystemExit(run_codex(repo_root, prompt))


if __name__ == "__main__":
    main()
