import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoundStage } from './RoundStage';

// MIN_SPECTATORS_FOR_RANKED — RoundStage shows the "Ranked voting" badge at
// spectatorCount >= 3 and "Casual mode" below it (only while voting is closed).
const MIN_SPECTATORS_FOR_RANKED = 3;

function renderStage(overrides: Partial<React.ComponentProps<typeof RoundStage>> = {}) {
  return render(
    <RoundStage
      roundNumber={1}
      genre="Trap"
      votingOpen={false}
      spectatorCount={0}
      {...overrides}
    />,
  );
}

describe('RoundStage — Ranked voting vs Casual mode badge', () => {
  describe('below MIN_SPECTATORS_FOR_RANKED', () => {
    it('renders the "Casual mode" badge when voting is closed', () => {
      renderStage({ votingOpen: false, spectatorCount: MIN_SPECTATORS_FOR_RANKED - 1 });
      expect(screen.getByText('Casual mode')).toBeInTheDocument();
      expect(screen.queryByText('Ranked voting')).not.toBeInTheDocument();
    });

    it('renders "Casual mode" at spectatorCount = 0', () => {
      renderStage({ votingOpen: false, spectatorCount: 0 });
      expect(screen.getByText('Casual mode')).toBeInTheDocument();
    });
  });

  describe('at or above MIN_SPECTATORS_FOR_RANKED', () => {
    it('renders the "Ranked voting" badge at exactly the threshold', () => {
      renderStage({ votingOpen: false, spectatorCount: MIN_SPECTATORS_FOR_RANKED });
      expect(screen.getByText('Ranked voting')).toBeInTheDocument();
      expect(screen.queryByText('Casual mode')).not.toBeInTheDocument();
    });

    it('renders "Ranked voting" well above the threshold', () => {
      renderStage({ votingOpen: false, spectatorCount: MIN_SPECTATORS_FOR_RANKED + 4 });
      expect(screen.getByText('Ranked voting')).toBeInTheDocument();
      expect(screen.queryByText('Casual mode')).not.toBeInTheDocument();
    });
  });

  describe('when voting is open', () => {
    it('shows the "Vote open" badge and neither ranked nor casual badge', () => {
      renderStage({ votingOpen: true, spectatorCount: MIN_SPECTATORS_FOR_RANKED });
      expect(screen.getByText('Vote open')).toBeInTheDocument();
      expect(screen.queryByText('Ranked voting')).not.toBeInTheDocument();
      expect(screen.queryByText('Casual mode')).not.toBeInTheDocument();
    });

    it('hides ranked/casual badges even below threshold while voting is open', () => {
      renderStage({ votingOpen: true, spectatorCount: MIN_SPECTATORS_FOR_RANKED - 1 });
      expect(screen.getByText('Vote open')).toBeInTheDocument();
      expect(screen.queryByText('Casual mode')).not.toBeInTheDocument();
    });
  });
});
