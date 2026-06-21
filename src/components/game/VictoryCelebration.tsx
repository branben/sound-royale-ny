import { useEffect } from 'react';
import { Trophy, Crown, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { transitions } from '@/lib/motion';
import confetti from 'canvas-confetti';

interface VictoryCelebrationProps {
  winnerName: string;
  isVisible: boolean;
  onComplete: () => void;
}

export function VictoryCelebration({ winnerName, isVisible, onComplete }: VictoryCelebrationProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onComplete();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#22D3EE', '#f59e0b', '#10b981', '#ef4444'],
        });
        setTimeout(() => {
          confetti({
            particleCount: 50,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.65 },
            colors: ['#22D3EE', '#f59e0b', '#10b981'],
          });
          confetti({
            particleCount: 50,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.65 },
            colors: ['#22D3EE', '#f59e0b', '#10b981'],
          });
        }, 500);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <motion.div
        className="relative z-10 text-center space-y-4"
        initial={{ scale: 0.5, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={transitions.springBouncy}
      >
        <div className="bg-background border-2 border-primary rounded-2xl p-8 shadow-xl">
          <motion.div
            className="flex items-center justify-center gap-4 mb-4"
            initial={{ y: -40, rotate: -10 }}
            animate={{ y: 0, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
          >
            <Trophy className="h-16 w-16 text-yellow-500" />
            <div className="flex flex-col">
              <motion.h1
                className="text-4xl font-bold text-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                Victory!
              </motion.h1>
              <p className="text-xl text-muted-foreground">
                <span className="font-semibold text-primary">{winnerName}</span> wins the battle!
              </p>
            </div>
          </motion.div>

          <div className="flex items-center justify-center gap-2">
            <Crown className="h-8 w-8 text-yellow-500" />
            <Sparkles className="h-6 w-6 text-yellow-400" />
          </div>

          <div className="text-sm text-muted-foreground">
            <p>Amazing production work!</p>
            <p>Ready for the next round?</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
