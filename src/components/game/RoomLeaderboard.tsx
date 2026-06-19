import { Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Player } from '@/types/game';

interface RoomLeaderboardProps {
  producers: Player[];
  selectedPlayerId?: string | null;
  onSelectPlayer?: (playerId: string) => void;
  compact?: boolean;
}

export function RoomLeaderboard({
  producers,
  selectedPlayerId,
  onSelectPlayer,
  compact = false,
}: RoomLeaderboardProps) {
  const leaderboard = producers
    .map((player) => {
      const tiles = player.board?.tiles || [];
      const totalTiles = tiles.length;
      const completeTiles = tiles.filter((tile) => tile.status === 'complete').length;
      const pendingTiles = tiles.filter((tile) => tile.status === 'pending').length;
      const progress = totalTiles > 0 ? Math.round((completeTiles / totalTiles) * 100) : 0;
      return {
        player,
        completeTiles,
        pendingTiles,
        progress,
      };
    })
    .sort((a, b) => b.progress - a.progress || a.player.name.localeCompare(b.player.name));

  return (
    <Card data-testid="room-leaderboard" className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent className={compact ? 'space-y-2' : 'space-y-3'}>
        {leaderboard.map((entry, index) => {
          const row = (
            <>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  index === 0
                    ? 'bg-yellow-500 text-black'
                    : index === 1
                      ? 'bg-gray-400 text-black'
                      : index === 2
                        ? 'bg-orange-600 text-white'
                        : 'bg-muted text-muted-foreground'
                }`}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {entry.player.name}
                  {entry.player.isVerified && (
                    <span className="ml-2 text-xs text-green-500">Verified</span>
                  )}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${entry.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{entry.progress}%</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="text-green-400">{entry.completeTiles}</span>
                <span>/</span>
                <span className="text-yellow-400">{entry.pendingTiles}</span>
              </div>
            </>
          );

          if (!onSelectPlayer) {
            return (
              <div key={entry.player.id} className="flex items-center gap-3 rounded-lg p-2">
                {row}
              </div>
            );
          }

          return (
            <Button
              key={entry.player.id}
              type="button"
              variant="ghost"
              onClick={() => onSelectPlayer(entry.player.id)}
              className={`h-auto w-full justify-start gap-3 rounded-lg p-2 text-left hover:bg-muted/50 ${
                selectedPlayerId === entry.player.id ? 'bg-primary/10 ring-1 ring-primary' : ''
              }`}
            >
              {row}
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
