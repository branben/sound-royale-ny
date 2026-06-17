import React from 'react';
import { CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gamepad2, HelpCircle, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LobbyHeaderProps {
  onShowOnboarding: () => void;
}

export function LobbyHeader({ onShowOnboarding }: LobbyHeaderProps) {
  return (
    <CardHeader className="text-center space-y-4">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Gamepad2 className="h-8 w-8 text-primary" />
      </div>
      <CardTitle className="text-3xl font-bold tracking-tight font-['Righteous'] text-foreground">
        Sound Royale
      </CardTitle>
      <CardDescription className="text-foreground/70">
        Enter a room code to join the battle
      </CardDescription>
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onShowOnboarding}
          className="text-primary hover:text-primary hover:bg-primary/10"
        >
          <HelpCircle className="mr-2 h-4 w-4" />
          How to Play
        </Button>
        <Link to="/leaderboard">
          <Button variant="ghost" size="sm" className="text-primary hover:text-primary hover:bg-primary/10">
            <Trophy className="mr-2 h-4 w-4" />
            View Leaderboard
          </Button>
        </Link>
      </div>
    </CardHeader>
  );
}
