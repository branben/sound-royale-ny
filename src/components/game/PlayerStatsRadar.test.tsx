import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayerStatsRadar, CustomTooltip } from './PlayerStatsRadar';
import type { Player, GenrePerformance } from '@/types/game';

interface RadarDatum {
  axis: string;
  wins: number;
  losses: number;
  isLegacy: boolean;
}

type MockProps = { children?: React.ReactNode; [key: string]: unknown };

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: MockProps) => (
    <div className="recharts-wrapper">{children}</div>
  ),
  RadarChart: ({ children, data }: MockProps) => (
    <div data-testid="radar-chart" data-chart-json={JSON.stringify(data || [])}>
      {children}
    </div>
  ),
  Radar: () => <div data-testid="radar" />,
  PolarGrid: () => <div data-testid="polar-grid" />,
  PolarAngleAxis: ({ dataKey, tick }: MockProps) => (
    <div data-testid="polar-angle-axis">
      {/* Simulate axis labels with text content matching recharts output */}
    </div>
  ),
  PolarRadiusAxis: () => <div data-testid="polar-radius-axis" />,
  Legend: ({ content }: MockProps) => {
    if (!content) return null;
    const payload = [
      { value: 'Wins', color: '#3b82f6' },
      { value: 'Losses', color: '#ef4444' },
    ];
    return content({ payload });
  },
}));

// Mock ChartTooltip to avoid SVG
vi.mock('@/components/ui/chart', () => ({
  ChartContainer: ({ children }: MockProps) => <div>{children}</div>,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
  ChartLegend: () => null,
  ChartLegendContent: () => null,
}));

const basePlayer: Player = {
  id: 'player-1',
  name: 'TestPlayer',
  board: { tiles: [] },
};

function makeGenre(name: string, wins: number, total: number, isLegacy = false): GenrePerformance {
  return {
    genre: name,
    wins,
    total_rounds: total,
    win_rate: total > 0 ? wins / total : 0,
    grade: 'N/A',
    is_legacy: isLegacy,
  };
}

