import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { transitions } from '@/lib/motion';
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
  className,
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          data-testid="winner-announcement"
          className={cn(
            'fixed inset-0 flex items-center justify-center z-50 bg-black/70',
            className,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm text-center shadow-xl"
            initial={{ scale: 0.5, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.5, y: 30, opacity: 0 }}
            transition={transitions.springBouncy}
          >
            <div className="flex justify-center mb-3">
              <Trophy className="h-12 w-12 text-yellow-500" />
            </div>

            <h2 className="text-2xl font-bold text-yellow-500 mb-1 font-['Righteous'] tracking-wider">
              WINNER!
            </h2>

            <div className="text-lg font-semibold text-zinc-100 mb-2">
              {winnerName}
            </div>

            {score !== undefined && (
              <div className="text-sm text-zinc-400 mb-4">
                Score: <span className="text-yellow-400 font-bold">{score}</span>
              </div>
            )}

            {eloDeltas && eloDeltas.length > 0 && (
              <div className="mb-4">
                <EloDeltaDisplay eloDeltas={eloDeltas} />
              </div>
            )}

            <div className="text-xs text-zinc-500">
              Congratulations on your victory!
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
