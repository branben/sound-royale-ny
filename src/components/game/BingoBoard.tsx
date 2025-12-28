import { BoardData } from '@/types/game';
import { BingoTile } from './BingoTile';
import { cn } from '@/lib/utils';

interface BingoBoardProps {
  playerId: string;
  playerName: string;
  boardData: BoardData;
  onTileClick?: (tileId: string) => void;
  isInteractive?: boolean;
  className?: string;
}

export function BingoBoard({
  playerId,
  playerName,
  boardData,
  onTileClick,
  isInteractive = false,
  className
}: BingoBoardProps) {
  const completedCount = boardData.tiles.filter(t => t.status === 'complete').length;
  const pendingCount = boardData.tiles.filter(t => t.status === 'pending').length;

  return (
    <div className={cn(
      'flex flex-col gap-4 rounded-xl border border-border/30 bg-card/40 p-4 backdrop-blur-md',
      'shadow-xl',
      className
    )}>
      {/* Player Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
            <span className="text-lg font-bold">{playerName.charAt(0)}</span>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{playerName}</h3>
            <p className="text-xs text-muted-foreground">
              {completedCount}/9 complete
              {pendingCount > 0 && ` • ${pendingCount} pending`}
            </p>
          </div>
        </div>
        
        {/* Progress indicator */}
        <div className="flex gap-1">
          {boardData.tiles.map((tile) => (
            <div
              key={tile.id}
              className={cn(
                'h-2 w-2 rounded-full transition-colors',
                tile.status === 'empty' && 'bg-tile-empty/50',
                tile.status === 'pending' && 'bg-tile-pending animate-pulse',
                tile.status === 'complete' && 'bg-tile-complete'
              )}
            />
          ))}
        </div>
      </div>

      {/* 3x3 Grid */}
      <div className="grid grid-cols-3 gap-2">
        {boardData.tiles.map((tile) => (
          <BingoTile
            key={tile.id}
            tile={tile}
            onClick={() => onTileClick?.(tile.id)}
            isInteractive={isInteractive}
          />
        ))}
      </div>
    </div>
  );
}
