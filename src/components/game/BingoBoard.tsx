import { BoardData } from '@/types/game';
import { BingoTile } from './BingoTile';
import { cn } from '@/lib/utils';

interface BingoBoardProps {
  playerId: string;
  playerName: string;
  boardData: BoardData;
  onTileClick?: (tileId: string) => void;
  isInteractive?: boolean;
  isTileInteractive?: (tileId: string) => boolean;
  className?: string;
}

export function BingoBoard({
  playerId,
  playerName,
  boardData,
  onTileClick,
  isInteractive = false,
  isTileInteractive,
  className
}: BingoBoardProps) {
  const completedCount = boardData.tiles.filter(t => t.status === 'complete').length;
  const pendingCount = boardData.tiles.filter(t => t.status === 'pending').length;

  return (
    <div 
      data-testid="game-board"
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-[#7C3AED]/30 bg-[#1A1A2E]/80 p-4 backdrop-blur-md',
        'shadow-[0_0_40px_rgba(124,58,237,0.2),inset_0_0_60px_rgba(0,0,0,0.3)]',
        className
      )}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7C3AED]/20 border border-[#7C3AED]/30 text-[#7C3AED]">
            <span className="text-lg font-bold font-['Righteous']">{playerName.charAt(0)}</span>
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-[#E2E8F0] font-['Poppins']">{playerName}</h3>
            <p className="text-xs text-[#E2E8F0]/60">
              {completedCount}/9 complete
              {pendingCount > 0 && ` • ${pendingCount} pending`}
            </p>
          </div>
        </div>
        
        <div className="flex max-w-[5rem] shrink-0 flex-wrap justify-end gap-1 sm:max-w-none sm:flex-nowrap">
          {boardData.tiles.map((tile) => (
            <div
              key={tile.id}
              className={cn(
                'h-2 w-2 rounded-full transition-colors',
                tile.status === 'empty' && 'bg-[#334155]/50',
                tile.status === 'pending' && 'bg-[#F43F5E] animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.5)]',
                tile.status === 'complete' && 'bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.5)]'
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
            isInteractive={isInteractive && (isTileInteractive?.(tile.id) ?? true)}
            isActiveRoundTile={isTileInteractive?.(tile.id)}
          />
        ))}
      </div>
    </div>
  );
}
