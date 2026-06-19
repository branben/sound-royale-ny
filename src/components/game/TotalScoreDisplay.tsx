import React from 'react';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TotalScoreDisplayProps {
  totalScore: number;
  className?: string;
}

export const TotalScoreDisplay: React.FC<TotalScoreDisplayProps> = ({ totalScore, className }) => {
  return (
    <div
      data-testid="total-score"
      className={cn(
        'flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-lg border border-primary/30',
        className,
      )}
    >
      <Trophy className="h-5 w-5 text-primary" />
      <span className="text-lg font-bold text-primary">{totalScore}</span>
      <span className="text-sm text-muted-foreground">Total Score</span>
    </div>
  );
};
