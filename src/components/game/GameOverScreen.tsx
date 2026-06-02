import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Home, XCircle } from 'lucide-react';
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
  className
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          data-testid="game-over-screen"
          className={cn(
            "fixed inset-0 flex items-center justify-center z-50 bg-black/80 backdrop-blur-sm",
            className
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
            <Card className="bg-background/95 border-destructive/30 max-w-md w-full mx-4">
        <CardContent className="p-8 text-center">
          <div className="flex justify-center mb-4">
            <XCircle className="h-16 w-16 text-red-500" />
          </div>
          
          <h2 className="text-3xl font-bold text-red-500 mb-2 font-['Righteous'] tracking-wider">
            GAME OVER
          </h2>
          
          <p className="text-gray-400 mb-6">
            All players have left the room
          </p>
          
          {totalScore !== undefined && (
            <div className="mb-6">
              <TotalScoreDisplay totalScore={totalScore} />
            </div>
          )}
          
          
          <div className="flex flex-col gap-3">
            {onPlayAgain && (
              <PlayAgainButton onPlayAgain={onPlayAgain} />
            )}
            <Button
              onClick={onReturnToLobby}
              className="w-full bg-primary hover:bg-primary/90 text-white"
              size="lg"
            >
              <Home className="h-5 w-5 mr-2" />
              Return to Lobby
            </Button>
          </div>
        </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
