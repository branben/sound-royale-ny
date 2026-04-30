import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Users, Play, Settings } from 'lucide-react';
import { roomApi, gameApi } from '@/services/api';
import { BingoBoard } from '@/components/game/BingoBoard';
import { SpectatorView } from '@/components/game/SpectatorView';
import { PlayerView } from '@/components/game/PlayerView';
import { GameInfo } from '@/components/game/GameInfo';
import { useGame, useGameRefresh, useGameRefreshEffect } from '@/context/useGame';
import { useUser } from '@/context/UserContext';
import type { RoomResponse, Player } from '@/types/game';

export default function Room() {
  const { id: roomId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const { userSession, setPlayerName, setPlayerCredentials, setSpectatorMode, clearSession, isHost: isHostFunction } = useUser();
  const { setForceRefresh } = useGameRefresh();
  const { gameState, setGameState } = useGame();
  const fetchSequenceRef = useRef(0);

  const players = gameState.players ? Object.values(gameState.players) : [];

  // One-shot rejoin on mount only — decoupled from fetchRoom to prevent infinite loop
  useEffect(() => {
    if (roomId && userSession.playerSecret) {
      attemptRejoin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isHost = useMemo(() => {
    if (!gameState.players) return false;
    const players = Object.values(gameState.players);
    return isHostFunction(players);
  }, [gameState.players, isHostFunction]);

  const activePlayersCount = useMemo(() => {
    if (!gameState.players) return 0;
    return Object.values(gameState.players).filter(p => !p.name?.startsWith('Spectator ')).length;
  }, [gameState.players]);

  const handleJoinAsPlayer = async () => {
    if (!roomId) return;

    const name = userSession.playerName || window.prompt('Enter your name:');
    if (!name?.trim()) return;

    try {
      const player = await gameApi.joinRoom(roomId, name.trim());
      setPlayerName(name.trim());
      setPlayerCredentials(player.id, player.playerSecret);
      setSpectatorMode(false);
      toast.success('Joined room as player!');
      fetchRoom();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(error.response?.data?.error || 'Failed to join room');
      console.error('Error joining room:', err);
    }
  };

  const handleJoinAsSpectator = async () => {
    if (!roomId) return;

    try {
      const player = await gameApi.joinRoom(roomId, 'Spectator', true);
      const specName = `Spectator ${Date.now()}`;
      setPlayerName(specName);
      setPlayerCredentials(player.id, player.playerSecret);
      setSpectatorMode(true);
      toast.success('Joined room as spectator!');
      fetchRoom();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(error.response?.data?.error || 'Failed to join room');
      console.error('Error joining room:', err);
    }
  };

  const handleStartGame = async () => {
    if (!roomId) return;

    try {
      await gameApi.startGame(roomId);
      toast.success('Game started!');
      fetchRoom();
      setForceRefresh(Date.now());
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(error.response?.data?.error || 'Failed to start game');
      console.error('Error starting game:', err);
    }
  };

  const attemptRejoin = useCallback(async () => {
    if (!roomId || !userSession.playerSecret) return false;

    setIsReconnecting(true);
    try {
      const playerData = await gameApi.rejoinRoom(roomId, userSession.playerSecret);
      if (playerData) {
        setPlayerCredentials(playerData.id, playerData.playerSecret);
        setPlayerName(playerData.name);
        setSpectatorMode(playerData.isSpectator);
        
        localStorage.setItem('lastRoomCode', roomId);
        
        toast.success(`Rejoined as ${playerData.name}!`);
        setIsReconnecting(false);
        return true;
      }
      setIsReconnecting(false);
      return false;
    } catch (err) {
      console.log('Rejoin failed, will join as new player');
      localStorage.removeItem('playerId');
      localStorage.removeItem('playerSecret');
      setIsReconnecting(false);
      return false;
    }
  }, [roomId, userSession.playerSecret, setPlayerCredentials, setPlayerName, setSpectatorMode]);

  const fetchRoom = useCallback(async () => {
    if (!roomId) {
      setError('Room ID is required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const roomData = await roomApi.getRoom(roomId);
      setRoom(roomData);

      const currentPlayer = roomData.players?.find(player => player.id === userSession.playerId);
      if (currentPlayer) {
        const backendIsSpectator = currentPlayer.is_spectator ?? false;
        if (userSession.isSpectator !== backendIsSpectator) {
          setSpectatorMode(backendIsSpectator);
        }
        if (currentPlayer.name && currentPlayer.name !== userSession.playerName) {
          setPlayerName(currentPlayer.name);
        }
      }

      // Fetch full game state (includes roundState and spectatorCount)
      let roundState = undefined;
      let spectatorCount = undefined;
      try {
        const fullState = await gameApi.getGameState(roomId);
        roundState = fullState.roundState;
        spectatorCount = fullState.spectatorCount;
      } catch {
        // OK if this fails — WebSocket will provide roundState
      }

      const newGameState = {
        gameId: roomData.code,
        status: roomData.status,
        currentRound: roomData.current_round,
        winner: typeof roomData.winner === 'string' ? roomData.winner : roomData.winner?.id,
        roundState,
        spectatorCount,
        players: roomData.players?.reduce((acc: Record<string, Player>, player: any) => {
          acc[player.id] = {
            ...player,
            isConnected: player.is_connected ?? player.isConnected,
            isSpectator: player.is_spectator ?? player.isSpectator,
            isHost: player.is_host ?? player.isHost,
            eloRating: player.elo_rating ?? player.eloRating,
            eloWins: player.elo_wins ?? player.eloWins,
            eloLosses: player.elo_losses ?? player.eloLosses,
            eloMatches: player.elo_matches ?? player.eloMatches,
            board: player.board
              ? player.board
              : player.tiles
              ? {
                  tiles: player.tiles.map((tile: any) => ({
                    id: tile.id,
                    genre: tile.genre,
                    status: tile.status,
                    audioUrl: tile.audio_url ?? tile.audioUrl,
                  })),
                }
              : undefined,
          };
          return acc;
        }, {}) || {},
        eloDeltas: roomData.elo_deltas?.map((d: any) => ({
          playerId: d.player_id,
          playerName: d.player_name,
          previousElo: d.previous_elo,
          newElo: d.new_elo,
          delta: d.delta,
          isWinner: d.is_winner,
        })),
      };
      
      setGameState(newGameState);

    } catch (err: unknown) {
      const error = err as { response?: { status?: number }; message?: string };
      if (error.response?.status === 404) {
        setError('Room not found');
        toast.error('Room not found');
        setTimeout(() => navigate('/'), 2000);
      } else {
        setError('Failed to load room');
        toast.error('Failed to load room');
      }
    } finally {
      setLoading(false);
    }
  }, [
    roomId,
    navigate,
    setGameState,
    setPlayerName,
    setSpectatorMode,
    userSession.isSpectator,
    userSession.playerId,
    userSession.playerName,
  ]);

  useEffect(() => {
    const sequence = ++fetchSequenceRef.current;
    fetchRoom().finally(() => {
      if (fetchSequenceRef.current === sequence) {
        setLoading(false);
      }
    });
  }, [fetchRoom]);

  useGameRefreshEffect(fetchRoom);

  if (loading || isReconnecting) {
    return (
      <div className="min-h-screen bg-background p-4">
        <header className="border-b border-border/30 bg-card/40 backdrop-blur-md">
          <div className="container mx-auto flex h-12 items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">Sound Royale</h1>
            <div className="flex items-center gap-2">
              <Button onClick={() => navigate('/')} variant="outline">
                <Users className="mr-2 h-5 w-5" />
                Home
              </Button>
            </div>
          </div>
        </header>

        <main className="container mx-auto p-4 lg:p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">
                {isReconnecting ? 'Reconnecting to room...' : 'Loading room...'}
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="text-center py-8">
            <p className="text-destructive mb-4">{error || 'Room not found'}</p>
            <Button onClick={() => navigate('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Lobby
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F23] p-4 relative">
      <div className="fixed inset-0 pointer-events-none z-50 opacity-20 bg-[linear-gradient(0deg,transparent_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px]" />
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-[#7C3AED]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-96 h-96 bg-[#F43F5E]/10 rounded-full blur-3xl" />
      </div>

      <header className="border-b border-[#7C3AED]/20 bg-[#0F0F23]/80 backdrop-blur-md mb-4 relative z-10">
        <div className="container mx-auto flex h-14 items-center justify-between">
          <h1 className="text-2xl font-bold font-['Righteous'] text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] to-[#F43F5E] drop-shadow-[0_0_10px_rgba(124,58,237,0.5)] md:text-3xl">
            Sound Royale
          </h1>
          <Button 
            onClick={() => navigate('/')} 
            variant="outline"
            className="border-[#7C3AED]/30 hover:border-[#7C3AED]/60 hover:shadow-[0_0_15px_rgba(124,58,237,0.3)] transition-all duration-200"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Lobby
          </Button>
        </div>
      </header>

      <main className="container mx-auto p-4 lg:p-6">
        {gameState.status === 'lobby' ? (
          <Card data-testid="lobby" className="border-border/30 bg-card/60 backdrop-blur-xl w-full max-w-4xl mx-auto">
            <CardHeader>
              <CardTitle>Join Battle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {gameState.players && Object.values(gameState.players).some(p => p.name === userSession.playerName) ? (
                <div className="text-center py-8">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20 mb-4">
                    <Users className="h-6 w-6 text-green-500" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">You're in battle!</h3>
                  {isHost && activePlayersCount >= 2 ? (
                    <div className="space-y-4 mt-4">
                      <p className="text-muted-foreground">Ready to start battle!</p>
                      <Button onClick={handleStartGame} className="h-12 w-full">
                        <Play className="mr-2 h-5 w-5" />
                        Start Battle
                      </Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Waiting for more players to join and host to start game.</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button onClick={handleJoinAsPlayer} className="h-16">
                    <Users className="mr-2 h-5 w-5" />
                    Join as Player
                  </Button>
                  <Button onClick={handleJoinAsSpectator} variant="outline" className="h-16">
                    <Settings className="mr-2 h-5 w-5" />
                    Join as Spectator
                  </Button>
                </div>
              )}
              <div className="text-center text-sm text-muted-foreground">
                <p>Room Code: {room.code}</p>
                <p>Round: {room.current_round}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="min-w-0">
              <GameInfo roomId={roomId!} currentPlayerName={userSession.playerName} />
            </div>

            <div className="min-w-0">
              {userSession.isSpectator ? (
                <SpectatorView embedded />
              ) : (
                <div className="flex min-w-0 flex-col">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-foreground md:text-3xl">Your Board</h2>
                    <p className="text-muted-foreground">Complete your genre tiles to win!</p>
                  </div>
                  <PlayerView roomId={roomId!} playerName={userSession.playerName} />
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
