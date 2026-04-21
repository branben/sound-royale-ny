import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoundIndicatorProps {
  currentRound: number;
  totalRounds?: number;
  nextRoundIn?: number;
  isPreparing: boolean;
  className?: string;
}

export const RoundIndicator: React.FC<RoundIndicatorProps> = ({
  currentRound,
  totalRounds,
  nextRoundIn,
  isPreparing,
  className
}) => {
  return (
    <Card 
      data-testid="round-indicator"
      className={cn(
        "bg-[#0F0F23]/60 border-[#7C3AED]/20",
        isPreparing && "animate-pulse border-[#7C3AED]/50",
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#7C3AED]" />
            <div>
              <div className="text-sm text-gray-400">
                {totalRounds ? `Round ${currentRound}/${totalRounds}` : 'Round'}
              </div>
              <div className="text-2xl font-bold text-white">
                {totalRounds ? `${currentRound}/${totalRounds}` : currentRound}
              </div>
            </div>
          </div>
          
          {isPreparing && (
            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-[#7C3AED] animate-spin" />
              <div className="text-right">
                <div className="text-xs text-gray-400">Next round in</div>
                <div className="text-lg font-bold text-[#7C3AED]">
                  {nextRoundIn !== undefined ? `${nextRoundIn}s` : '...'}
                </div>
              </div>
            </div>
          )}
        </div>
        
        {isPreparing && (
          <div className="mt-3 text-center text-sm text-gray-400">
            Preparing for next round...
          </div>
        )}
      </CardContent>
    </Card>
  );
};
