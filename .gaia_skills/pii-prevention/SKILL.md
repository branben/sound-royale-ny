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

Before committing beads changes:

- [ ] Search for `@` in `.beads/issues.jsonl` - should return 0 matches
- [ ] Verify no email patterns: `brandonbennett@`, `@gmail.com`, etc.
- [ ] Use role-based IDs: `sound_royale_ny/mayor`, `sound_royale_ny/deacon`
- [ ] Disable daemon before commits: `bd config set auto-start-daemon false`
- [ ] Or temporarily rename `.git/hooks/pre-commit` to prevent auto-sync during commit

## Quick Fix Commands

```bash
# Check for PII
rg "brandonbennett@" .beads/issues.jsonl | wc -l  # Should be 0

# Fix PII
sed -i '' 's/brandonbennett@Pursuits-Air\.lan/sound_royale_ny\/mayor/g' .beads/issues.jsonl

# Force commit when daemon keeps restoring file
git update-index --index-info <<EOF
100644 \$(git hash-object -w .beads/issues.jsonl) 0\t.beads/issues.jsonl
EOF
```

## Beads Config Best Practices

```yaml
# .beads/config.yaml
auto-start-daemon: false  # Prevents auto-sync during development
sync-branch: "beads-sync"   # Use dedicated sync branch
```

## Git Integration

The beads pre-commit hook (`~/.git/hooks/pre-commit`) syncs beads before each commit. This can restore corrupted beads. To bypass:

```bash
# Temporarily disable
mv .git/hooks/pre-commit .git/hooks/pre-commit.bak

# Make your commit
git add .beads/issues.jsonl
git commit -m "Fix PII"

# Restore
mv .git/hooks/pre-commit.bak .git/hooks/pre-commit
```

## CI Guard

The GAIA integrity scanner (`backend/gaia/integrity_scanner.py`) with `--scan-beads` flag checks for:
- Email patterns in beads
- Secret exposures
- Path integrity violations
