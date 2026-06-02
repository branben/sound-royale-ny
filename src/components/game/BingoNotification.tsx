import { useEffect, useState } from 'react';
import { Trophy, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '@/context/useGame';

interface BingoNotificationProps {
  isVisible: boolean;
  isDoubleBingo: boolean;
  onComplete: () => void;
}

export function BingoNotification({ isVisible, isDoubleBingo, onComplete }: BingoNotificationProps) {
  const [showAnimation, setShowAnimation] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShowAnimation(true);
      const timer = setTimeout(() => {
        setShowAnimation(false);
        setTimeout(onComplete, 500);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && showAnimation && (
        <motion.div
          data-testid="bingo-notification"
          initial={{ opacity: 0, scale: 0.9, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-40"
        >
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 0.6, repeat: 2, ease: 'easeInOut' }}
            className="bg-yellow-500/10 border-2 border-yellow-500/50 rounded-xl p-4 shadow-xl"
          >
            <div className="flex items-center justify-center gap-3">
              <motion.div
                initial={{ rotate: -20, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 12, delay: 0.1 }}
              >
                {isDoubleBingo ? (
                  <Trophy className="h-8 w-8 text-yellow-500" />
                ) : (
                  <Star className="h-8 w-8 text-yellow-400" />
                )}
              </motion.div>
              <div className="text-center">
                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-2xl font-bold text-foreground"
                >
                  {isDoubleBingo ? 'DOUBLE BINGO!' : 'BINGO!'}
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 }}
                  className="text-sm text-muted-foreground"
                >
                  {isDoubleBingo ? 'Amazing! Two lines completed!' : 'Line completed!'}
                </motion.p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
