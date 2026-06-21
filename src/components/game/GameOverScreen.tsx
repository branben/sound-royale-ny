import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { transitions } from '@/lib/motion';
import { TotalScoreDisplay } from './TotalScoreDisplay';
import { PlayAgainButton } from './PlayAgainButton';

interface GameOverScreenProps {
  isVisible: boolean;
  onReturnToLobby: () => void;
  onPlayAgain?: () => void;
  totalScore?: number;
  className?: string;
}

export const GameOverScreen: React.FC<GameOverScreenProps> = ({
  isVisible,
  onReturnToLobby,
  onPlayAgain,
  totalScore,
  className,
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          data-testid="game-over-screen"
          className={cn(
            'fixed inset-0 flex items-center justify-center z-50 bg-black/70',
            className,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={transitions.springBouncy}
          >
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-xs mx-4 text-center">
              <h2 className="text-2xl font-bold text-zinc-100 mb-1 font-['Righteous'] tracking-wider">
                GAME OVER
              </h2>

              <p className="text-sm text-zinc-400 mb-4">All players have left the room</p>

              {totalScore !== undefined && (
                <div className="mb-4">
                  <TotalScoreDisplay totalScore={totalScore} />
                </div>
              )}

              <div className="flex flex-col gap-2">
                {onPlayAgain && <PlayAgainButton onPlayAgain={onPlayAgain} />}
                <Button
                  onClick={onReturnToLobby}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded-lg h-10 text-sm"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Return to Lobby
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
