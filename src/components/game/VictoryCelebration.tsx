import { useEffect, useState } from 'react';
import { Trophy, Crown, Sparkles } from 'lucide-react';
import { useGame } from '@/context/GameContext';

interface VictoryCelebrationProps {
  winnerName: string;
  isVisible: boolean;
  onComplete: () => void;
}

export function VictoryCelebration({ winnerName, isVisible, onComplete }: VictoryCelebrationProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (isVisible) {
      showVictoryCelebration(winnerName);
      onComplete();
    }
  }, [isVisible, winnerName, onComplete]);
  
  useEffect(() => {
    if (isVisible) {
      setShowConfetti(true);
      const timer = setTimeout(() => {
        setShowConfetti(false);
        setTimeout(onComplete, 2000); // Allow celebration to complete
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-1000" />
      
      {/* Victory Message */}
      <div className="relative z-10 text-center space-y-4 animate-bounce-in">
        <div className="bg-background/95 border-2 border-primary rounded-2xl p-8 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="animate-pulse-glow">
              <Trophy className="h-16 w-16 text-yellow-500" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-4xl font-bold text-foreground animate-bounce-in">Victory!</h1>
              <p className="text-xl text-muted-foreground">
                <span className="font-semibold text-primary">{winnerName}</span> wins the battle!
              </p>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-2">
            <Crown className="h-8 w-8 text-yellow-500 animate-bounce-in" />
            <Sparkles className="h-6 w-6 text-yellow-400 animate-pulse" />
          </div>
          
          <div className="text-sm text-muted-foreground">
            <p className="animate-pulse-glow">Amazing production work!</p>
            <p>Ready for the next round?</p>
          </div>
        </div>
      </div>
      
      {/* Confetti Effect */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-yellow-400/20 rounded-full blur-xl animate-pulse" />
          <div className="absolute top-1/3 right-1/4 w-24 h-24 bg-red-400/20 rounded-full blur-lg animate-bounce-in" />
          <div className="absolute bottom-1/4 left-1/3 w-28 h-28 bg-blue-400/20 rounded-full blur-lg animate-bounce-in" />
          <div className="absolute top-1/2 right-1/3 w-20 h-20 bg-green-400/20 rounded-full blur-md animate-pulse" />
          <div className="absolute bottom-1/3 right-1/4 w-16 h-16 bg-purple-400/20 rounded-full blur-sm animate-bounce-in" />
        </div>
      )}
    </div>
  );
}