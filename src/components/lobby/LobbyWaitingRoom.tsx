import React from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Gamepad2, Users, Crown, Loader2 } from 'lucide-react';

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isReady?: boolean;
}

interface LobbyWaitingRoomProps {
  roomCode: string;
  players: Player[];
  isHost: boolean;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  onToggleReady: () => void;
  onStartMatch: () => void;
}

export function LobbyWaitingRoom({
  roomCode,
  players,
  isHost,
  isReady,
  isLoading,
  error,
  onToggleReady,
  onStartMatch,
}: LobbyWaitingRoomProps) {
  return (
    <>
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
            <span>Players in lobby</span>
            <span className="text-primary">{players.length}/2</span>
          </div>

          <div className="space-y-2">
            {players.map((player, index) => (
              <div
                key={player.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-card/50 border border-border hover:border-muted-foreground transition-colors duration-200"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <Avatar className="h-10 w-10 border-2 border-primary/30">
                  <AvatarFallback className="bg-primary/20 text-primary font-semibold font-['Poppins']">
                    {player.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{player.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {player.isHost ? 'Host' : player.isReady ? '✓ Ready' : 'Not Ready'}
                  </p>
                </div>
                {player.isHost && <Crown className="h-5 w-5 text-yellow-500" />}
                {player.isReady && !player.isHost && (
                  <div className="h-3 w-3 rounded-full bg-green-500 " />
                )}
              </div>
            ))}
          </div>

          {Array.from({ length: 2 - players.length }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-[#64748B]/40 bg-[#64748B]/10"
            >
              <div className="h-10 w-10 rounded-full border-2 border-dashed border-[#64748B]/40 flex items-center justify-center">
                <Users className="h-5 w-5 text-[#64748B]/60" />
              </div>
              <p className="text-sm text-[#64748B]/70 italic">Waiting for player...</p>
            </div>
          ))}
        </div>
      )}

      {!isHost && players.length >= 1 && (
        <Button
          onClick={onToggleReady}
          className={`w-full h-12 text-lg font-semibold font-['Righteous'] tracking-wider uppercase transition-all duration-200 border-0 ${
            isReady ? 'bg-green-600 hover:bg-green-700' : 'bg-primary hover:opacity-90'
          }`}
          size="lg"
        >
          {isReady ? "✓ I'm Ready!" : 'Click When Ready'}
        </Button>
      )}

      {isHost && players.length >= 2 && (
        <Button
          data-testid="start-game"
          onClick={onStartMatch}
          className="w-full h-12 text-lg font-semibold font-['Righteous'] tracking-wider uppercase bg-primary hover:opacity-90 transition-all duration-200"
          size="lg"
        >
          <Gamepad2 className="mr-2 h-5 w-5" />
          Start Match
        </Button>
      )}

      <div className="pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          Room Code: <span className="font-mono text-foreground tracking-wider">{roomCode}</span>
        </p>
      </div>
    </>
  );
}
