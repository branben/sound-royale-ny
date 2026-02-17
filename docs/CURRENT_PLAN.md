# Sound Royale - Current Plan

**Last Updated:** 2026-02-17
**Status:** ✅ COMPLETED

---

## 🎯 Active Mission: Fix Qodo Feedback on PR #27 - ✅ FIXED

**Context:** PR #27 was created from a branch that predates the PII fix in PR #26. The migration script contains the OLD hardcoded email instead of the fixed version.

**Root Cause:** Branch divergence - PR #27's branch was created before PR #26 merged, so it has the OLD vulnerable code.

**Priority:** High (PII exposure)

---

## 🛠 What Was Done

Applied the following fixes to resolve ALL Qodo comments:

### Security Fixes (scripts/migrate_beads.py)
- ✅ Replaced hardcoded email `brandonbennett@Pursuits-Air.lan` with role-based ID `sound_royale_ny/mayor`
- ✅ Added error handling for JSON parsing (`try/except JSONDecodeError`)
- ✅ Added `sanitize_for_logging()` function to prevent PII in dry-run logs

### CI/CD Fixes (.github/workflows/gaia-guards-ci.yml)
- ✅ Replaced brittle `sleep` commands with `wait-on` for both backend and frontend
- ✅ Removed `|| true` from pytest command so CI fails on test failures

### React Fixes (src/components/game/GameInfo.tsx)
- ✅ Consolidated timer reset and interval logic in useEffect

### Python Fixes (backend/gaia/integrity_scanner.py)
- ✅ Fixed path merging logic using `.extend()` instead of assignment

---

## 📋 Verification Results

| Check | Command | Result |
|-------|---------|--------|
| PII removed | `rg "brandonbennett@" scripts/migrate_beads.py` | ✅ PASS |
| Role-based ID | `rg "sound_royale_ny/mayor" scripts/migrate_beads.py` | ✅ PASS |
| Error handling | `rg "JSONDecodeError" scripts/migrate_beads.py` | ✅ PASS |
| Log sanitization | `rg "sanitize_for_logging" scripts/migrate_beads.py` | ✅ PASS |
| CI wait-on | `rg "wait-on" .github/workflows/gaia-guards-ci.yml` | ✅ PASS |
| Remove \|\| true | `rg "pytest.*\|\| true" .github/workflows/gaia-guards-ci.yml` | ✅ PASS |
| Path extend | `rg "extend\(bead" backend/gaia/integrity_scanner.py` | ✅ PASS |

---

## 🔍 Root Cause Analysis (Updated)

The initial analysis was WRONG. Rebase didn't help because:
1. PR #26 added `migrate_beads.py` as a NEW file WITH the PII already hardcoded
2. The fix was never actually applied to main
3. The solution was to manually apply the fixes via stashed changes

**Prevention (from .gaia_skills/pr-hardening/SKILL.md):**
- [x] Always check code for PII before committing
- [x] Run Qodo locally: `npx qodo scan` before PR
- [x] Use role-based IDs: `sound_royale_ny/mayor` not emails

---

## 🛡 Prevention Checklist (from .gaia_skills/)

Refer to these skills to prevent regressions:

| Skill | When to Use |
|-------|--------------|
| **PII Prevention** `.gaia_skills/pii-prevention/` | Always use role-based IDs: `sound_royale_ny/mayor` |
| **PR Hardening** `.gaia_skills/pr-hardening/` | Before submitting ANY PR |
| **Verification** `.gaia_skills/verification-before-completion/` | Before marking tasks done |

---

## ✅ DONE (Previously Completed)

| Goal | Notes |
|------|-------|
| Security Fixes | playerSecret removed, test file deleted, host detection fixed |
| GAIA Polecat Setup | qodo-feedback-loop.sh working, beads persisting |
| Design System | design-system/sound-royale/MASTER.md generated |
| Mock Data Policy | VITE_E2E_TESTING gating enforced |
| Lobby UI Redesign | Design system applied |
| Room UI Redesign | Design system applied |
| Qodo PR Feedback | PR #5 fixes applied (.beadsignore, gaia-guards-ci.yml, guards_adapter.py) |
| PII Prevention | PR #26 added skill, fixed issues.jsonl, created migrate_beads.py |
| PR #26 CI Fixes | Django tests, Playwright E2E, --scan-beads flag |

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `git rebase origin/main` | Bring in latest changes from main |
| `git push --force-with-lease` | Safe force push after rebase |
| `npm run dev` | Start frontend |
| `python backend/manage.py runserver` | Start backend |
| `npm run test:e2e` | Run E2E tests |
| `../gaia-polecat "task"` | Run Codex task |

---

## Resources

- PR Hardening Skill: `.gaia_skills/pr-hardening/SKILL.md`
- PII Prevention Skill: `.gaia_skills/pii-prevention/SKILL.md`
- Design System: `design-system/sound-royale/MASTER.md`
- GameContext: `src/context/GameContext.tsx`
- API: `src/services/api.ts`
- Backend: `backend/game_engine/`