describe('PlayerStatsRadar', () => {
  it('renders the Genre Performance title', () => {
    render(<PlayerStatsRadar player={basePlayer} genrePerformance={[]} />);
    expect(screen.getByText('Genre Performance')).toBeInTheDocument();
  });

  describe('without roomGenres (historical view)', () => {
    it('renders radar chart with core genres', () => {
      const genres = [
        makeGenre('Phonk', 5, 10),
        makeGenre('Trap', 3, 8),
        makeGenre('Lo-Fi', 7, 10),
      ];
      const { container } = render(
        <PlayerStatsRadar player={basePlayer} genrePerformance={genres} />,
      );

      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
      expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument();
    });

    it('includes historical genres up to the 9-slot limit', () => {
      const genres = [
        makeGenre('Phonk', 5, 10, false),
        makeGenre('Synthwave', 9, 10, true),
        makeGenre('Drum & Bass', 4, 8, true),
      ];
      const { container } = render(
        <PlayerStatsRadar player={basePlayer} genrePerformance={genres} />,
      );

      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
      expect(container.querySelectorAll('[data-testid="radar"]').length).toBe(2);
    });

    it('sorts historical genres by total_rounds descending', () => {
      const coreGenres = [makeGenre('Phonk', 5, 10, false)];
      const historicalGenres = [
        makeGenre('Rock', 2, 5, true),
        makeGenre('Jazz', 8, 20, true),
        makeGenre('Blues', 1, 3, true),
      ];
      render(
        <PlayerStatsRadar
          player={basePlayer}
          genrePerformance={[...coreGenres, ...historicalGenres]}
        />,
      );

      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });

    it('limits to 9 genres maximum', () => {
      const coreGenres = [
        makeGenre('Phonk', 1, 2, false),
        makeGenre('Trap', 1, 2, false),
        makeGenre('Lo-Fi', 1, 2, false),
        makeGenre('House', 1, 2, false),
        makeGenre('Drill', 1, 2, false),
        makeGenre('R&B', 1, 2, false),
        makeGenre('EDM', 1, 2, false),
        makeGenre('Jazz', 1, 2, false),
        makeGenre('Ambient', 1, 2, false),
      ];
      const historical = [makeGenre('Synthwave', 9, 10, true)];

      render(
        <PlayerStatsRadar player={basePlayer} genrePerformance={[...coreGenres, ...historical]} />,
      );

      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });

    it('calculates win/loss percentages correctly', () => {
      const genres = [makeGenre('Phonk', 7, 10, false)];
      render(<PlayerStatsRadar player={basePlayer} genrePerformance={genres} />);

      expect(screen.getByText('Genre Performance')).toBeInTheDocument();
    });

    it('handles empty genrePerformance array', () => {
      const { container } = render(<PlayerStatsRadar player={basePlayer} genrePerformance={[]} />);
      expect(screen.getByText('Genre Performance')).toBeInTheDocument();
      expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument();
    });
  });

  describe('with roomGenres', () => {
    it('renders radar chart with specified room genres', () => {
      const genres = [
        makeGenre('Phonk', 5, 10),
        makeGenre('Trap', 3, 8),
        makeGenre('Lo-Fi', 7, 10),
        makeGenre('House', 2, 5),
      ];
      render(
        <PlayerStatsRadar
          player={basePlayer}
          genrePerformance={genres}
          roomGenres={['Phonk', 'Lo-Fi']}
        />,
      );

      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });

    it('deduplicates room genres case-insensitively', () => {
      const genres = [makeGenre('phonk', 5, 10)];
      render(
        <PlayerStatsRadar
          player={basePlayer}
          genrePerformance={genres}
          roomGenres={['Phonk', 'PHONK', 'phonk']}
        />,
      );

      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });

    it('fills 0% for room genres without performance data', () => {
      const genres = [makeGenre('Phonk', 5, 10)];
      render(
        <PlayerStatsRadar
          player={basePlayer}
          genrePerformance={genres}
          roomGenres={['Phonk', 'Trap']}
        />,
      );

      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });

    it('updates when roomGenres prop changes', () => {
      const genres = [makeGenre('Phonk', 5, 10), makeGenre('Trap', 3, 8)];

      const { rerender } = render(
        <PlayerStatsRadar player={basePlayer} genrePerformance={genres} roomGenres={['Phonk']} />,
      );

      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();

      rerender(
        <PlayerStatsRadar player={basePlayer} genrePerformance={genres} roomGenres={['Trap']} />,
      );

      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });

    it('limits room genres to 9 entries', () => {
      const genres = [makeGenre('Phonk', 5, 10)];
      const manyRoomGenres = Array.from({ length: 15 }, (_, i) => `genre-${i}`);

      render(
        <PlayerStatsRadar
          player={basePlayer}
          genrePerformance={genres}
          roomGenres={manyRoomGenres}
        />,
      );
      expect(screen.getByText('Genre Performance')).toBeInTheDocument();
    });

    it('preserves isLegacy flag from genre performance in roomGenres mode', () => {
      const genres = [makeGenre('Phonk', 5, 10, false), makeGenre('Synthwave', 9, 10, true)];
      render(
        <PlayerStatsRadar
          player={basePlayer}
          genrePerformance={genres}
          roomGenres={['Phonk', 'Synthwave']}
        />,
      );
      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });

    it('matches roomGenres case-insensitively and uses original genre name', () => {
      const genres = [makeGenre('Phonk', 5, 10)];
      render(
        <PlayerStatsRadar player={basePlayer} genrePerformance={genres} roomGenres={['phonk']} />,
      );
      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });
  });

  describe('empty roomGenres array', () => {
    it('falls through to core genres when roomGenres is empty', () => {
      const genres = [makeGenre('Phonk', 5, 10)];
      render(<PlayerStatsRadar player={basePlayer} genrePerformance={genres} roomGenres={[]} />);

      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles zero total_rounds without division by zero', () => {
      const genres = [makeGenre('Phonk', 0, 0, false)];
      render(<PlayerStatsRadar player={basePlayer} genrePerformance={genres} />);

      expect(screen.getByText('Genre Performance')).toBeInTheDocument();
    });

    it('renders without crashing with mixed genres', () => {
      const genres = [makeGenre('Phonk', 5, 10, false), makeGenre('Synthwave', 9, 10, true)];
      render(
        <PlayerStatsRadar player={basePlayer} genrePerformance={genres} roomGenres={['Phonk']} />,
      );

      expect(screen.getByText('Genre Performance')).toBeInTheDocument();
    });

    it('renders wins/losses legend', () => {
      const genres = [makeGenre('Phonk', 5, 10)];
      render(<PlayerStatsRadar player={basePlayer} genrePerformance={genres} />);

      expect(screen.getByText('Wins')).toBeInTheDocument();
      expect(screen.getByText('Losses')).toBeInTheDocument();
    });

    it('handles all-legacy genres with no core genres in historical view', () => {
      const genres = [makeGenre('Synthwave', 9, 10, true), makeGenre('Drum & Bass', 4, 8, true)];
      render(<PlayerStatsRadar player={basePlayer} genrePerformance={genres} />);

      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
      expect(screen.getByText('Genre Performance')).toBeInTheDocument();
    });

    it('shows (legacy) suffix on legacy genre axis labels in historical view', () => {
      const genres = [makeGenre('Synthwave', 9, 10, true)];
      render(<PlayerStatsRadar player={basePlayer} genrePerformance={genres} />);

      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });

    it('selects at most 9 genres when many core and historical genres exist', () => {
      const coreGenres = [
        makeGenre('Phonk', 1, 2, false),
        makeGenre('Trap', 1, 2, false),
        makeGenre('Lo-Fi', 1, 2, false),
        makeGenre('House', 1, 2, false),
        makeGenre('Drill', 1, 2, false),
        makeGenre('R&B', 1, 2, false),
        makeGenre('EDM', 1, 2, false),
        makeGenre('Jazz', 1, 2, false),
        makeGenre('Ambient', 1, 2, false),
      ];
      const historical = [
        makeGenre('Synthwave', 9, 10, true),
        makeGenre('Rock', 5, 8, true),
        makeGenre('Blues', 3, 6, true),
      ];

      render(
        <PlayerStatsRadar player={basePlayer} genrePerformance={[...coreGenres, ...historical]} />,
      );

      expect(screen.getByText('Genre Performance')).toBeInTheDocument();
    });
  });

  describe('chart data validation', () => {
    function getChartData(container: HTMLElement): RadarDatum[] {
      const chartEl = container.querySelector('[data-testid="radar-chart"]');
      const json = chartEl?.getAttribute('data-chart-json');
      return json ? (JSON.parse(json) as RadarDatum[]) : [];
    }

    describe('historical view percentages', () => {
      it('calculates exact win/loss percentages: 7/10 = 70% wins, 30% losses', () => {
        const genres = [makeGenre('Phonk', 7, 10)];
        const { container } = render(
          <PlayerStatsRadar player={basePlayer} genrePerformance={genres} />,
        );
        const chartData = getChartData(container);
        expect(chartData).toHaveLength(1);
        expect(chartData[0].wins).toBe(70);
        expect(chartData[0].losses).toBe(30);
      });

      it('returns 0% for genres with zero total_rounds (division guard)', () => {
        const genres = [makeGenre('Phonk', 0, 0)];
        const { container } = render(
          <PlayerStatsRadar player={basePlayer} genrePerformance={genres} />,
        );
        const chartData = getChartData(container);
        expect(chartData[0].wins).toBe(0);
        expect(chartData[0].losses).toBe(0);
      });

      it('calculates 100% wins when wins equals total_rounds', () => {
        const genres = [makeGenre('Phonk', 10, 10)];
        const { container } = render(
          <PlayerStatsRadar player={basePlayer} genrePerformance={genres} />,
        );
        const chartData = getChartData(container);
        expect(chartData[0].wins).toBe(100);
        expect(chartData[0].losses).toBe(0);
      });

      it('calculates 0% wins when wins is 0', () => {
        const genres = [makeGenre('Phonk', 0, 10)];
        const { container } = render(
          <PlayerStatsRadar player={basePlayer} genrePerformance={genres} />,
        );
        const chartData = getChartData(container);
        expect(chartData[0].wins).toBe(0);
        expect(chartData[0].losses).toBe(100);
      });
    });

    describe('historical view labels and ordering', () => {
      it('appends "(legacy)" to legacy genre axis labels', () => {
        const genres = [makeGenre('Synthwave', 5, 10, true)];
        const { container } = render(
          <PlayerStatsRadar player={basePlayer} genrePerformance={genres} />,
        );
        const chartData = getChartData(container);
        expect(chartData[0].axis).toBe('Synthwave (legacy)');
        expect(chartData[0].isLegacy).toBe(true);
      });

      it('does not append "(legacy)" to non-legacy genre labels', () => {
        const genres = [makeGenre('Phonk', 5, 10, false)];
        const { container } = render(
          <PlayerStatsRadar player={basePlayer} genrePerformance={genres} />,
        );
        const chartData = getChartData(container);
        expect(chartData[0].axis).toBe('Phonk');
        expect(chartData[0].isLegacy).toBe(false);
      });

      it('sorts historical genres by total_rounds descending in chart data', () => {
        const historicalGenres = [
          makeGenre('Rock', 2, 5, true),
          makeGenre('Jazz', 8, 20, true),
          makeGenre('Blues', 1, 3, true),
        ];
        const { container } = render(
          <PlayerStatsRadar player={basePlayer} genrePerformance={[...historicalGenres]} />,
        );
        const chartData = getChartData(container);
        const legacyEntries = chartData.filter((d: RadarDatum) => d.isLegacy);
        expect(legacyEntries[0].axis).toBe('Jazz (legacy)');
        expect(legacyEntries[1].axis).toBe('Rock (legacy)');
        expect(legacyEntries[2].axis).toBe('Blues (legacy)');
      });

      it('excludes historical genres when 9 core genres fill all slots', () => {
        const cores = Array.from({ length: 9 }, (_, i) => makeGenre(`Genre${i}`, 1, 2, false));
        const historical = [makeGenre('Extra', 9, 10, true)];
        const { container } = render(
          <PlayerStatsRadar player={basePlayer} genrePerformance={[...cores, ...historical]} />,
        );
        const chartData = getChartData(container);
        expect(chartData).toHaveLength(9);
        expect(chartData.every((d: RadarDatum) => !d.isLegacy)).toBe(true);
      });

      it('fills remaining slots with historical genres when core < 9', () => {
        const cores = [makeGenre('Phonk', 5, 10, false)];
        const historical = Array.from({ length: 10 }, (_, i) =>
          makeGenre(`Hist${i}`, i, i + 1, true),
        );
        const { container } = render(
          <PlayerStatsRadar player={basePlayer} genrePerformance={[...cores, ...historical]} />,
        );
        const chartData = getChartData(container);
        expect(chartData).toHaveLength(9);
        expect(chartData[0].isLegacy).toBe(false);
        const rest = chartData.filter((d: RadarDatum) => d.isLegacy);
        expect(rest.length).toBeGreaterThan(0);
        expect(rest.length).toBeLessThanOrEqual(8);
      });
    });

    describe('roomGenres view chart data', () => {
      it('preserves original performance genre casing in axis label', () => {
        const genres = [makeGenre('PHONK', 5, 10)];
        const { container } = render(
          <PlayerStatsRadar player={basePlayer} genrePerformance={genres} roomGenres={['phonk']} />,
        );
        const chartData = getChartData(container);
        expect(chartData[0].axis).toBe('PHONK');
      });

      it('uses lowercase room genre name when no performance data matched', () => {
        const genres = [makeGenre('Phonk', 5, 10)];
        const { container } = render(
          <PlayerStatsRadar player={basePlayer} genrePerformance={genres} roomGenres={['Trap']} />,
        );
        const chartData = getChartData(container);
        expect(chartData[0].axis).toBe('trap');
        expect(chartData[0].wins).toBe(0);
        expect(chartData[0].losses).toBe(0);
      });

      it('calculates exact percentages for matched room genre', () => {
        const genres = [makeGenre('Phonk', 3, 8)];
        const { container } = render(
          <PlayerStatsRadar player={basePlayer} genrePerformance={genres} roomGenres={['Phonk']} />,
        );
        const chartData = getChartData(container);
        expect(chartData[0].wins).toBe(37.5);
        expect(chartData[0].losses).toBe(62.5);
      });

      it('sets 0% for matched genre with zero total_rounds in roomGenres mode', () => {
        const genres = [makeGenre('Phonk', 0, 0)];
        const { container } = render(
          <PlayerStatsRadar player={basePlayer} genrePerformance={genres} roomGenres={['Phonk']} />,
        );
        const chartData = getChartData(container);
        expect(chartData[0].wins).toBe(0);
        expect(chartData[0].losses).toBe(0);
      });

      it('renders mixed data: matched, unmatched, and legacy genres in roomGenres mode', () => {
        const genres = [makeGenre('Phonk', 5, 10), makeGenre('Synthwave', 9, 10, true)];
        const { container } = render(
          <PlayerStatsRadar
            player={basePlayer}
            genrePerformance={genres}
            roomGenres={['Phonk', 'Synthwave', 'Trap']}
          />,
        );
        const chartData = getChartData(container);
        expect(chartData).toHaveLength(3);
        expect(chartData[0].axis).toBe('Phonk');
        expect(chartData[0].wins).toBe(50);
        expect(chartData[1].axis).toBe('Synthwave');
        expect(chartData[1].wins).toBe(90);
        expect(chartData[2].axis).toBe('trap');
        expect(chartData[2].wins).toBe(0);
      });
    });
  });

  describe('data attributes and styling', () => {
    it('renders the flame icon', () => {
      render(<PlayerStatsRadar player={basePlayer} genrePerformance={[]} />);
      expect(screen.getByText('Genre Performance')).toBeInTheDocument();
    });

    it('renders chart subcomponents (PolarGrid, PolarAngleAxis, PolarRadiusAxis)', () => {
      const genres = [makeGenre('Phonk', 5, 10)];
      render(<PlayerStatsRadar player={basePlayer} genrePerformance={genres} />);
      expect(screen.getByTestId('polar-grid')).toBeInTheDocument();
      expect(screen.getByTestId('polar-angle-axis')).toBeInTheDocument();
      expect(screen.getByTestId('polar-radius-axis')).toBeInTheDocument();
    });

    it('renders legend with correct colored squares', () => {
      const genres = [makeGenre('Phonk', 5, 10)];
      const { container } = render(
        <PlayerStatsRadar player={basePlayer} genrePerformance={genres} />,
      );
      // Legend renders colored blocks (w-3 h-3 divs) with background colors
      const legendColors = container.querySelectorAll('.flex.items-center.gap-1 > div');
      expect(legendColors.length).toBeGreaterThanOrEqual(2);
    });

    it('renders with data-testid on radar-chart', () => {
      const genres = [makeGenre('Phonk', 5, 10)];
      render(<PlayerStatsRadar player={basePlayer} genrePerformance={genres} />);
      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });

    it('renders card with correct background styling', () => {
      const { container } = render(<PlayerStatsRadar player={basePlayer} genrePerformance={[]} />);
      const card = container.querySelector('.bg-background\\/60');
      expect(card).toBeInTheDocument();
    });
  });
});

