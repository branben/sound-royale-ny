import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EloDeltaDisplay } from './EloDeltaDisplay';

describe('EloDeltaDisplay', () => {
  const eloDeltas = [
    { playerId: 'p1', playerName: 'Player1', previousElo: 1200, newElo: 1225, delta: 25, isWinner: true },
    { playerId: 'p2', playerName: 'Player2', previousElo: 1200, newElo: 1185, delta: -15, isWinner: false },
    { playerId: 'p3', playerName: 'Player3', previousElo: 1200, newElo: 1200, delta: 0, isWinner: false },
  ];

  it('renders the "ELO Changes" heading', () => {
    render(<EloDeltaDisplay eloDeltas={eloDeltas} />);
    expect(screen.getByText('ELO Changes')).toBeInTheDocument();
  });

  it('renders player names in delta entries', () => {
    render(<EloDeltaDisplay eloDeltas={eloDeltas} />);
    expect(screen.getByText('Player1')).toBeInTheDocument();
    expect(screen.getByText('Player2')).toBeInTheDocument();
    expect(screen.getByText('Player3')).toBeInTheDocument();
  });

  it('shows winner label next to winner player name', () => {
    render(<EloDeltaDisplay eloDeltas={eloDeltas} />);
    expect(screen.getByText('(Winner)')).toBeInTheDocument();
  });

  it('displays ELO change arrows (previous > new)', () => {
    render(<EloDeltaDisplay eloDeltas={[eloDeltas[0]]} />);
    // Values are split across adjacent text nodes by the ">" span
    expect(screen.getByText((content) => content.includes('1200'))).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('1225'))).toBeInTheDocument();
  });

  it('shows positive delta with + prefix', () => {
    render(<EloDeltaDisplay eloDeltas={[eloDeltas[0]]} />);
    expect(screen.getByText('+25')).toBeInTheDocument();
  });

  it('shows negative delta with minus sign', () => {
    render(<EloDeltaDisplay eloDeltas={[eloDeltas[1]]} />);
    expect(screen.getByText('-15')).toBeInTheDocument();
  });

  it('shows zero delta without sign', () => {
    render(<EloDeltaDisplay eloDeltas={[eloDeltas[2]]} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders with data-testid for E2E selection', () => {
    render(<EloDeltaDisplay eloDeltas={eloDeltas} />);
    expect(screen.getByTestId('elo-delta-display')).toBeInTheDocument();
  });

  it('accepts and applies className prop', () => {
    const { container } = render(<EloDeltaDisplay eloDeltas={eloDeltas} className="custom-class" />);
    const el = container.querySelector('.custom-class');
    expect(el).toBeInTheDocument();
  });

  describe('empty and edge cases', () => {
    it('renders heading but no entries when eloDeltas is empty', () => {
      render(<EloDeltaDisplay eloDeltas={[]} />);
      expect(screen.getByText('ELO Changes')).toBeInTheDocument();
    });

    it('handles single player delta', () => {
      render(
        <EloDeltaDisplay
          eloDeltas={[{ playerId: 'p1', playerName: 'Solo', previousElo: 1000, newElo: 1050, delta: 50, isWinner: true }]}
        />
      );
      expect(screen.getByText('Solo')).toBeInTheDocument();
      expect(screen.getByText('+50')).toBeInTheDocument();
    });

    it('handles large positive delta', () => {
      render(
        <EloDeltaDisplay
          eloDeltas={[{ playerId: 'p1', playerName: 'Champion', previousElo: 800, newElo: 1200, delta: 400, isWinner: true }]}
        />
      );
      expect(screen.getByTestId('elo-delta-display')).toBeInTheDocument();
      expect(screen.getByText('Champion')).toBeInTheDocument();
      expect(screen.getByText('+400')).toBeInTheDocument();
    });
  });
});
