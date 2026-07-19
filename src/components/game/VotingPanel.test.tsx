import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VotingPanel } from './VotingPanel';
import type { Player } from '@/types/game';

// VotingPanel reads the game state via useGame() (which throws outside a
// GameProvider) and derives player colors from it. We only care about the
// ranked/casual branching driven by `spectatorCount`, so stub the context with
// an empty players map — usePlayerColors handles that gracefully.
vi.mock('@/context/useGame', () => ({
  useGame: () => ({ gameState: { players: {} } }),
}));

// Guard against any accidental network call from vote handlers.
vi.mock('@/services/api', () => ({
  gameApi: { castVote: vi.fn().mockResolvedValue(undefined) },
}));

const emptyBoard = { tiles: [] };

function makeProducers(): Player[] {
  return [
    { id: 'p1', name: 'Alice', board: emptyBoard },
    { id: 'p2', name: 'Bob', board: emptyBoard },
  ];
}

// MIN_SPECTATORS_FOR_RANKED — the component treats spectatorCount >= 3 as ranked.
const MIN_SPECTATORS_FOR_RANKED = 3;

function renderPanel(overrides: Partial<React.ComponentProps<typeof VotingPanel>> = {}) {
  return render(
    <VotingPanel
      roomId="room-1"
      playerSecret="secret"
      currentPlayerId="p1"
      producers={makeProducers()}
      currentGenre="Trap"
      votingOpen={false}
      votesRecorded={0}
      spectatorCount={0}
      {...overrides}
    />,
  );
}

describe('VotingPanel — ranked vs casual (spectatorCount threshold)', () => {
  describe('below MIN_SPECTATORS_FOR_RANKED (isRanked = false)', () => {
    it('shows the "for ranked mode" waiting copy when voting is closed', () => {
      renderPanel({ votingOpen: false, spectatorCount: MIN_SPECTATORS_FOR_RANKED - 1 });
      expect(
        screen.getByText(`Waiting for more spectators to join (2/3 for ranked mode)`),
      ).toBeInTheDocument();
    });

    it('shows the "Casual mode" footer while voting is open', () => {
      renderPanel({ votingOpen: true, spectatorCount: MIN_SPECTATORS_FOR_RANKED - 1 });
      expect(screen.getByText('Casual mode - votes are for fun only')).toBeInTheDocument();
    });

    it('treats spectatorCount = 0 as casual', () => {
      renderPanel({ votingOpen: true, spectatorCount: 0 });
      expect(screen.getByText('Casual mode - votes are for fun only')).toBeInTheDocument();
    });
  });

  describe('at or above MIN_SPECTATORS_FOR_RANKED (isRanked = true)', () => {
    it('does NOT show the casual footer at exactly the threshold', () => {
      renderPanel({ votingOpen: true, spectatorCount: MIN_SPECTATORS_FOR_RANKED });
      expect(screen.queryByText('Casual mode - votes are for fun only')).not.toBeInTheDocument();
    });

    it('shows the ranked waiting copy (not the ranked-mode prompt) when voting is closed', () => {
      renderPanel({ votingOpen: false, spectatorCount: MIN_SPECTATORS_FOR_RANKED });
      expect(
        screen.getByText('Waiting for producers to finish their beats...'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/for ranked mode/)).not.toBeInTheDocument();
    });

    it('stays ranked well above the threshold', () => {
      renderPanel({ votingOpen: true, spectatorCount: MIN_SPECTATORS_FOR_RANKED + 5 });
      expect(screen.queryByText('Casual mode - votes are for fun only')).not.toBeInTheDocument();
    });
  });
});
