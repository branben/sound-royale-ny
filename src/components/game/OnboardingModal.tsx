import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Gamepad2, Users, Music, Trophy, Zap } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-background border-border text-white max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold font-['Righteous'] text-foreground">
            How to Play Sound Royale
          </DialogTitle>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Game Concept */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                <Music className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">What is Sound Royale?</h3>
            </div>
            <p className="text-gray-300 pl-13">
              A music bingo game where producers upload beats matching genres on a 3x3 board.
              Complete lines (horizontal, vertical, diagonal) to win rounds and climb the ELO rankings!
            </p>
          </div>

          {/* Roles */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Two Ways to Play</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 pl-13">
              <div className="rounded-lg border border-border bg-card p-4">
                <h4 className="font-semibold text-primary mb-2">🎵 Producer</h4>
                <p className="text-sm text-gray-300">
                  Upload your beats for each genre tile. First to complete a line wins!
                </p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-card p-4">
                <h4 className="font-semibold text-primary mb-2">👀 Spectator</h4>
                <p className="text-sm text-gray-300">
                  Watch matches and vote on the best beats when voting opens!
                </p>
              </div>
            </div>
          </div>

          {/* How to Win */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
                <Trophy className="h-5 w-5 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold">How to Win</h3>
            </div>
            <ul className="space-y-2 text-gray-300 pl-13">
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>Complete 3 tiles in a row (horizontal, vertical, or diagonal)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>Beat your opponent by completing lines first</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>Earn ELO points for wins and climb the leaderboard</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>Unlock titles: SWEEPER, JACKPOT, CHECKED_IN</span>
              </li>
            </ul>
          </div>

          {/* ELO System */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/20">
                <Zap className="h-5 w-5 text-yellow-500" />
              </div>
              <h3 className="text-lg font-semibold">ELO Ranking System</h3>
            </div>
            <p className="text-gray-300 pl-13">
              Ranked matches with spectator voting. Win to gain ELO, lose to drop.
              Your ELO syncs to Discord servers for role assignments and bragging rights!
            </p>
          </div>

          {/* Quick Tips */}
          <div className="rounded-lg border border-primary/20 bg-card p-4">
            <h4 className="font-semibold text-primary mb-3">Quick Tips</h4>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>• Enter your name to get started</li>
              <li>• Create a room to host, or join with a 4-digit code</li>
              <li>• Spectators can join anytime to watch and vote</li>
              <li>• Check the leaderboard to see top producers</li>
            </ul>
          </div>

          {/* CTA */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              className="flex-1 bg-primary hover:opacity-90"
            >
              <Gamepad2 className="mr-2 h-4 w-4" />
              Let's Play!
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
