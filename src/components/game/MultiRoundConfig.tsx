import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MultiRoundConfigProps {
  totalRounds?: number;
  currentRound?: number;
  isHost?: boolean;
  onRoundsChange?: (rounds: number) => void;
  className?: string;
}

export const MultiRoundConfig: React.FC<MultiRoundConfigProps> = ({
  totalRounds = 1,
  currentRound = 1,
  isHost = false,
  onRoundsChange,
  className
}) => {
  const handleRoundsChange = (newRounds: number) => {
    if (isHost && onRoundsChange && newRounds >= 1 && newRounds <= 10) {
      onRoundsChange(newRounds);
    }
  };

  return (
    <Card 
      data-testid="multi-round-config"
      className={cn(
        "bg-[#0F0F23]/60 border-[#7C3AED]/20",
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-[#7C3AED]" />
            <div>
              <div className="text-sm text-gray-400">Game Setup</div>
              <div className="text-lg font-bold text-white">
                {totalRounds} {totalRounds === 1 ? 'Round' : 'Rounds'}
              </div>
            </div>
          </div>
          
          {totalRounds > 1 && (
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-[#F43F5E]" />
              <div className="text-right">
                <div className="text-xs text-gray-400">Current</div>
                <div className="text-lg font-bold text-[#F43F5E]">
                  Round {currentRound}/{totalRounds}
                </div>
              </div>
            </div>
          )}
        </div>
        
        {isHost && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-sm text-gray-400">Rounds:</span>
            <div className="flex gap-1">
              {[1, 3, 5, 7, 10].map((rounds) => (
                <Button
                  key={rounds}
                  variant={totalRounds === rounds ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleRoundsChange(rounds)}
                  className={cn(
                    "px-3 py-1 text-xs",
                    totalRounds === rounds 
                      ? "bg-[#7C3AED] text-white" 
                      : "border-[#7C3AED]/30 text-gray-400 hover:border-[#7C3AED]/50"
                  )}
                >
                  {rounds}
                </Button>
              ))}
            </div>
          </div>
        )}
        
        {totalRounds > 1 && !isHost && (
          <div className="mt-3">
            <Badge variant="secondary" className="bg-[#7C3AED]/10 text-[#7C3AED] border-[#7C3AED]/30">
              Multi-round game
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
