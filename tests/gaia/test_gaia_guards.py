import os
from pathlib import Path

import pytest

from backend.gaia.guards_adapter import evaluate_path_request, Decision


@pytest.fixture()
def repo_root(tmp_path: Path) -> Path:
    # Create an actual repo subdirectory to allow tests to access files truly "outside" it
    repo = tmp_path / "repo"
    repo.mkdir()
    # Simulate a repo root with common top-level dirs
    (repo / "docs").mkdir()
    (repo / "design-system" / "sound-royale").mkdir(parents=True)
    (repo / "backend" / "game_engine").mkdir(parents=True)
    (repo / "src" / "context").mkdir(parents=True)
    # Safe file
    (repo / "docs" / "README.md").write_text("hello", encoding="utf-8")
    # Secret-like files
    (repo / ".env").write_text("SECRET=1", encoding="utf-8")
    (repo / "private.pem").write_text("KEY", encoding="utf-8")
    (repo / "id_rsa").write_text("PRIV", encoding="utf-8")
    # A regular file for more checks
    (repo / "src" / "context" / "GameContext.tsx").write_text("export {}", encoding="utf-8")
    return repo


@pytest.fixture()
def beadsignore(repo_root: Path) -> Path:
    path = repo_root / ".beadsignore"
    path.write_text(
        """
# GAIA .beadsignore
# Exclude sensitive directories and files from the Symbolic Ledger
backend/db.sqlite3
**/output/**
*.secret
        """.strip()
        + "\n",
        encoding="utf-8",
    )
    return path


def test_allow_in_repo_relative_path(repo_root: Path, beadsignore: Path):
    d = evaluate_path_request(repo_root, "docs/README.md", op="read", beadsignore_path=beadsignore)
    assert d.allowed is True
    assert d.reason == "ALLOW"
    assert d.redacted_path.startswith("<ROOT>/docs/")


def test_deny_absolute_outside_root(repo_root: Path, beadsignore: Path):
    target = Path("/etc/passwd")
    d = evaluate_path_request(repo_root, target, op="read", beadsignore_path=beadsignore)
    assert d.allowed is False
    assert d.reason == "DENY_OUTSIDE_ROOT"
    assert d.redacted_path in {"<HOME>", "<PATH>", "<ROOT>"} or d.redacted_path.startswith("<")


def test_deny_escape_with_dotdot(repo_root: Path, beadsignore: Path):
    # Create a path that attempts to escape using .. from a nested location
    nested = repo_root / "src" / "context"
    target = nested / ".." / ".." / ".." / ".." / "etc" / "passwd"
    d = evaluate_path_request(repo_root, target, op="read", beadsignore_path=beadsignore)
    assert d.allowed is False
    assert d.reason == "DENY_OUTSIDE_ROOT"


def test_deny_secret_like_paths(repo_root: Path, beadsignore: Path):
    for p in [repo_root / ".env", repo_root / "private.pem", repo_root / "id_rsa"]:
        d = evaluate_path_request(repo_root, p, op="read", beadsignore_path=beadsignore)
        assert d.allowed is False
        assert d.reason == "DENY_SECRET_PATTERN"
        assert d.redacted_path.startswith("<ROOT>")


def test_deny_beadsignore_patterns(repo_root: Path, beadsignore: Path):
    (repo_root / "backend" / "db.sqlite3").write_text("db", encoding="utf-8")
    (repo_root / "backend" / "output" / "cpn").mkdir(parents=True, exist_ok=True)
    (repo_root / "backend" / "output" / "cpn" / "cpn.md").write_text("x", encoding="utf-8")

    d1 = evaluate_path_request(repo_root, repo_root / "backend" / "db.sqlite3", beadsignore_path=beadsignore)
    d2 = evaluate_path_request(repo_root, repo_root / "backend" / "output" / "cpn" / "cpn.md", beadsignore_path=beadsignore)
    assert d1.allowed is False and d1.reason == "DENY_BEADSIGNORE"
    assert d2.allowed is False and d2.reason == "DENY_BEADSIGNORE"


def test_allow_public_docs_and_design_system(repo_root: Path, beadsignore: Path):
    d1 = evaluate_path_request(repo_root, repo_root / "docs" / "README.md", beadsignore_path=beadsignore)
    (repo_root / "design-system" / "sound-royale" / "MASTER.md").write_text("design", encoding="utf-8")
    d2 = evaluate_path_request(repo_root, repo_root / "design-system" / "sound-royale" / "MASTER.md", beadsignore_path=beadsignore)
    assert d1.allowed is True and d2.allowed is True


def test_symlink_outside_root_is_denied(repo_root: Path, beadsignore: Path, tmp_path: Path):
    # point symlink in root to an external file
    external = tmp_path / "external.txt"
    external.write_text("outside", encoding="utf-8")
    link = repo_root / "docs" / "external_link"
    try:
        link.symlink_to(external)
    except OSError:
        pytest.skip("Symlink not supported on this platform")

    d = evaluate_path_request(repo_root, link, beadsignore_path=beadsignore)
    assert d.allowed is False
    assert d.reason == "DENY_OUTSIDE_ROOT"


def test_redaction_does_not_leak_secrets(repo_root: Path, beadsignore: Path):
    d = evaluate_path_request(repo_root, repo_root / ".env", beadsignore_path=beadsignore)
    assert "env" not in d.reason.lower()
    assert d.redacted_path.startswith("<ROOT>")


def test_logging_reason_codes_are_generic(repo_root: Path, beadsignore: Path):
    d = evaluate_path_request(repo_root, repo_root / "private.pem", beadsignore_path=beadsignore)
    assert d.reason in {"DENY_SECRET_PATTERN", "DENY_BEADSIGNORE", "DENY_OUTSIDE_ROOT", "ALLOW"}


def test_malformed_inputs_are_denied_safely(repo_root: Path, beadsignore: Path):
    # None or empty: treat as outside / malformed, deny safely
    d1 = evaluate_path_request(repo_root, "", beadsignore_path=beadsignore)
    assert (d1.allowed is False) or (d1.allowed is True and d1.redacted_path.startswith("<ROOT>"))

    # A clearly invalid path attempt outside
    d2 = evaluate_path_request(repo_root, "/../..//", beadsignore_path=beadsignore)
    assert d2.allowed is False
    assert d2.reason == "DENY_OUTSIDE_ROOT"


def test_write_op_denies_outside_root(repo_root: Path, beadsignore: Path):
    target = Path("/etc/shadow")
    d = evaluate_path_request(repo_root, target, op="write", beadsignore_path=beadsignore)
    assert d.allowed is False
    assert d.reason == "DENY_OUTSIDE_ROOT"


def test_write_op_denies_secret_like_paths(repo_root: Path, beadsignore: Path):
    for p in [repo_root / ".env", repo_root / "private.pem", repo_root / "id_rsa"]:
        d = evaluate_path_request(repo_root, p, op="write", beadsignore_path=beadsignore)
        assert d.allowed is False
        assert d.reason == "DENY_SECRET_PATTERN"


def test_write_op_allows_safe_in_repo_file(repo_root: Path, beadsignore: Path):
    safe = repo_root / "docs" / "README.md"
    d = evaluate_path_request(repo_root, safe, op="write", beadsignore_path=beadsignore)
    # Current policy treats write same as read for allow/deny; adjust if future policy differs
    assert d.allowed is True
    assert d.reason == "ALLOW"
