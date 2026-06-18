import React from 'react';
import { CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gamepad2, HelpCircle, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LobbyHeaderProps {
  onShowOnboarding: () => void;
}

export function LobbyHeader({ onShowOnboarding }: LobbyHeaderProps) {
  return (
    <CardHeader className="text-center space-y-3 pb-2">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 border-2 border-primary/20">
        <Gamepad2 className="h-10 w-10 text-primary" />
      </div>
      <div>
        <h1 className="text-4xl md:text-5xl font-['Righteous'] tracking-tight text-primary">
          SOUND ROYALE
        </h1>
        <p className="text-sm text-muted-foreground mt-1 italic">
          The High-Stakes Game Show for Music Producers
        </p>
      </div>
      <div className="flex items-center justify-center gap-3 pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onShowOnboarding}
          className="text-muted-foreground hover:text-primary hover:bg-primary/10"
        >
          <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
          How to Play
        </Button>
        <Link to="/leaderboard">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary hover:bg-primary/10">
            <Trophy className="mr-1.5 h-3.5 w-3.5" />
            Leaderboard
          </Button>
        </Link>
      </div>
    </CardHeader>
  );
}
