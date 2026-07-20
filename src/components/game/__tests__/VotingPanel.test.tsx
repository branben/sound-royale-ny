import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MIN_SPECTATORS_FOR_RANKED } from '@/types/game';
import { VotingPanel } from '../VotingPanel';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(
      ({ children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLDivElement>) =>
        React.createElement('div', { ...props, ref }, children as React.ReactNode),
    ),
    button: React.forwardRef(
      ({ children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLButtonElement>) =>
        React.createElement('button', { ...props, ref }, children as React.ReactNode),
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock useGame hook — required by VotingPanel for player colors
vi.mock('@/context/useGame', () => ({
  useGame: vi.fn(() => ({
    gameState: { players: {} },
  })),
}));

const defaultProps = {
  roomId: 'test-room',
  playerSecret: 'secret-1',
  producers: [],
  currentGenre: 'Test',
  votesRecorded: 0,
  votingOpen: false,
  spectatorCount: 2,
};

describe('VotingPanel', () => {
  describe('isRanked = false (below MIN_SPECTATORS_FOR_RANKED)', () => {
    it('shows waiting message with spectator count when below ranked threshold', () => {
      render(<VotingPanel {...defaultProps} spectatorCount={2} />);
      expect(
        screen.getByText(
          `Waiting for more spectators to join (2/${MIN_SPECTATORS_FOR_RANKED} for ranked mode)`,
        ),
      ).toBeInTheDocument();
    });

    it('shows "Voting" heading', () => {
      render(<VotingPanel {...defaultProps} spectatorCount={2} />);
      expect(screen.getByText('Voting')).toBeInTheDocument();
    });
  });

  describe('isRanked = true (at or above MIN_SPECTATORS_FOR_RANKED)', () => {
    it('shows waiting message for producers when enough spectators', () => {
      render(<VotingPanel {...defaultProps} spectatorCount={3} />);
      expect(
        screen.getByText('Waiting for producers to finish their beats...'),
      ).toBeInTheDocument();
    });
  });

  it('renders the panel with data-testid', () => {
    render(<VotingPanel {...defaultProps} spectatorCount={2} />);
    expect(screen.getByTestId('voting-panel')).toBeInTheDocument();
  });
});
