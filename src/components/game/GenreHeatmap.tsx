import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GenrePerformance } from '@/types/game';
import { Flame } from 'lucide-react';

interface GenreHeatmapProps {
  genrePerformance: GenrePerformance[];
  compact?: boolean;
}

const genreOrder = ['ambient', 'drill', 'edm', 'house', 'jazz', 'lofi', 'phonk', 'rnb', 'trap'];

const gradeColors: Record<string, { bg: string; text: string; border: string }> = {
  S: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  A: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
  B: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  C: { bg: 'bg-yellow-400/20', text: 'text-yellow-300', border: 'border-yellow-400/30' },
  D: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  E: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  F: { bg: 'bg-red-900/20', text: 'text-red-500', border: 'border-red-900/30' },
  'N/A': { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' },
};

export const GenreHeatmap: React.FC<GenreHeatmapProps> = ({ genrePerformance, compact = false }) => {
  const gridSize = compact ? 'text-xs' : 'text-sm';
  const cellPadding = compact ? 'p-1' : 'p-2';
  const performanceByGenre = new Map(genrePerformance.map((perf) => [perf.genre, perf]));
  const normalizedPerformance = genreOrder.map((genre) => (
    performanceByGenre.get(genre) ?? {
      genre,
      wins: 0,
      total_rounds: 0,
      win_rate: 0,
      grade: 'N/A' as const,
    }
  ));

  return (
    <Card className="bg-[#0F0F23]/60 border-[#7C3AED]/20">
      <CardHeader>
        <CardTitle className={`text-white flex items-center gap-2 ${compact ? 'text-sm' : 'text-lg'}`}>
          <Flame className={`text-[#7C3AED] ${compact ? 'h-4 w-4' : 'h-5 w-5'}`} />
          Genre Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {normalizedPerformance.map((perf) => {
            const colors = gradeColors[perf.grade] || gradeColors['N/A'];
            return (
              <div
                key={perf.genre}
                className={`rounded-lg border ${colors.bg} ${colors.border} ${cellPadding} text-center group relative`}
                title={`${perf.genre}: ${perf.wins}/${perf.total_rounds} wins (${perf.win_rate}% grade: ${perf.grade})`}
                role="gridcell"
                aria-label={`${perf.genre} genre performance: grade ${perf.grade}, ${perf.wins} wins out of ${perf.total_rounds} rounds`}
              >
                <div className={`font-bold ${colors.text} ${gridSize}`}>{perf.grade}</div>
                {!compact && (
                  <div className="text-[10px] text-gray-400 truncate">{perf.genre}</div>
                )}
                {/* Hover tooltip */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-[#111126] border border-[#7C3AED]/30 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                  {perf.genre}: {perf.win_rate}% ({perf.wins}/{perf.total_rounds})
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-gray-400">
          <span>Grade Scale:</span>
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1">S</Badge>
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1">A</Badge>
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] px-1">B</Badge>
          <Badge className="bg-yellow-400/20 text-yellow-300 border-yellow-400/30 text-[10px] px-1">C</Badge>
          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px] px-1">D</Badge>
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] px-1">E</Badge>
          <Badge className="bg-red-900/20 text-red-500 border-red-900/30 text-[10px] px-1">F</Badge>
        </div>
      </CardContent>
    </Card>
  );
};
