import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Share2, Users, Crown, X, Clock, Trophy, WifiOff } from 'lucide-react';
import { Player } from '@/types/game';
import { cn } from '@/lib/utils';
import { useGame } from '@/context/useGame';
import { useUser } from '@/context/UserContext';
import { useMemo, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { gameApi } from '@/services/api';
import { VictoryCelebration } from '@/components/game/VictoryCelebration';
import { PlayerProfileModal } from '@/components/game/PlayerProfileModal';
import { TitleBadge } from '@/components/game/TitleBadge';
import { DiscordVerifiedIcon } from '@/components/game/DiscordVerifiedIcon';
import type { GameState } from '@/types/game';

interface GameInfoProps {
  roomId: string;
  currentPlayerName?: string;
}

export function GameInfo({ roomId, currentPlayerName }: GameInfoProps) {
  const { gameState, setGameState, timeRemaining } = useGame();
  const { userSession } = useUser();
  const [showVictory, setShowVictory] = useState(false);
  const [displayTimeLeft, setDisplayTimeLeft] = useState<number | null>(null);
  const [isAdvancingRound, setIsAdvancingRound] = useState(false);
  const timeUpAnnouncedRef = useRef<number | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (gameState.status !== 'playing') {
      setDisplayTimeLeft(null);
      timeUpAnnouncedRef.current = null;
      return;
    }

    setShowVictory(false);
  }, [gameState.status, gameState.currentRound]);

  useEffect(() => {
    if (gameState.status !== 'playing') {
      return;
    }

    if (timeRemaining !== null) {
      setDisplayTimeLeft(Math.max(0, timeRemaining));
      return;
    }

    const timerEndsAt = gameState.roundState?.timerEndsAt;
    if (!timerEndsAt) {
      setDisplayTimeLeft(null);
      return;
    }

    const updateFromServerEndTime = () => {
      const secondsLeft = Math.ceil((new Date(timerEndsAt).getTime() - Date.now()) / 1000);
      setDisplayTimeLeft(Math.max(0, secondsLeft));
    };

    updateFromServerEndTime();
    const intervalId = setInterval(() => {
      updateFromServerEndTime();
    }, 1000);

    return () => clearInterval(intervalId);
  }, [gameState.status, gameState.roundState?.timerEndsAt, timeRemaining]);

  // Timer announcement effect
  useEffect(() => {
    if (gameState.status !== 'playing') {
      return;
    }

    if (
      displayTimeLeft === 0 &&
      timeUpAnnouncedRef.current !== gameState.currentRound
    ) {
      timeUpAnnouncedRef.current = gameState.currentRound;
      const spectatorCount = Object.values(gameState.players).filter(player =>
        player.isSpectator || player.name?.startsWith('Spectator ')
      ).length;
      toast.message(
        spectatorCount >= 3
          ? "Time's up — voting is open."
          : "Time's up — casual round, no spectator voting."
      );
    }
  }, [gameState.status, gameState.currentRound, displayTimeLeft, gameState.players]);

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

  const handleNextRound = async () => {
    if (!userSession.playerSecret) return;

    setIsAdvancingRound(true);
    try {
      await gameApi.nextTurn(roomId, userSession.playerSecret);
      const refreshedState = await gameApi.getGameState(roomId) as GameState;
      setGameState(prev => ({ ...prev, ...refreshedState }));
      toast.success(`Round ${refreshedState.currentRound} started.`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(error.response?.data?.error || 'Failed to start next round');
    } finally {
      setIsAdvancingRound(false);
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

  const handleCopySpectatorLink = async () => {
    const shareUrl = `${window.location.origin}/room/${roomId}?spectator=1`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Spectator link copied');
    } catch {
      toast.info(shareUrl);
    }
  };

  const handlePlayerClick = (player: Player) => {
    setSelectedPlayer(player);
  };

  // Extract room genres from the first player's board (all players have same board)
  const roomGenres = useMemo(() => {
    const players = Object.values(gameState.players);
    if (players.length === 0) return [];
    const firstPlayer = players[0];
    if (!firstPlayer.board?.tiles) return [];
    return firstPlayer.board.tiles.map(tile => tile.genre);
  }, [gameState.players]);

  const handleCloseProfile = () => {
    setSelectedPlayer(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPlayerEloStats = (player: Player) =>
    `ELO: ${player.eloRating} · ${player.eloWins ?? 0}W / ${player.eloLosses ?? 0}L / ${player.eloMatches ?? 0}M`;

  

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
  const isSpectatorPlayer = (player: Player) =>
    player.isSpectator || player.name?.startsWith('Spectator ');
  const spectators = players.filter(isSpectatorPlayer);
  const activePlayers = players.filter((player: Player) => !isSpectatorPlayer(player));
  const isRankedRound = spectators.length >= 3;
  const hasRoundTimedOut = gameState.status === 'playing' && displayTimeLeft === 0;

  return (
    <Card className="border-[#7C3AED]/30 bg-[#0F0F23]/80 backdrop-blur-xl mb-6 shadow-[0_0_30px_rgba(124,58,237,0.15)]">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Users className="h-4 w-4" />
              Players ({activePlayers.length})
            </div>
            {activePlayers.map((player: Player) => (
              <div key={player.id} className={cn(
                "flex items-center justify-between p-2 rounded-lg bg-[#0F0F23]/60 border border-[#7C3AED]/20 hover:border-[#7C3AED]/40 transition-all duration-200",
                player.name === currentPlayerName && "ring-2 ring-[#7C3AED]/50 shadow-[0_0_15px_rgba(124,58,237,0.3)]",
                !player.isConnected && "border-red-500/30 opacity-70"
              )}>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <button
                      data-testid={`player-name-${player.name}`}
                      onClick={() => handlePlayerClick(player)}
                      className={cn(
                        "min-w-0 break-words text-left text-sm font-['Poppins'] hover:text-[#7C3AED] transition-colors cursor-pointer",
                        player.name === currentPlayerName && "font-semibold text-[#7C3AED] neon-text"
                      )}
                    >
                      {player.name} {player.name === currentPlayerName && "(You)"}
                    </button>
                    {player.isDiscordVerified && (
                      <DiscordVerifiedIcon username={player.discordUsername} />
                    )}
                    {!player.isConnected && (
                      <span
                        data-testid="disconnected-indicator"
                        className="inline-flex h-3 w-3 shrink-0 items-center justify-center text-red-500"
                      >
                        <WifiOff className="h-3 w-3" />
                      </span>
                    )}
                    {gameState.winner === player.id && (
                      <Crown className="h-4 w-4 text-[#EAB308] crown-glow drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]" />
                    )}
                  </div>
                  <TitleBadge title={player.currentTitle} compact />
                  {player.eloRating !== undefined && (
                    <div
                      data-testid={`player-elo-stats-${player.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      {formatPlayerEloStats(player)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Vote count display */}
                  {gameState.status === 'playing' && gameState.roundState?.votingOpen && (
                    <span className="text-xs text-gray-400" data-testid="vote-count">
                      {gameState.roundState.votesRecorded || 0}/{Object.values(gameState.players).filter(p => !p.isSpectator).length || 0} votes
                    </span>
                  )}
                  {isHost && player.id !== userSession.playerId && (
                    <Button
                      data-testid="kick-player"
                      size="sm"
                      variant="outline"
                      onClick={() => handleKickPlayer(player.id, player.name)}
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Users className="h-4 w-4" />
                Spectators ({spectators.length})
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopySpectatorLink}
                className="h-8 gap-1.5 px-3"
                aria-label="Copy spectator invite link"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span className="text-xs">Share</span>
              </Button>
            </div>
            {spectators.map((spectator: Player) => (
              <div key={spectator.id} className="flex items-center justify-between text-sm p-2 rounded bg-background/50">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      data-testid={`player-name-${spectator.name}`}
                      onClick={() => handlePlayerClick(spectator)}
                      className="min-w-0 break-words text-left hover:text-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/60"
                    >
                      {spectator.name}
                    </button>
                    {spectator.isDiscordVerified && (
                      <DiscordVerifiedIcon username={spectator.discordUsername} />
                    )}
                  </div>
                  <TitleBadge title={spectator.currentTitle} compact />
                </div>
                {isHost && spectator.id !== userSession.playerId && (
                  <Button
                    data-testid="kick-player"
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
            <div className="text-sm text-muted-foreground">
              <div className="text-xs text-muted-foreground">
                {gameState.status === 'lobby' && 'Waiting for at least 2 players to start the game'}
                {gameState.status === 'playing' && 'Game in progress'}
                {gameState.status === 'finished' && `🎉 ${players.find((p: Player) => p.id === gameState.winner)?.name} wins the battle!`}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Round: {gameState.currentRound}</span>
                {displayTimeLeft !== null && gameState.status === 'playing' && (
                  <span className={cn(
                    "flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full text-xs font-mono",
                    displayTimeLeft <= 30 && "bg-red-500/20 text-red-400 animate-pulse",
                    displayTimeLeft > 30 && "bg-[#7C3AED]/20 text-[#7C3AED]"
                  )}>
                    <Clock className="h-3 w-3" />
                    {formatTime(displayTimeLeft)}
                  </span>
                )}
              </div>
            </div>
            {hasRoundTimedOut && !isRankedRound && (
              <div className="rounded-lg border border-[#7C3AED]/30 bg-[#7C3AED]/10 p-3 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">Casual round complete</div>
                <p className="mt-1">Voting needs 3 spectators. No votes are recorded for this round.</p>
                {isHost ? (
                  <Button
                    onClick={handleNextRound}
                    disabled={isAdvancingRound}
                    className="mt-3 h-9 w-full"
                    size="sm"
                  >
                    {isAdvancingRound ? 'Starting...' : 'Start Next Round'}
                  </Button>
                ) : (
                  <p className="mt-2 text-xs">Waiting for the host to start the next round.</p>
                )}
              </div>
            )}
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
                winnerName={players.find((p: Player) => p.id === gameState.winner)?.name || 'Unknown'}
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

      {/* Player Profile Modal */}
      {selectedPlayer && (
        <PlayerProfileModal
          player={selectedPlayer}
          isOpen={!!selectedPlayer}
          onClose={handleCloseProfile}
          scoreInfo={selectedPlayer.scoreInfo}
          roomGenres={roomGenres}
        />
      )}
    </Card>
  );
}
