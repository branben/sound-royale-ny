import os
from pathlib import Path
import tempfile
import pytest

from gaia.guards_adapter import evaluate_path_request, Decision


@pytest.fixture()
def tmp_repo(tmp_path: Path):
    # Create a fake repo root with a .beadsignore
    (tmp_path / "docs").mkdir(parents=True, exist_ok=True)
    (tmp_path / "src" / "context").mkdir(parents=True, exist_ok=True)
    (tmp_path / "docs" / "README.md").write_text("ok", encoding="utf-8")
    (tmp_path / "src" / "context" / "GameContext.tsx").write_text("ok", encoding="utf-8")
    (tmp_path / ".beadsignore").write_text("# ignore list\nignored.txt\nignored_dir/**\n", encoding="utf-8")
    (tmp_path / "ignored.txt").write_text("ignored", encoding="utf-8")
    (tmp_path / "ignored_dir").mkdir(exist_ok=True)
    (tmp_path / "ignored_dir" / "file.txt").write_text("ignored", encoding="utf-8")
    return tmp_path


def test_in_root_allowed(tmp_repo: Path):
    d: Decision = evaluate_path_request(tmp_repo, "docs/README.md", beadsignore_path=tmp_repo / ".beadsignore")
    assert d.allowed is True
    assert d.reason == "ALLOW"
    assert str(d.redacted_path).startswith("<ROOT>/docs/")


def test_secret_patterns_denied(tmp_repo: Path):
    for p in [".env", "private.key", "id_rsa"]:
        (tmp_repo / p).write_text("secret", encoding="utf-8")
        d = evaluate_path_request(tmp_repo, p, beadsignore_path=tmp_repo / ".beadsignore")
        assert d.allowed is False
        assert d.reason == "DENY_SECRET_PATTERN"


def test_beadsignore_denied(tmp_repo: Path):
    d1 = evaluate_path_request(tmp_repo, "ignored.txt", beadsignore_path=tmp_repo / ".beadsignore")
    d2 = evaluate_path_request(tmp_repo, "ignored_dir/file.txt", beadsignore_path=tmp_repo / ".beadsignore")
    assert d1.allowed is False and d1.reason == "DENY_BEADSIGNORE"
    assert d2.allowed is False and d2.reason == "DENY_BEADSIGNORE"


def test_symlink_escape_denied(tmp_repo: Path):
    # Create a symlink under repo that points outside root
    outside = Path("/")  # root of filesystem; resolve should detect not within repo
    link = tmp_repo / "escape_link"
    try:
        # On some CI systems, creating symlinks may require privileges, handle gracefully
        link.symlink_to(outside)
    except Exception as e:
        pytest.skip(f"Symlink creation not supported in this environment: {e}")

    d = evaluate_path_request(tmp_repo, "escape_link/etc/passwd", beadsignore_path=tmp_repo / ".beadsignore")
    assert d.allowed is False
    assert d.reason == "DENY_OUTSIDE_ROOT"
