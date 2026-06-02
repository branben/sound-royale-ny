import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Sparkles } from 'lucide-react';
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
  className
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          data-testid="winner-announcement"
          className={cn(
            "fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm",
            className
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="bg-background border-2 border-yellow-500/50 rounded-2xl p-8 max-w-md text-center shadow-xl"
            initial={{ scale: 0.5, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.5, y: 30, opacity: 0 }}
            transition={transitions.springBouncy}
          >
            <motion.div
              className="flex justify-center mb-4"
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
            >
              <div className="relative">
                <Trophy className="h-16 w-16 text-yellow-500" />
                <Sparkles className="h-8 w-8 text-yellow-400 absolute -top-2 -right-2" />
              </div>
            </motion.div>

            <motion.h2
              className="text-4xl font-bold text-yellow-500 mb-2 font-['Righteous'] tracking-wider"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              WINNER!
            </motion.h2>

            <motion.div
              className="text-2xl font-semibold text-foreground mb-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {winnerName}
            </motion.div>

            {score !== undefined && (
              <motion.div
                className="text-xl text-muted-foreground mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                Score: <span className="text-yellow-400 font-bold">{score}</span>
              </motion.div>
            )}

            {eloDeltas && eloDeltas.length > 0 && (
              <div className="mb-6">
                <EloDeltaDisplay eloDeltas={eloDeltas} />
              </div>
            )}

            <motion.div
              className="text-sm text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Congratulations on your victory!
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
