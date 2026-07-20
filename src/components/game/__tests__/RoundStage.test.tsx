import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoundStage } from '../RoundStage';

describe('RoundStage', () => {
  describe('Ranked voting badge', () => {
    it('shows "Ranked voting" when spectatorCount >= MIN_SPECTATORS_FOR_RANKED', () => {
      render(<RoundStage roundNumber={1} spectatorCount={3} votingOpen={false} />);
      expect(screen.getByText('Ranked voting')).toBeInTheDocument();
    });

    it('does not show "Casual mode" when spectatorCount >= threshold', () => {
      render(<RoundStage roundNumber={1} spectatorCount={3} votingOpen={false} />);
      expect(screen.queryByText('Casual mode')).not.toBeInTheDocument();
    });
  });

  describe('Casual mode badge', () => {
    it('shows "Casual mode" when spectatorCount < MIN_SPECTATORS_FOR_RANKED', () => {
      render(<RoundStage roundNumber={1} spectatorCount={2} votingOpen={false} />);
      expect(screen.getByText('Casual mode')).toBeInTheDocument();
    });

    it('does not show "Ranked voting" when spectatorCount below threshold', () => {
      render(<RoundStage roundNumber={1} spectatorCount={2} votingOpen={false} />);
      expect(screen.queryByText('Ranked voting')).not.toBeInTheDocument();
    });
  });

  it('renders round number', () => {
    render(<RoundStage roundNumber={5} spectatorCount={3} votingOpen={false} />);
    expect(screen.getByText('Round 5')).toBeInTheDocument();
  });

  it('renders with data-testid', () => {
    render(<RoundStage roundNumber={1} spectatorCount={3} votingOpen={false} />);
    expect(screen.getByTestId('round-stage')).toBeInTheDocument();
  });
});
