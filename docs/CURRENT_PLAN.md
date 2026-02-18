# Sound Royale - Current Plan

**Last Updated:** 2026-02-17
**Status:** 🔄 IN PROGRESS - Game Architecture Redesign

---

## 🎯 Active Mission: Implement Voting System & Fix Game Architecture

**Context:** Current implementation is a race-to-bingo where each player completes their own board. Need to change to head-to-head competition where both producers compete on the same tile and spectators vote.

---

## 📋 Game Flow (Target State)

| Step | Action |
|------|--------|
| 1 | Room created → Host (Producer 1) |
| 2 | 2nd player joins → Producer 2 |
| 3 | 3rd-10th player joins → Spectators |
| 4 | Round starts → Both producers see **same genre** |
| 5 | Timer runs → Producers create beats |
| 6 | Timer ends → **Spectators vote** (Ranked: 3+ spectators) |
| 7 | Winner determined → Most votes wins tile |
| 8 | Advance → Winner gets tile, next round |
| 9 | Repeat → Until bingo |

---

## 🏆 Ranked vs Casual

| Mode | Spectators | Voting | Winner |
|------|------------|--------|--------|
| **Ranked** | ≥3 | Enabled, majority wins | Tile goes to winner, ELO awarded |
| **Casual** | <3 | Disabled | Just completing tiles, no winner |

---

## 🚨 Critical Gaps Identified

| Priority | Gap | Impact | Status |
|----------|-----|--------|--------|
| **P0** | No voting system | Game unplayable as designed | ✅ FIXED |
| **P0** | Each player has own board | Should share same tile | ✅ FIXED |
| **P1** | Race condition in join_game | Could have 3+ producers | ✅ FIXED |
| **P1** | Client-side timer only | Can be manipulated | ✅ FIXED |
| **P2** | No ELO system | Ranked mode needs this | ✅ FIXED |
| **P2** | No spectator limit | Need max 10 | ✅ FIXED |

---

## 🛠 Implementation Plan

### Phase 1: Backend Models & API

- [x] **Add Vote model** - Track votes per tile per spectator
- [x] **Add Round/Turn model** - Track current tile, whose turn, timer state
- [x] **Add ELO fields to Player** - rating, wins, losses
- [x] **Add vote API endpoint** - POST /api/rooms/{id}/vote/
- [x] **Add next_turn API endpoint** - Advance to next tile after voting
- [x] **Add open_voting endpoint** - Open voting after timer ends
- [x] **Fix race condition** - Use transaction.atomic() in join_game
- [x] **Add spectator limit** - Reject 11th+ spectator

### Phase 2: WebSocket Messages

- [x] **Add player_joined** - Broadcast when new player enters
- [x] **Add player_left** - Broadcast when player disconnects
- [x] **Add vote_submitted** - Notify others when vote cast
- [x] **Add timer_tick** - Server-authoritative timer sync
- [x] **Add turn_change** - Notify when advancing to next tile

### Phase 3: Game Logic

- [x] **Implement voting** - Ranked: 3+ spectators, majority wins
- [x] **Implement turn advancement** - Winner gets tile marked
- [x] **Implement ELO calculation** - Winner gains ELO weighted by vote margin
- [x] **Implement shared tile** - Both producers see same genre via BattleTile component

### Phase 4: Frontend

- [x] **Add Voting UI** - Spectators see vote buttons after timer
- [x] **Add TurnIndicator** - Show current tile/genre (already existed)
- [x] **Add ELO display** - Show player ratings (in VotingPanel)
- [x] **Update Timer** - Sync with server timer (timer_tick handling implemented)

---

## 📊 ELO System Design

```
Winner ELO gain = base_gain * vote_margin_multiplier

base_gain = 25 (standard)
vote_margin_multiplier:
  - 3 spectators: 2-1 = 1.5x, 3-0 = 2x (2-1 can't tie)
  - 4 spectators: 3-1 = 1.5x, 4-0 = 2x, 2-2 = RE-VOTE until decisive
  - 5+ spectators: majority wins always (no ties possible)

Example:
  - 3 spectators, vote 2-1: 25 * 1.5 = 37.5 ELO
  - 5 spectators, vote 3-2: 25 * 1.0 = 25 ELO
  - 5 spectators, vote 4-1: 25 * 1.5 = 37.5 ELO
  - 5 spectators, vote 5-0: 25 * 2.0 = 50 ELO
```

---

## 🔧 Files Modified

| File | Changes |
|------|---------|
| `backend/game_engine/models.py` | Vote, Round models, ELO fields (already existed) |
| `backend/game_engine/views.py` | Added vote, next_turn, open_voting endpoints; Modified start_game to create initial round |
| `backend/game_engine/consumers.py` | WebSocket messages (already existed) |
| `backend/game_engine/serializers.py` | Added roundState and spectatorCount to GameStateSerializer |
| `src/types/game.ts` | Vote, RoundState types (already existed) |
| `src/services/api.ts` | Added openVoting API call |
| `src/components/game/VotingPanel.tsx` | NEW - Voting UI for spectators |
| `src/components/game/SpectatorView.tsx` | Added VotingPanel integration |

---

## ✅ Verification Checklist

- [x] Vote API accepts valid votes
- [x] Vote API rejects invalid votes (wrong tile, spectator already voted)
- [x] Ranked mode requires 3+ spectators
- [x] Casual mode disables voting (returns error)
- [x] ELO updates correctly on win
- [x] Race condition fixed (using transaction.atomic)
- [x] Spectator limit enforced (10 max)
- [x] Timer syncs across clients (server-authoritative timer with timer_tick broadcast)

---

## 📝 Game Rules (Decided)

| Rule | Decision |
|------|----------|
| **Tie in ranked** | Re-vote until no tie (fairest) |
| **Early completion** | Producers wait for timer to end |
| **Producer disconnect** | Wait for producer to return |
| **Spectator joins mid-round** | Can vote on current tile |

---

## 📝 Questions to Resolve

~~1. Tie in ranked (2-2 with 4 spectators): Re-vote? Random? Both advance?~~ ✅ Re-vote until no tie
~~2. Early completion: If producer finishes early, do they wait or can spectators vote early?~~ ✅ Wait for timer
~~3. Producer disconnect during round: Forfeit? Pause timer? Wait?~~ ✅ Wait
~~4. Spectator joins mid-round: Can they vote on current tile or only next?~~ ✅ Can vote on current

---

## 🔗 Resources

- WebSocket Skill: `.gaia_skills/websocket/SKILL.md`
- Django Skill: `.gaia_skills/django/SKILL.md`
- Playwright Skill: `.gaia_skills/playwright/SKILL.md`
- GameEngine: `backend/game_engine/`
- GameContext: `src/context/GameContext.tsx`
