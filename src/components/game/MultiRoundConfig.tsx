import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MIN_ROUNDS, MAX_ROUNDS } from '@/types/game';

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
  className,
}) => {
  const handleRoundsChange = (newRounds: number) => {
    if (isHost && onRoundsChange && newRounds >= MIN_ROUNDS && newRounds <= MAX_ROUNDS) {
      onRoundsChange(newRounds);
    }
  };

  return (
    <Card
      data-testid="multi-round-config"
      className={cn('bg-background/60 border-primary/20', className)}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm text-gray-400">Game Setup</div>
              <div className="text-lg font-bold text-white">
                {totalRounds} {totalRounds === 1 ? 'Round' : 'Rounds'}
              </div>
            </div>
          </div>

          {totalRounds > 1 && (
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <div className="text-right">
                <div className="text-xs text-gray-400">Current</div>
                <div className="text-lg font-bold text-primary">
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
                  variant={totalRounds === rounds ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleRoundsChange(rounds)}
                  className={cn(
                    'px-3 py-1 text-xs',
                    totalRounds === rounds
                      ? 'bg-primary text-primary-foreground'
                      : 'border-primary/30 text-muted-foreground hover:border-primary/50',
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
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/30">
              Multi-round game
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
