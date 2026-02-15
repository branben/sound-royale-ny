# summarizedNoiseFiles.md

Generated: 2026-02-14
Purpose: Identify repetitive or outdated .md files in sound-royale-ny

---

## 🚨 HIGH PRIORITY - REDUNDANT FILES

### Duplicate AGENTS.md (5 copies)
| Path | Status | Action |
|------|--------|--------|
| `AGENTS.md` (root) | ✅ Active | Keep |
| `backend/sound_royale_api/AGENTS.md` | ❌ Duplicate | DELETE |
| `backend/game_engine/AGENTS.md` | ❌ Duplicate | DELETE |
| `src/AGENTS.md` | ❌ Duplicate | DELETE |
| `llama.cpp/AGENTS.md` | ⚠️ External | Keep (llama.cpp submodule) |

### Duplicate CLAUDE.md (2 copies)
| Path | Status | Action |
|------|--------|--------|
| `CLAUDE.md` (root) | ✅ Active | Keep |
| `llama.cpp/CLAUDE.md` | ⚠️ External | Keep (llama.cpp submodule) |

### Backup Files
| Path | Status | Action |
|------|--------|--------|
| `docs/CURRENT_PLAN.md` | ✅ Active | Keep |
| `docs/CURRENT_PLAN_BACKUP.md` | ❌ Backup | DELETE |

---

## 📝 OUTDATED/DATED FILES

| Path | Issue | Recommendation |
|------|-------|----------------|
| `docs/sound-royale-dev-discussion-011226.md` | Dated filename (011226 = Dec 26) | Archive or delete |
| `docs/CHANGELOG.md` | Last updated 2026-01-07 (outdated) | Update or mark stale |

---

## 🔄 OVERLAPPING CONTENT

| Files | Overlap | Recommendation |
|-------|---------|----------------|
| `docs/phase_instructions.md` vs `docs/CURRENT_PLAN.md` | Both contain phase objectives | Consolidate to CURRENT_PLAN.md |
| `docs/SYSTEM_DESIGN_CHOICES.md` vs `docs/CURRENT_PLAN.md` | Both contain design decisions | Merge into CURRENT_PLAN.md |
| `docs/improvement_suggestions.md` | General suggestions | Review and merge or delete |

---

## ⚠️ NON-PROJECT FILES (External/Imported)

These are from llama.cpp submodule - do NOT modify:
- `llama.cpp/**/*.md` (~50 files)
- `backend/output/cpn/cpn.md`

---

## 🎯 RECOMMENDED ACTIONS

1. **Delete**: `backend/sound_royale_api/AGENTS.md`
2. **Delete**: `backend/game_engine/AGENTS.md`  
3. **Delete**: `src/AGENTS.md`
4. **Delete**: `docs/CURRENT_PLAN_BACKUP.md`
5. **Archive/Delete**: `docs/sound-royale-dev-discussion-011226.md`
6. **Consolidate**: Merge `phase_instructions.md`, `SYSTEM_DESIGN_CHOICES.md`, `improvement_suggestions.md` into `CURRENT_PLAN.md`

---

## 📊 STATS

- Total .md files found: ~100
- Project docs: ~15
- Duplicates to remove: 4
- Outdated: 2
- External (llama.cpp): ~50
