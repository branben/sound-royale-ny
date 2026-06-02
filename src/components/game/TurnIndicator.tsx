import { Player } from '@/types/game';
import { cn } from '@/lib/utils';
import { Mic2 } from 'lucide-react';

interface TurnIndicatorProps {
  currentPlayer: Player | null;
  activePlayerId?: string;
  activeGenre?: string;
  className?: string;
}

export function TurnIndicator({ 
  currentPlayer, 
  activePlayerId, 
  activeGenre, 
  className 
}: TurnIndicatorProps) {
  const isActive = currentPlayer?.id === activePlayerId;

  if (!currentPlayer) {
    return null;
  }

  return (
    <div className={cn(
      'flex items-center gap-3 p-4 rounded-lg bg-card/80 border border-border/50',
      '',
      isActive && 'ring-2 ring-primary/50 bg-primary/10',
      className
    )}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
        <Mic2 className="h-6 w-6 text-primary" />
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">
            Round prompt
          </h3>
        </div>
        
        <div className="flex items-center gap-2 mt-1">
          {isActive ? (
            <div className="flex items-center gap-1 text-green-500">
              <Mic2 className="h-4 w-4" />
              <span className="text-sm font-medium">
                {activeGenre || 'Unknown'}
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              Waiting for turn...
            </span>
          )}
        </div>
      </div>

      {isActive && (
        <div className="flex h-3 w-3 rounded-full bg-green-500 animate-pulse" />
      )}
    </div>
  );
}
