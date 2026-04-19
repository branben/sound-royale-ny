import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Crown, X, Clock, Trophy } from 'lucide-react';
import { Player } from '@/types/game';
import { cn } from '@/lib/utils';
import { useGame } from '@/context/useGame';
import { useUser } from '@/context/UserContext';
import { useMemo, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { gameApi } from '@/services/api';
import { VictoryCelebration } from '@/components/game/VictoryCelebration';

interface GameInfoProps {
  roomId: string;
  currentPlayerName?: string;
}

export function GameInfo({ roomId, currentPlayerName }: GameInfoProps) {
  const { gameState } = useGame();
  const { userSession } = useUser();
  const [showVictory, setShowVictory] = useState(false);
  const [roundTimeLeft, setRoundTimeLeft] = useState<number | null>(null);
  const timeUpAnnouncedRef = useRef<number | null>(null);
  
  const ROUND_DURATION = 300;
  
  // Consolidated timer effect: handles reset, countdown, and announcement
  useEffect(() => {
    // Handle game status changes
    if (gameState.status !== 'playing') {
      setRoundTimeLeft(null);
      timeUpAnnouncedRef.current = null;
      return;
    }

    // Reset timer for new round
    setShowVictory(false);
    setRoundTimeLeft(ROUND_DURATION);
    timeUpAnnouncedRef.current = null;

    // Set up countdown interval
    const intervalId = setInterval(() => {
      setRoundTimeLeft(prev => {
        if (prev === null) return prev;
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(intervalId);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [gameState.status, gameState.currentRound]);

  // Timer announcement effect
  useEffect(() => {
    if (gameState.status !== 'playing') {
      return;
    }

    if (
      roundTimeLeft === 0 &&
      timeUpAnnouncedRef.current !== gameState.currentRound
    ) {
      timeUpAnnouncedRef.current = gameState.currentRound;
      toast.message("Time's up — calculating winner...");
    }
  }, [gameState.status, gameState.currentRound, roundTimeLeft]);

  // Victory effect
  useEffect(() => {
    if (gameState.status === 'finished' && gameState.winner) {
      setShowVictory(true);
    }
  }, [gameState.status, gameState.winner]);

  const isHost = useMemo(() => {
    if (!userSession.playerSecret || !gameState.players) return false;
    const players = Object.values(gameState.players);
    const currentPlayer = players.find(p => p.id === userSession.playerId);
    return currentPlayer?.isHost ?? false;
  }, [gameState.players, userSession.playerId, userSession.playerSecret]);

  const handleResetGame = async () => {
    if (!userSession.playerSecret) return;
    
    try {
      const result = await gameApi.resetGame(roomId, userSession.playerSecret);
      const nextRound =
        typeof result?.round === 'number' ? result.round : gameState.currentRound;
      toast.success(`Round ${nextRound} starting! Get ready!`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(error.response?.data?.error || 'Failed to reset game');
    }
  };

  const handleCelebrationComplete = () => {
    setShowVictory(false);
  };

  const handleKickPlayer = async (playerId: string, playerName: string) => {
    if (!userSession.playerSecret) return;
    
    try {
      await gameApi.kickPlayer(roomId, playerId, userSession.playerSecret);
      toast.success(`${playerName} has been removed from the room`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(error.response?.data?.error || 'Failed to kick player');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  

  if (!gameState) {
    return (
      <Card className="border-border/30 bg-card/60 backdrop-blur-xl">
        <CardContent className="p-4">
          <p className="text-muted-foreground">Loading game info...</p>
        </CardContent>
      </Card>
    );
  }

  const players = Object.values(gameState.players);
  const spectators = players.filter((p: Player) => p.name?.startsWith('Spectator '));
  const activePlayers = players.filter((p: Player) => !p.name?.startsWith('Spectator '));

  return (
    <Card className="border-[#7C3AED]/30 bg-[#0F0F23]/80 backdrop-blur-xl mb-6 shadow-[0_0_30px_rgba(124,58,237,0.15)]">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Users className="h-4 w-4" />
              Players ({activePlayers.length})
            </div>
            {activePlayers.map((player: Player) => (
              <div key={player.id} className={cn(
                "flex items-center justify-between p-2 rounded-lg bg-[#0F0F23]/60 border border-[#7C3AED]/20 hover:border-[#7C3AED]/40 transition-all duration-200",
                player.name === currentPlayerName && "ring-2 ring-[#7C3AED]/50 shadow-[0_0_15px_rgba(124,58,237,0.3)]"
              )}>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-sm font-['Poppins']",
                    player.name === currentPlayerName && "font-semibold text-[#7C3AED] neon-text"
                  )}>
                    {player.name} {player.name === currentPlayerName && "(You)"}
                  </span>
                  {gameState.winner === player.id && (
                    <Crown className="h-4 w-4 text-[#EAB308] crown-glow drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]" />
                  )}
                </div>
                {isHost && player.id !== userSession.playerId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleKickPlayer(player.id, player.name)}
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Users className="h-4 w-4" />
              Spectators ({spectators.length})
            </div>
            {spectators.map((spectator: Player) => (
              <div key={spectator.id} className="flex items-center justify-between text-sm p-2 rounded bg-background/50">
                <span>{spectator.name}</span>
                {isHost && spectator.id !== userSession.playerId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleKickPlayer(spectator.id, spectator.name)}
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="font-semibold text-foreground">Game Status</div>
            <div className="flex items-center gap-2">
              <div className={cn(
                "px-3 py-1 rounded-full text-sm font-medium font-['Righteous'] tracking-wider uppercase transition-all duration-500 border",
                gameState.status === 'lobby' && 'bg-[#EAB308]/10 border-[#EAB308]/50 text-[#EAB308]',
                gameState.status === 'playing' && 'bg-[#7C3AED]/10 border-[#7C3AED]/50 text-[#7C3AED] animate-pulse shadow-[0_0_15px_rgba(124,58,237,0.3)]',
                gameState.status === 'finished' && 'bg-[#10B981]/10 border-[#10B981]/50 text-[#10B981] animate-bounce-in shadow-[0_0_15px_rgba(16,185,129,0.3)]'
              )}>
                {gameState.status === 'lobby' && 'Waiting'}
                {gameState.status === 'playing' && 'Live'}
                {gameState.status === 'finished' && 'Done'}
              </div>
              <div className="text-sm text-muted-foreground">
                <div className="capitalize font-medium">
                  {gameState.status === 'lobby' && 'Waiting for players to join'}
                  {gameState.status === 'playing' && activePlayers.length >= 2 && 'Both players are creating beats!'}
                  {gameState.status === 'playing' && activePlayers.length < 2 && 'Waiting for more players to join...'}
                  {gameState.status === 'finished' && (
                    <span className="animate-pulse-glow">
                      🎉 {players.find((p: Player) => p.id === gameState.winner)?.name} wins the battle!
                    </span>
                  )}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                <div className="capitalize font-medium">
                  {gameState.status === 'lobby' && 'Waiting for players to join'}
                  {gameState.status === 'playing' && 'Battle in Progress'}
                  {gameState.status === 'finished' && 'Battle Completed'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {gameState.status === 'lobby' && 'Waiting for at least 2 players to start the game'}
                  {gameState.status === 'playing' && activePlayers.length >= 2 && 'Both players are creating beats!'}
                  {gameState.status === 'playing' && activePlayers.length < 2 && 'Waiting for more players to join...'}
                  {gameState.status === 'finished' && `🎉 ${players.find((p: Player) => p.id === gameState.winner)?.name} wins the battle!`}
                </div>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Round: {gameState.currentRound}</span>
                {roundTimeLeft !== null && gameState.status === 'playing' && (
                  <span className={cn(
                    "flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full text-xs font-mono",
                    roundTimeLeft <= 30 && "bg-red-500/20 text-red-400 animate-pulse",
                    roundTimeLeft > 30 && "bg-[#7C3AED]/20 text-[#7C3AED]"
                  )}>
                    <Clock className="h-3 w-3" />
                    {formatTime(roundTimeLeft)}
                  </span>
                )}
              </div>
            </div>
            {gameState.winner && (
              <div className="flex items-center gap-2 mt-2 p-3 rounded-lg bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 animate-bounce-in">
                <div className="flex items-center gap-2">
                  <div className="animate-pulse-glow">
                    <Trophy className="h-8 w-8 text-yellow-500" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-lg font-bold text-yellow-500">Round Winner!</span>
                    <span className="text-foreground font-semibold">
                      {players.find((p: Player) => p.id === gameState.winner)?.name}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {gameState.status === 'finished' && (
              <VictoryCelebration
                winnerName={players.find((p: any) => p.id === gameState.winner)?.name || 'Unknown'}
                isVisible={showVictory}
                onComplete={handleCelebrationComplete}
              />
            )}
            
            {gameState.status === 'finished' && isHost && (
              <Button 
                onClick={handleResetGame}
                className="w-full mt-4"
                variant="outline"
              >
                Play Again
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}