import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend } from 'recharts';
import { Player, GenrePerformance } from '@/types/game';
import { Flame } from 'lucide-react';

interface PlayerStatsRadarProps {
  player: Player;
  genrePerformance: GenrePerformance[];
  roomGenres?: string[]; // Optional: genres from current room's theme
}

const CORE_GENRES = ['phonk', 'trap', 'lofi', 'house', 'drill', 'rnb', 'edm', 'jazz', 'ambient'];

export const PlayerStatsRadar: React.FC<PlayerStatsRadarProps> = ({ player, genrePerformance, roomGenres }) => {
  // If roomGenres provided, filter to only those genres
  if (roomGenres && roomGenres.length > 0) {
    // Deduplicate room genres (case-insensitive)
    const uniqueRoomGenres = Array.from(new Set(roomGenres.map(g => g.toLowerCase())));

    // Create a map of genre performance by lowercase genre name for quick lookup
    const performanceMap = new Map(
      genrePerformance.map(g => [g.genre.toLowerCase(), g])
    );

    // Build chart data for all room genres, filling in 0 for missing data
    const chartData = uniqueRoomGenres.slice(0, 9).map(genreLower => {
      const perf = performanceMap.get(genreLower);
      const winsPercent = perf && perf.total_rounds > 0 ? (perf.wins / perf.total_rounds) * 100 : 0;
      const lossesPercent = perf && perf.total_rounds > 0 ? ((perf.total_rounds - perf.wins) / perf.total_rounds) * 100 : 0;
      return {
        axis: perf ? perf.genre : genreLower,
        wins: winsPercent,
        losses: lossesPercent,
        isLegacy: perf?.is_legacy ?? false,
      };
    });

    const chartConfig = {
      wins: {
        label: 'Wins',
        color: '#3b82f6',
      },
      losses: {
        label: 'Losses',
        color: '#ef4444',
      },
    };

    return (
      <Card className="bg-background/60 border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Flame className="h-5 w-5 text-primary" />
            Genre Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="aspect-square w-full">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={chartData}>
                <PolarGrid stroke="hsl(var(--primary))" strokeDasharray="3 3" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: '#fff', fontSize: 10 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: '#9ca3af', fontSize: 9 }}
                />
                <Radar
                  name="Wins"
                  dataKey="wins"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={0}
                />
                <Radar
                  name="Losses"
                  dataKey="losses"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fillOpacity={0}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  content={({ payload }: any) => (
                    <div className="flex justify-center gap-4 text-xs">
                      {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center gap-1">
                          <div
                            className="w-3 h-3"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="text-white">{entry.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                />
                <ChartTooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>
    );
  }

  // Original logic for historical view (no room genres provided)
  // Separate core and historical genres
  const coreGenres = genrePerformance.filter(g => !g.is_legacy);
  const historicalGenres = genrePerformance.filter(g => g.is_legacy);

  // Sort historical by total_rounds descending
  const sortedHistorical = [...historicalGenres].sort((a, b) => b.total_rounds - a.total_rounds);

  // Take up to 9 genres total (matching bingo board size)
  const maxGenreAxes = 9;
  let selectedGenres = [...coreGenres];
  const overflowCount = historicalGenres.length - Math.max(0, maxGenreAxes - coreGenres.length);

  if (selectedGenres.length < maxGenreAxes && sortedHistorical.length > 0) {
    const remainingSlots = maxGenreAxes - selectedGenres.length;
    selectedGenres = [...selectedGenres, ...sortedHistorical.slice(0, remainingSlots)];
  }

  // Build chart data with wins and losses per genre
  const chartData = selectedGenres.map(genre => {
    const winsPercent = genre.total_rounds > 0 ? (genre.wins / genre.total_rounds) * 100 : 0;
    const lossesPercent = genre.total_rounds > 0 ? ((genre.total_rounds - genre.wins) / genre.total_rounds) * 100 : 0;
    return {
      axis: genre.is_legacy ? `${genre.genre} (legacy)` : genre.genre,
      wins: winsPercent,
      losses: lossesPercent,
      isLegacy: genre.is_legacy,
    };
  });

  const chartConfig = {
    wins: {
      label: 'Wins',
      color: '#3b82f6', // blue
    },
    losses: {
      label: 'Losses',
      color: '#ef4444', // red
    },
  };

  return (
    <Card className="bg-background/60 border-primary/20">
      <CardHeader>
        <CardTitle className="text-lg text-white flex items-center gap-2">
          <Flame className="h-5 w-5 text-primary" />
          Genre Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-square w-full">
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={chartData}>
              <PolarGrid stroke="hsl(var(--primary))" strokeDasharray="3 3" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fill: '#fff', fontSize: 10 }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: '#9ca3af', fontSize: 9 }}
              />
              <Radar
                name="Wins"
                dataKey="wins"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={0}
              />
              <Radar
                name="Losses"
                dataKey="losses"
                stroke="#ef4444"
                strokeWidth={2}
                fillOpacity={0}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                content={({ payload }: any) => (
                  <div className="flex justify-center gap-4 text-xs">
                    {payload.map((entry: any, index: number) => (
                      <div key={index} className="flex items-center gap-1">
                        <div
                          className="w-3 h-3"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-white">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              />
              <ChartTooltip content={<CustomTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

export const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-primary/30 bg-card px-3 py-2 text-xs text-white">
      <div className="font-medium mb-1">{payload[0].payload.axis}</div>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2">
          <div
            className="w-2 h-2"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-gray-300">
            {entry.name}: {entry.value.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
};
