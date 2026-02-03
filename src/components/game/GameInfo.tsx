import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Crown, X } from 'lucide-react';
import { Player } from '@/types/game';
import { cn } from '@/lib/utils';
import { useGame } from '@/context/GameContext';
import { useUser } from '@/context/UserContext';
import { useMemo, useState, useEffect } from 'react';
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

  const isHost = useMemo(() => {
    if (!userSession.playerSecret || !gameState.players) return false;
    const players = Object.values(gameState.players).filter(p => !p.isSpectator);
    const host = players[0];
    return host?.id === userSession.playerId;
  }, [gameState.players, userSession]);

  const handleResetGame = async () => {
    if (!userSession.playerSecret) return;
    
    try {
      await gameApi.resetGame(roomId, userSession.playerSecret);
      toast.success('Game reset! Starting new round...');
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
    <Card className="border-border/30 bg-card/60 backdrop-blur-xl mb-6">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Users className="h-4 w-4" />
              Players ({activePlayers.length})
            </div>
            {activePlayers.map((player: Player) => (
              <div key={player.id} className={cn(
                "flex items-center justify-between p-2 rounded bg-background/50",
                player.name === currentPlayerName && "ring-2 ring-primary/50"
              )}>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-sm",
                    player.name === currentPlayerName && "font-semibold text-primary"
                  )}>
                    {player.name} {player.name === currentPlayerName && "(You)"}
                  </span>
                  {gameState.winner === player.id && (
                    <Crown className="h-4 w-4 text-yellow-500" />
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
                "px-3 py-1 rounded-full text-sm font-medium transition-all duration-500",
                gameState.status === 'lobby' && 'bg-yellow-100 text-yellow-800',
                gameState.status === 'playing' && 'bg-blue-100 text-blue-800 animate-pulse',
                gameState.status === 'finished' && 'bg-green-100 text-green-800 animate-bounce-in'
              )}>
                {gameState.status === 'lobby' && '⏳'}
                {gameState.status === 'playing' && '🎵'}
                {gameState.status === 'finished' && '🏆'}
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
              Round: {gameState.currentRound}
            </div>
            {gameState.winner && (
              <div className="text-sm font-semibold text-green-500 flex items-center gap-2 animate-bounce-in">
                <div className="flex items-center gap-2">
                  <div className="animate-pulse-glow">
                    <Crown className="h-6 w-6 text-yellow-500" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-lg font-bold">Victory!</span>
                    <span>Winner: {players.find((p: Player) => p.id === gameState.winner)?.name}</span>
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