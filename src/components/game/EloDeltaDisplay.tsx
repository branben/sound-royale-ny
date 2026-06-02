import React from 'react';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EloDelta {
  playerId: string;
  playerName: string;
  previousElo: number;
  newElo: number;
  delta: number;
  isWinner: boolean;
}

interface EloDeltaDisplayProps {
  eloDeltas: EloDelta[];
  className?: string;
}

export const EloDeltaDisplay: React.FC<EloDeltaDisplayProps> = ({
  eloDeltas,
  className
}) => {
  const getDeltaIcon = (delta: number) => {
    if (delta > 0) return <TrendingUp className="h-4 w-4" />;
    if (delta < 0) return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  const getDeltaColor = (delta: number) => {
    if (delta > 0) return 'text-green-500 border-green-500/30 bg-green-500/10';
    if (delta < 0) return 'text-red-500 border-red-500/30 bg-red-500/10';
    return 'text-gray-400 border-gray-500/30 bg-gray-500/10';
  };

  return (
    <div 
      data-testid="elo-delta-display"
      className={cn("space-y-2", className)}
    >
      <div className="text-sm font-semibold text-gray-300 mb-3">ELO Changes</div>
      {eloDeltas.map((delta) => (
        <div
          key={delta.playerId}
          className={cn(
            "flex items-center justify-between p-3 rounded-lg border",
            getDeltaColor(delta.delta)
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {getDeltaIcon(delta.delta)}
              <span className="font-medium">
                {delta.playerName}
                {delta.isWinner && <span className="ml-1 text-xs"> (Winner)</span>}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              {delta.previousElo} 
              <span className="mx-1">{'>'}</span>
              {delta.newElo}
            </span>
            <Badge 
              variant="outline" 
              className={cn(
                "px-2 py-1 text-xs font-bold",
                delta.delta > 0 && "border-green-500/50 text-green-500 bg-green-500/5",
                delta.delta < 0 && "border-red-500/50 text-red-500 bg-red-500/5",
                delta.delta === 0 && "border-gray-500/50 text-gray-400 bg-gray-500/5"
              )}
            >
              {delta.delta > 0 ? '+' : ''}{delta.delta}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
};
