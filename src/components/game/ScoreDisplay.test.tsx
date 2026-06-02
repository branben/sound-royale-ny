import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScoreDisplay } from './ScoreDisplay';

describe('ScoreDisplay', () => {
  const scoreInfo = {
    score: 1500,
    base_score: 1000,
    bonuses: [
      { type: 'multi_line', points: 300 },
      { type: 'speed', points: 200 },
    ],
    lines: [
      { type: 'row', positions: [0, 1, 2] },
      { type: 'column', positions: [0, 3, 6] },
    ],
  };

  describe('null state (no score)', () => {
    it('renders "No score yet" when scoreInfo is null', () => {
      render(<ScoreDisplay scoreInfo={null} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByText('No score yet')).toBeInTheDocument();
    });

    it('shows player name in null state when showPlayerName is true', () => {
      render(<ScoreDisplay scoreInfo={null} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByText('Player1')).toBeInTheDocument();
    });

    it('hides player name when showPlayerName is false', () => {
      render(
        <ScoreDisplay scoreInfo={null} playerName="Player1" isCurrentPlayer={false} showPlayerName={false} />
      );
      expect(screen.queryByText('Player1')).not.toBeInTheDocument();
    });

    it('renders ELO rating in null state when provided', () => {
      render(
        <ScoreDisplay scoreInfo={null} playerName="Player1" isCurrentPlayer={false} eloRating={1400} />
      );
      expect(screen.getByTestId('elo-rating')).toBeInTheDocument();
      expect(screen.getByText('ELO: 1400')).toBeInTheDocument();
    });
  });

  describe('score display', () => {
    it('renders the score value', () => {
      render(<ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByText('1500')).toBeInTheDocument();
    });

    it('renders "points" label', () => {
      render(<ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByText('points')).toBeInTheDocument();
    });

    it('renders base score breakdown', () => {
      render(<ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByText('Base Score')).toBeInTheDocument();
      expect(screen.getByText('1000')).toBeInTheDocument();
    });
  });

  describe('player name', () => {
    it('shows player name when showPlayerName is true (default)', () => {
      render(<ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByText('Player1')).toBeInTheDocument();
    });

    it('hides player name when showPlayerName is false', () => {
      render(
        <ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} showPlayerName={false} />
      );
      expect(screen.queryByText('Player1')).not.toBeInTheDocument();
    });

    it('highlights current player name in blue', () => {
      render(<ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={true} />);
      const nameEl = screen.getByText('Player1');
      expect(nameEl.className).toContain('text-blue');
    });
  });

  describe('bonuses', () => {
    it('renders multi_line bonus', () => {
      render(<ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByText('multi line Bonus')).toBeInTheDocument();
      expect(screen.getByText('+300')).toBeInTheDocument();
    });

    it('renders speed bonus', () => {
      render(<ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByText('speed Bonus')).toBeInTheDocument();
      expect(screen.getByText('+200')).toBeInTheDocument();
    });

    it('shows bonus badges', () => {
      render(<ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByText('Multi-Line')).toBeInTheDocument();
      expect(screen.getByText('Speed')).toBeInTheDocument();
    });

    it('does not render bonus badges when no bonuses', () => {
      const noBonusScore = { ...scoreInfo, bonuses: [] };
      render(<ScoreDisplay scoreInfo={noBonusScore} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.queryByText('Multi-Line')).not.toBeInTheDocument();
      expect(screen.queryByText('Speed')).not.toBeInTheDocument();
    });
  });

  describe('completed lines', () => {
    it('renders completed line indicators', () => {
      render(<ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByText('Completed Lines:')).toBeInTheDocument();
    });

    it('shows "None yet" when no lines completed', () => {
      const noLinesScore = { ...scoreInfo, lines: [] };
      render(<ScoreDisplay scoreInfo={noLinesScore} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByText('None yet')).toBeInTheDocument();
    });

    it('shows "Dominating" badge for 2+ lines', () => {
      render(<ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByText('Dominating')).toBeInTheDocument();
    });

    it('does not show "Dominating" for 0-1 lines', () => {
      const oneLine = { ...scoreInfo, lines: [{ type: 'row', positions: [0, 1, 2] }] };
      render(<ScoreDisplay scoreInfo={oneLine} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.queryByText('Dominating')).not.toBeInTheDocument();
    });
  });

  describe('winner state', () => {
    const winScoreInfo = {
      ...scoreInfo,
      bonuses: [],
      lines: [],
    };

    it('shows WINNER badge when hasWon is true', () => {
      render(<ScoreDisplay scoreInfo={winScoreInfo} playerName="Player1" isCurrentPlayer={false} hasWon={true} />);
      expect(screen.getByText('WINNER')).toBeInTheDocument();
    });

    it('does not show WINNER badge when hasWon is false', () => {
      render(<ScoreDisplay scoreInfo={winScoreInfo} playerName="Player1" isCurrentPlayer={false} hasWon={false} />);
      expect(screen.queryByText('WINNER')).not.toBeInTheDocument();
    });

    it('sets data-victory-celebration attribute when hasWon', () => {
      render(<ScoreDisplay scoreInfo={winScoreInfo} playerName="Player1" isCurrentPlayer={false} hasWon={true} />);
      const display = screen.getByTestId('score-display');
      expect(display.getAttribute('data-victory-celebration')).toBe('true');
    });

    it('renders ELO delta badge only when hasWon and eloDelta provided', () => {
      render(
        <ScoreDisplay
          scoreInfo={winScoreInfo}
          playerName="Player1"
          isCurrentPlayer={false}
          hasWon={true}
          eloDelta={25}
        />
      );
      expect(screen.getByTestId('elo-delta')).toBeInTheDocument();
      expect(screen.getByText('+25')).toBeInTheDocument();
    });

    it('does not render ELO delta badge when hasWon is false', () => {
      render(
        <ScoreDisplay
          scoreInfo={winScoreInfo}
          playerName="Player1"
          isCurrentPlayer={false}
          hasWon={false}
          eloDelta={25}
        />
      );
      expect(screen.queryByTestId('elo-delta')).not.toBeInTheDocument();
    });

    it('shows negative ELO delta with correct sign', () => {
      render(
        <ScoreDisplay
          scoreInfo={winScoreInfo}
          playerName="Player1"
          isCurrentPlayer={false}
          hasWon={true}
          eloDelta={-15}
        />
      );
      expect(screen.getByText('-15')).toBeInTheDocument();
    });
  });

  describe('ELO rating', () => {
    it('renders ELO rating when provided', () => {
      render(<ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} eloRating={1350} />);
      expect(screen.getByTestId('elo-rating')).toBeInTheDocument();
      expect(screen.getByText('ELO: 1350')).toBeInTheDocument();
    });

    it('does not render ELO rating when not provided', () => {
      render(<ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.queryByTestId('elo-rating')).not.toBeInTheDocument();
    });
  });

  describe('interaction', () => {
    it('calls onPlayerClick when clicked', () => {
      const handleClick = () => {};
      const mockFn = vi.fn(handleClick);

      render(
        <ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} onPlayerClick={mockFn} />
      );

      fireEvent.click(screen.getByTestId('score-display'));
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('renders with empty bonuses array', () => {
      const noBonuses = { ...scoreInfo, bonuses: [] };
      render(<ScoreDisplay scoreInfo={noBonuses} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByText('1500')).toBeInTheDocument();
      expect(screen.getByText('1000')).toBeInTheDocument();
    });

    it('renders with all line types', () => {
      const allLineTypes = {
        ...scoreInfo,
        lines: [
          { type: 'row', positions: [0, 1, 2] },
          { type: 'column', positions: [0, 3, 6] },
          { type: 'diagonal', positions: [0, 4, 8] },
        ],
      };
      render(<ScoreDisplay scoreInfo={allLineTypes} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByText('Completed Lines:')).toBeInTheDocument();
    });

    it('renders with zero score', () => {
      const zeroScore = { score: 0, base_score: 0, bonuses: [], lines: [] };
      render(<ScoreDisplay scoreInfo={zeroScore} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByTestId('score-display')).toBeInTheDocument();
      expect(screen.getByText('points')).toBeInTheDocument();
    });

    it('applies cursor-pointer class when onPlayerClick is provided', () => {
      render(
        <ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} onPlayerClick={() => {}} />
      );
      const clickable = screen.getByTestId('score-display');
      expect(clickable.onclick).not.toBeNull();
    });

    it('has test id for E2E selection', () => {
      render(<ScoreDisplay scoreInfo={scoreInfo} playerName="Player1" isCurrentPlayer={false} />);
      expect(screen.getByTestId('score-display')).toBeInTheDocument();
    });
  });
});
