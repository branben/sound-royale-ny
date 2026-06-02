import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BoardData } from '@/types/game';
import { cn } from '@/lib/utils';

interface PlayerBoardDisplayProps {
  board: BoardData;
  playerName: string;
  className?: string;
}

export const PlayerBoardDisplay: React.FC<PlayerBoardDisplayProps> = ({
  board,
  playerName,
  className
}) => {
  return (
    <Card 
      data-testid="player-board-display"
      className={cn('bg-background/60 border-primary/20', className)}
    >
      <CardHeader>
        <CardTitle className="text-lg text-white">{playerName}'s Board</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {board.tiles.slice(0, 9).map((tile, index) => (
            <div
              key={tile.id}
              className={cn(
                "aspect-square rounded-md border flex items-center justify-center text-xs font-medium",
                tile.status === 'complete'
                  ? "bg-primary/30 border-primary/50 text-primary"
                  : "bg-gray-800/50 border-gray-700/50 text-gray-500"
              )}
            >
              {tile.status === 'complete' ? '✓' : tile.genre?.slice(0, 3) || index + 1}
            </div>
          ))}
        </div>
        <div className="mt-3 text-center text-sm text-gray-400">
          {board.tiles.filter(t => t.status === 'complete').length} / {board.tiles.length} tiles complete
        </div>
      </CardContent>
    </Card>
  );
};
