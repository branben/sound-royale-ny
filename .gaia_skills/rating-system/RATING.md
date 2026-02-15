# GAIA Rating System for Gas Town Contribution

Inspired by [steveyegge/gastown](https://github.com/steveyegge/gastown)

## Overview

This rating system evaluates how well GAIA (our AI coding agent) contributes to the Gas Town ecosystem. It adapts Gas Town's "Polecat" rating criteria for our specific use case.

---

## Rating Categories

### 1. Code Quality (1-5)
- **1**: Broken code, won't compile/run
- **2**: Functional but messy, needs cleanup
- **3**: Decent code, follows conventions
- **4**: Clean, well-structured, production-ready
- **5**: Exemplary, could be used as reference

### 2. Task Completion (1-5)
- **1**: Didn't attempt or completely missed
- **2**: Partial attempt, major gaps
- **3**: Completed core functionality
- **4**: Fully completed with minor edge cases
- **5**: Exceeded expectations, added polish

### 3. Verification (1-5)
- **1**: No verification attempted
- **2**: Superficial, missed obvious issues
- **3**: Basic verification (compiles/runs)
- **4**: Thorough verification with tests
- **5**: Comprehensive verification + edge cases

### 4. Tool Usage (1-5)
- **1**: Ignored available tools
- **2**: Used tools poorly or incorrectly
- **3**: Basic tool usage
- **4**: Effective tool utilization
- **5**: Masterful tool orchestration

### 5. Collaboration (1-5)
- **1**: Worked in isolation, broke things
- **2**: Limited communication
- **3**: Adequate updates and context
- **4**: Proactive communication
- **5**: Excellent handoff, future-proof

---

## Score Calculation

```
Total Score = (Code Quality + Task Completion + Verification + Tool Usage + Collaboration) × 2

Max Score: 50
Min Score: 10
```

### Rating Tiers
| Score | Tier |
|-------|------|
| 40-50 | ⭐ **Gold Polecat** - Exceptional contributor |
| 30 | 🥈-39 **Silver Polecat** - Strong contributor |
| 20-29 | 🥉 **Bronze Polecat** - Developing contributor |
| 10-19 | 📉 **Iron Polecat** - Needs improvement |

---

## Evaluation Log

### Session: 2026-02-15

| Task | CQ | TC | V | TU | C | Total | Notes |
|------|----|----|---|----|---|-------|-------|
| Error 1: TypeScript return type | 5 | 5 | 5 | 5 | 4 | 48 | Fast fix, perfect execution |
| Error 2: State mutation | 5 | 5 | 5 | 5 | 5 | 50 | Gold! Also added type |
| Error 3: Missing error handler | 5 | 5 | 5 | 5 | 4 | 48 | Clean try/catch |
| Error 4: Secret exposure | 5 | 5 | 5 | 5 | 5 | 50 | Gold! Security fix |
| Error 5: Missing import | 5 | 5 | 5 | 5 | 4 | 48 | Simple removal |
| Error 6: Race condition | 5 | 5 | 5 | 5 | 5 | 50 | Gold! Ref solution |
| **TOTAL** | | | | | | **294** | **⭐ Gold Polecat** |

---

## Usage

After each GAIA task:
1. Rate each category (1-5)
2. Calculate total score
3. Determine tier
4. Log in table above
5. Track trends over time

## Example

| Task | CQ | TC | V | TU | C | Total | Notes |
|------|----|----|---|----|---|-------|-------|
| Add debug log to GameContext | 4 | 5 | 4 | 4 | 4 | 42 | Gold! Exceeded expectations |
