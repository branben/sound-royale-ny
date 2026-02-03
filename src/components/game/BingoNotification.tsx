import { useEffect, useState } from 'react';
import { Trophy, Star } from 'lucide-react';
import { useGame } from '@/context/GameContext';

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
        setTimeout(onComplete, 500); // Allow animation to complete
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-40 transition-all duration-500 ${
      showAnimation ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
    }`}>
      <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-2 border-yellow-400/50 rounded-xl p-4 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-center gap-3">
          <div className={`${isDoubleBingo ? 'animate-pulse-glow' : 'animate-bounce'}`}>
            {isDoubleBingo ? (
              <Trophy className="h-8 w-8 text-yellow-500" />
            ) : (
              <Star className="h-8 w-8 text-yellow-400" />
            )}
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">
              {isDoubleBingo ? 'DOUBLE BINGO!' : 'BINGO!'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isDoubleBingo ? 'Amazing! Two lines completed!' : 'Line completed!'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}