import { Tile } from '@/types/game';
import { cn } from '@/lib/utils';
import { Music, Loader2, Check } from 'lucide-react';

interface BingoTileProps {
  tile: Tile;
  onClick: () => void;
  isInteractive?: boolean;
}

export function BingoTile({ tile, onClick, isInteractive = false }: BingoTileProps) {
  const statusStyles = {
    empty: 'bg-tile-empty/50 border-border/50 hover:border-primary/50',
    pending: 'bg-tile-pending/20 border-tile-pending animate-pulse-glow',
    complete: 'bg-tile-complete/20 border-tile-complete'
  };

  const iconStyles = {
    empty: 'text-muted-foreground',
    pending: 'text-tile-pending',
    complete: 'text-tile-complete'
  };

  return (
    <button
      onClick={onClick}
      disabled={!isInteractive && tile.status !== 'empty'}
      className={cn(
        'relative aspect-square w-full rounded-lg border-2 backdrop-blur-sm transition-all duration-300',
        'flex flex-col items-center justify-center gap-2 p-2',
        'group cursor-pointer',
        statusStyles[tile.status],
        isInteractive && tile.status === 'empty' && 'hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/20'
      )}
    >
      {/* Status Icon */}
      <div className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full',
        'bg-background/50 backdrop-blur-sm transition-all duration-300',
        tile.status === 'pending' && 'animate-spin-slow'
      )}>
        {tile.status === 'empty' && (
          <Music className={cn('h-5 w-5', iconStyles.empty)} />
        )}
        {tile.status === 'pending' && (
          <Loader2 className={cn('h-5 w-5', iconStyles.pending)} />
        )}
        {tile.status === 'complete' && (
          <Check className={cn('h-5 w-5', iconStyles.complete)} />
        )}
      </div>

      {/* Genre Label */}
      <span className={cn(
        'text-xs font-semibold uppercase tracking-wider',
        tile.status === 'empty' && 'text-muted-foreground',
        tile.status === 'pending' && 'text-tile-pending',
        tile.status === 'complete' && 'text-tile-complete'
      )}>
        {tile.genre}
      </span>

      {/* Glow effect for complete tiles */}
      {tile.status === 'complete' && (
        <div className="absolute inset-0 rounded-lg bg-tile-complete/10 blur-sm" />
      )}
    </button>
  );
}