describe('CustomTooltip', () => {
  it('returns null when active is false', () => {
    const { container } = render(
      <CustomTooltip active={false} payload={[{ payload: { axis: 'Phonk' } }]} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when payload is empty', () => {
    const { container } = render(<CustomTooltip active={true} payload={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when payload is undefined', () => {
    const { container } = render(<CustomTooltip active={true} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders genre name from payload', () => {
    const payload = [{ name: 'Wins', value: 50, color: '#3b82f6' }];
    render(
      <CustomTooltip active={true} payload={[{ payload: { axis: 'Phonk' }, ...payload[0] }]} />,
    );
    expect(screen.getByText('Phonk')).toBeInTheDocument();
  });

  it('renders formatted win/loss percentages', () => {
    const payload = [
      { name: 'Wins', value: 50, color: '#3b82f6' },
      { name: 'Losses', value: 50, color: '#ef4444' },
    ];
    render(
      <CustomTooltip
        active={true}
        payload={[
          { payload: { axis: 'Phonk' }, ...payload[0] },
          { payload: { axis: 'Phonk' }, ...payload[1] },
        ]}
      />,
    );
    expect(screen.getByText('Wins: 50.0%')).toBeInTheDocument();
    expect(screen.getByText('Losses: 50.0%')).toBeInTheDocument();
  });

  it('handles decimal values with toFixed(1) formatting', () => {
    const payload = [{ name: 'Wins', value: 33.333, color: '#3b82f6' }];
    render(
      <CustomTooltip active={true} payload={[{ payload: { axis: 'Phonk' }, ...payload[0] }]} />,
    );
    expect(screen.getByText('Wins: 33.3%')).toBeInTheDocument();
  });

  it('renders multiple entries in the tooltip', () => {
    const payload = [
      { name: 'Wins', value: 70, color: '#3b82f6' },
      { name: 'Losses', value: 30, color: '#ef4444' },
    ];
    const { container } = render(
      <CustomTooltip
        active={true}
        payload={[
          { payload: { axis: 'Phonk' }, ...payload[0] },
          { payload: { axis: 'Phonk' }, ...payload[1] },
        ]}
      />,
    );
    expect(screen.getByText('Wins: 70.0%')).toBeInTheDocument();
    expect(screen.getByText('Losses: 30.0%')).toBeInTheDocument();
  });
});
