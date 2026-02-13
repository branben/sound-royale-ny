from __future__ import annotations

import fnmatch
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional, Tuple


@dataclass(frozen=True)
class Decision:
    allowed: bool
    reason: str
    redacted_path: str


SECRET_GLOBS = [
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.crt",
    "*.cer",
    "*.p12",
    "*.pfx",
    "*.asc",
    "id_*",
    "id_rsa",
    "id_dsa",
    ".ssh",
    ".ssh/*",
    ".aws",
    ".aws/*",
    ".gaia_private",
    ".gaia_private/*",
]


def get_beads_db_path(repo_root: Path | str, private: bool = False) -> Path:
    """
    Get the path to the Beads SQLite database for the specified namespace.
    """
    root = Path(repo_root).resolve()
    if private:
        return root / ".gaia_private" / "beads.db"
    return root / ".beads" / "beads.db"


def _read_beadsignore(beadsignore_path: Optional[Path]) -> Iterable[str]:
    patterns: list[str] = []
    if not beadsignore_path:
        return patterns
    try:
        if beadsignore_path.is_file():
            for line in beadsignore_path.read_text(
                encoding="utf-8", errors="ignore"
            ).splitlines():
                s = line.strip()
                if not s or s.startswith("#"):
                    continue
                patterns.append(s)
    except Exception:
        # Fail-closed strategy is handled by caller via explicit checks; absence of patterns just means fewer denials here
        return patterns
    return patterns


def _matches_any_glob(path: Path, patterns: Iterable[str], root: Path) -> bool:
    # Try to match both as absolute, relative-to-root, and name-only
    abs_str = str(path)
    try:
        rel_str = str(path.relative_to(root))
    except Exception:
        rel_str = abs_str
    name = path.name
    for pat in patterns:
        if (
            fnmatch.fnmatch(abs_str, pat)
            or fnmatch.fnmatch(rel_str, pat)
            or fnmatch.fnmatch(name, pat)
        ):
            return True
    return False


def _is_within(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except Exception:
        return False


def _redact(path: Path, root: Path) -> str:
    pstr = str(path)
    rstr = str(root)
    if pstr.startswith(rstr):
        try:
            return str(Path("<ROOT>") / path.relative_to(root))
        except Exception:
            return "<ROOT>"
    # redact HOME if present
    home = os.path.expanduser("~")
    if home and pstr.startswith(home):
        return pstr.replace(home, "<HOME>")
    # generic fallback
    return "<PATH>"


def evaluate_path_request(
    repo_root: Path | str,
    target_path: Path | str,
    op: str = "read",
    beadsignore_path: Optional[Path] = None,
) -> Decision:
    """
    Evaluate whether a path operation should be allowed under GAIA guard policy.

    - Enforces: path integrity (no root escape), secret exclusion, .beadsignore patterns
    - Normalizes symlinks via resolve(strict=False)

    Returns Decision with safe redacted_path and non-secret reason.
    """
    root = Path(repo_root).resolve()
    raw_target = Path(target_path)
    # Always anchor to repo root for relative inputs to avoid partial traversal before checks
    candidate = raw_target if raw_target.is_absolute() else (root / raw_target)
    # Normalize and resolve symlinks without requiring existence
    target_resolved = candidate.resolve()

    # On Windows, ensure same drive/anchor to prevent cross-volume escapes
    if (
        hasattr(target_resolved, "drive")
        and hasattr(root, "drive")
        and target_resolved.drive
        and root.drive
        and target_resolved.drive.lower() != root.drive.lower()
    ):
        return Decision(
            allowed=False,
            reason="DENY_OUTSIDE_ROOT",
            redacted_path=_redact(target_resolved, root),
        )

    # Deny if target resolves outside root
    if not _is_within(target_resolved, root):
        return Decision(
            allowed=False,
            reason="DENY_OUTSIDE_ROOT",
            redacted_path=_redact(target_resolved, root),
        )

    # Load .beadsignore patterns (best-effort)
    patterns = list(_read_beadsignore(beadsignore_path))

    # Secret globs are always denied
    if _matches_any_glob(target_resolved, SECRET_GLOBS, root):
        return Decision(
            allowed=False,
            reason="DENY_SECRET_PATTERN",
            redacted_path=_redact(target_resolved, root),
        )

    # .beadsignore denies
    if patterns and _matches_any_glob(target_resolved, patterns, root):
        return Decision(
            allowed=False,
            reason="DENY_BEADSIGNORE",
            redacted_path=_redact(target_resolved, root),
        )

    # Allow safe, in-root paths by default
    return Decision(
        allowed=True,
        reason="ALLOW",
        redacted_path=_redact(target_resolved, root),
    )
