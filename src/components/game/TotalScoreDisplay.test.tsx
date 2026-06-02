import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TotalScoreDisplay } from './TotalScoreDisplay';

describe('TotalScoreDisplay', () => {
  it('renders the total score value', () => {
    render(<TotalScoreDisplay totalScore={2500} />);
    expect(screen.getByText('2500')).toBeInTheDocument();
  });

  it('renders the "Total Score" label', () => {
    render(<TotalScoreDisplay totalScore={2500} />);
    expect(screen.getByText('Total Score')).toBeInTheDocument();
  });

  it('renders with data-testid for E2E selection', () => {
    render(<TotalScoreDisplay totalScore={2500} />);
    expect(screen.getByTestId('total-score')).toBeInTheDocument();
  });

  it('renders zero score', () => {
    render(<TotalScoreDisplay totalScore={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders large score values', () => {
    render(<TotalScoreDisplay totalScore={999999} />);
    expect(screen.getByText('999999')).toBeInTheDocument();
  });

  it('renders negative total scores (should not happen in practice, but guard)', () => {
    render(<TotalScoreDisplay totalScore={-5} />);
    expect(screen.getByText('-5')).toBeInTheDocument();
  });

  it('accepts and applies className prop', () => {
    const { container } = render(<TotalScoreDisplay totalScore={100} className="custom-class" />);
    const el = container.querySelector('.custom-class');
    expect(el).toBeInTheDocument();
  });
});
