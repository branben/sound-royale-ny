# PII Prevention in Beads

## Problem

When editing `.beads/issues.jsonl`, email addresses can accidentally be committed as `owner` fields:
- `"owner": "brandonbennett@Pursuits-Air.lan"` ❌
- Should be: `"owner": "sound_royale_ny/mayor"` ✅

## Root Cause

1. **Beads daemon auto-sync**: The `bd sync` command can overwrite local changes
2. **Pre-commit hook**: Runs `bd sync --flush-only` which may restore corrupted beads
3. **No validation**: No check prevents email addresses in beads

## Prevention Checklist

Before committing any changes:

- [ ] Avoid committing bead artifacts entirely (current policy: beads are local/private)
- [ ] Verify `.beads/` is not tracked: `git ls-files .beads` should return nothing
- [ ] Verify no email patterns: `@gmail.com`, `@users.noreply.github.com`, etc.
- [ ] Avoid absolute paths like `file:///Users/...`

## Quick Fix Commands

```bash
# Check for PII patterns in the repo
rg "@" . || true

# Check for absolute local file URLs
rg "file:///Users/" . || true
```

## Beads Config Best Practices

```yaml
# .beads/config.yaml
auto-start-daemon: false  # Prevents auto-sync during development
sync-branch: "beads-sync"   # Use dedicated sync branch
```

Note: `.beads/` is treated as legacy/local in this repo; prefer writing any bead outputs under `.gaia_private/`.

## Git Integration

If you have local tooling that tries to sync beads during commits, ensure it does not stage `.beads/` (current repo policy is to keep beads untracked).

## CI Guard

The GAIA integrity scanner (`backend/gaia/integrity_scanner.py`) with `--scan-beads` flag checks for:
- Email patterns in beads
- Secret exposures
- Path integrity violations
