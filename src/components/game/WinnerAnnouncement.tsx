import React from 'react';
import { Trophy, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EloDeltaDisplay } from './EloDeltaDisplay';
import type { EloDelta } from '@/types/game';

interface WinnerAnnouncementProps {
  winnerName: string;
  score?: number;
  eloDeltas?: EloDelta[];
  isVisible: boolean;
  className?: string;
}

export const WinnerAnnouncement: React.FC<WinnerAnnouncementProps> = ({
  winnerName,
  score,
  eloDeltas,
  isVisible,
  className
}) => {
  if (!isVisible) return null;

  return (
    <div
      data-testid="winner-announcement"
      className={cn(
        "fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300",
        className
      )}
    >
      <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-2 border-yellow-500/50 rounded-2xl p-8 max-w-md text-center animate-in zoom-in duration-500 shadow-[0_0_50px_rgba(234,179,8,0.5)]">
        <div className="flex justify-center mb-4">
          <div className="relative">
            <Trophy className="h-16 w-16 text-yellow-500 animate-bounce" />
            <Sparkles className="h-8 w-8 text-yellow-400 absolute -top-2 -right-2 animate-pulse" />
          </div>
        </div>

        <h2 className="text-4xl font-bold text-yellow-500 mb-2 font-['Righteous'] tracking-wider">
          WINNER!
        </h2>

        <div className="text-2xl font-semibold text-white mb-4">
          {winnerName}
        </div>

        {score !== undefined && (
          <div className="text-xl text-gray-300 mb-6">
            Score: <span className="text-yellow-400 font-bold">{score}</span>
          </div>
        )}

        {eloDeltas && eloDeltas.length > 0 && (
          <div className="mb-6">
            <EloDeltaDisplay eloDeltas={eloDeltas} />
          </div>
        )}

        <div className="text-sm text-gray-400">
          Congratulations on your victory!
        </div>
      </div>
    </div>
  );
};
