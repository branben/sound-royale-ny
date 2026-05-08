import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { toast } from 'sonner';
import { ArrowLeft, Users, Play, Settings, Info, Vote, Share2 } from 'lucide-react';
import { normalizeRoomWinner, roomApi, gameApi } from '@/services/api';
import { getDiscordSession } from '@/services/discordSession';
import { BingoBoard } from '@/components/game/BingoBoard';
import { SpectatorView } from '@/components/game/SpectatorView';
import { PlayerView } from '@/components/game/PlayerView';
import { GameInfo } from '@/components/game/GameInfo';
import { RoundStage } from '@/components/game/RoundStage';
import { VotingPanel } from '@/components/game/VotingPanel';
import { TitleBadge } from '@/components/game/TitleBadge';
import { GameTutorial } from '@/components/game/GameTutorial';
import { DiscordVerifiedIcon } from '@/components/game/DiscordVerifiedIcon';
import { useGame, useGameRefresh, useGameRefreshEffect } from '@/context/useGame';
import { useUser } from '@/context/UserContext';
import type { GameState, RoomResponse, Player } from '@/types/game';

interface MobileGameDockProps {
  roomId: string;
  currentPlayerName?: string;
}

function MobileGameDock({ roomId, currentPlayerName }: MobileGameDockProps) {
  const { gameState } = useGame();
  const { userSession } = useUser();
  const players = Object.values(gameState.players ?? {});
  const isSpectatorPlayer = (player: Player) =>
    player.isSpectator || player.name?.startsWith('Spectator ');
  const spectators = players.filter(isSpectatorPlayer);
  const producers = players.filter(player => !isSpectatorPlayer(player));

  const copySpectatorLink = async () => {
    const shareUrl = `${window.location.origin}/room/${roomId}?spectator=1`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Spectator link copied');
    } catch {
      toast.info(shareUrl);
    }
  };

  const actions = [
    {
      label: 'Info',
      icon: Info,
      content: <GameInfo roomId={roomId} currentPlayerName={currentPlayerName} />,
    },
    {
      label: 'Audience',
      icon: Users,
      content: (
        <div className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Producers ({producers.length})</h3>
            {producers.map(player => (
              <div key={player.id} className="rounded-lg border border-[#7C3AED]/20 bg-[#111126] p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate font-medium">{player.name}</div>
                  {player.isDiscordVerified && (
                    <DiscordVerifiedIcon username={player.discordUsername} />
                  )}
                </div>
                <TitleBadge title={player.currentTitle} compact />
                <div className="text-xs text-muted-foreground">ELO: {player.eloRating ?? 1200}</div>
              </div>
            ))}
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Spectators ({spectators.length})</h3>
            {spectators.length ? spectators.map(player => (
              <div key={player.id} className="rounded-lg bg-[#111126] p-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{player.name}</span>
                  {player.isDiscordVerified && (
                    <DiscordVerifiedIcon username={player.discordUsername} />
                  )}
                </div>
                <TitleBadge title={player.currentTitle} compact />
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No spectators yet.</p>
            )}
          </section>
        </div>
      ),
    },
    {
      label: 'Voting',
      icon: Vote,
      content: userSession.isSpectator && userSession.playerSecret && gameState.roundState ? (
        <VotingPanel
          roomId={gameState.roomCode || gameState.gameId}
          playerSecret={userSession.playerSecret}
          producers={producers}
          currentGenre={gameState.roundState.currentTileGenre || 'Unknown'}
          votingOpen={gameState.roundState.votingOpen || false}
          votesRecorded={gameState.roundState.votesRecorded || 0}
          spectatorCount={gameState.spectatorCount || spectators.length}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Voting opens for spectators when enough audience members have joined.
        </p>
      ),
    },
    {
      label: 'Share',
      icon: Share2,
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Invite spectators to join this live room and unlock ranked voting.
          </p>
          <Button onClick={copySpectatorLink} className="h-11 w-full">
            <Share2 className="mr-2 h-4 w-4" />
            Copy Spectator Link
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#7C3AED]/30 bg-[#0F0F23]/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
        {actions.map(action => {
          const Icon = action.icon;
          return (
            <Drawer key={action.label}>
              <DrawerTrigger asChild>
                <button className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg border border-[#7C3AED]/25 bg-[#111126] text-xs font-medium text-[#E2E8F0] transition-colors hover:border-[#7C3AED]/60">
                  <Icon className="h-4 w-4 text-[#A78BFA]" />
                  {action.label}
                </button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[86dvh] border-[#7C3AED]/30 bg-[#0F0F23]">
                <DrawerHeader>
                  <DrawerTitle>{action.label}</DrawerTitle>
                </DrawerHeader>
                <div className="overflow-y-auto px-4 pb-6">
                  {action.content}
                </div>
              </DrawerContent>
            </Drawer>
          );
        })}
      </div>
    </div>
  );
}

export default function Room() {
  const { id: roomId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [room, setRoom] = useState<RoomResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const { userSession, setPlayerName, setPlayerCredentials, setSpectatorMode, setActiveRoomSession, clearSession, isHost: isHostFunction } = useUser();
  const { setForceRefresh } = useGameRefresh();
  const { gameState, setGameState, timeRemaining } = useGame();
  const autoSpectatorJoinAttempted = useRef(false);

  // Show tutorial for first-time players when game starts
  useEffect(() => {
    if (gameState.status === 'playing' && !localStorage.getItem('hasSeenGameTutorial')) {
      setShowTutorial(true);
    }
  }, [gameState.status]);

  const handleTutorialDismiss = () => {
    setShowTutorial(false);
    localStorage.setItem('hasSeenGameTutorial', 'true');
  };

  const isHost = useMemo(() => {
    if (!gameState.players) return false;
    const players = Object.values(gameState.players);
    return isHostFunction(players);
  }, [gameState.players, isHostFunction]);

  const hasCurrentPlayer = useMemo(() => {
    if (!userSession.playerId) return false;
    return Object.values(gameState.players ?? {}).some(player =>
      player.id === userSession.playerId
    );
  }, [gameState.players, userSession.playerId]);

  const activePlayersCount = useMemo(() => {
    if (!gameState.players) return 0;
    return Object.values(gameState.players).filter(p => !p.name?.startsWith('Spectator ')).length;
  }, [gameState.players]);

  const handleJoinAsPlayer = async () => {
    if (!roomId) return;

    const name = userSession.playerName || window.prompt('Enter your name:');
    if (!name?.trim()) return;

    try {
      const player = await gameApi.joinRoom(roomId, name.trim(), false, getDiscordSession() ?? undefined);
      setPlayerName(name.trim());
      setPlayerCredentials(player.id, player.playerSecret);
      setSpectatorMode(false);
      setActiveRoomSession(roomId, {
        playerName: name.trim(),
        playerId: player.id,
        playerSecret: player.playerSecret,
        isSpectator: false,
      });
      toast.success('Joined room as player!');
      void fetchRoom(true);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(error.response?.data?.error || 'Failed to join room');
      console.error('Error joining room:', err);
    }
  };

  const handleJoinAsSpectator = async () => {
    if (!roomId) return;

    try {
      const player = await gameApi.joinRoom(roomId, 'Spectator', true, getDiscordSession() ?? undefined);
      setPlayerName(player.name);
      setPlayerCredentials(player.id, player.playerSecret);
      setSpectatorMode(true);
      setActiveRoomSession(roomId, {
        playerName: player.name,
        playerId: player.id,
        playerSecret: player.playerSecret,
        isSpectator: true,
      });
      toast.success('Joined room as spectator!');
      void fetchRoom(true);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(error.response?.data?.error || 'Failed to join room');
      console.error('Error joining room:', err);
    }
  };

  useEffect(() => {
    if (
      autoSpectatorJoinAttempted.current ||
      searchParams.get('spectator') !== '1' ||
      loading ||
      isReconnecting ||
      hasCurrentPlayer
    ) {
      return;
    }

    autoSpectatorJoinAttempted.current = true;
    void handleJoinAsSpectator();
  }, [searchParams, loading, isReconnecting, hasCurrentPlayer]);

  const handleStartGame = async () => {
    if (!roomId || !userSession.playerSecret) {
      toast.error('Missing required credentials');
      return;
    }

    try {
      await gameApi.startGame(roomId, userSession.playerSecret);
      toast.success('Game started!');
      await fetchRoom(true);
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
        setActiveRoomSession(roomId, {
          playerName: playerData.name,
          playerId: playerData.id,
          playerSecret: playerData.playerSecret,
          isSpectator: playerData.isSpectator,
        });
        
        localStorage.setItem('lastRoomCode', roomId);
        
        toast.success(`Rejoined as ${playerData.name}!`);
        setIsReconnecting(false);
        return true;
      }
      setIsReconnecting(false);
      return false;
    } catch (err) {
      setIsReconnecting(false);
      return false;
    }
  }, [roomId, userSession.playerSecret, setPlayerCredentials, setPlayerName, setSpectatorMode]);

  const fetchRoom = useCallback(async (force = false) => {
    if (!roomId) {
      setError('Room ID is required');
      setLoading(false);
      return;
    }

    if (!force && hasLoaded && !error) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const roomData = await roomApi.getRoom(roomId);
      setRoom(roomData);
      setHasLoaded(true);

      const players = roomData.players?.reduce<Record<string, Player>>((acc, player) => {
        const tiles = player.board?.tiles ?? player.tiles?.map(tile => ({
          id: tile.id,
          genre: tile.genre,
          status: tile.status,
          audioUrl: tile.audio_url ?? tile.audioUrl,
        })) ?? [];

        acc[player.id] = {
          id: player.id,
          name: player.name,
          avatar: player.avatar,
          isDiscordVerified: player.is_discord_verified ?? player.isDiscordVerified,
          discordUsername: player.discord_username ?? player.discordUsername,
          discordAvatarUrl: player.discord_avatar_url ?? player.discordAvatarUrl,
          isConnected: player.is_connected,
          isSpectator: player.is_spectator,
          isHost: player.is_host,
          isReady: player.is_ready,
          eloRating: player.elo_rating,
          eloWins: player.elo_wins,
          eloLosses: player.elo_losses,
          eloMatches: player.elo_matches,
          isCheckedIn: player.is_checked_in ?? player.isCheckedIn,
          currentTitle: player.current_title ?? player.currentTitle,
          scoreInfo: player.scoreInfo,
          board: { tiles },
        };
        return acc;
      }, {}) ?? {};

      const newGameState: GameState = {
        gameId: roomData.code,
        roomCode: roomData.code,
        status: roomData.status,
        currentRound: roomData.current_round,
        winner: normalizeRoomWinner(roomData.winner),
        players,
        eloDeltas: roomData.elo_deltas?.map(d => ({
          playerId: d.player_id,
          playerName: d.player_name,
          previousElo: d.previous_elo,
          newElo: d.new_elo,
          delta: d.delta,
          isWinner: d.is_winner,
        })),
      };

      setGameState(prev => ({ ...prev, ...newGameState }));

      if (userSession.playerSecret) {
        await attemptRejoin();
      }
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
  }, [roomId, userSession.playerSecret, attemptRejoin, navigate, setGameState, hasLoaded, error]);

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

      <main className="container mx-auto p-4 pb-28 lg:p-6">
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
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="hidden lg:block lg:w-80 lg:order-1">
              <GameInfo roomId={roomId!} currentPlayerName={userSession.playerName} />
            </div>

            <div className="flex-1 space-y-5 lg:order-2">
              {!hasCurrentPlayer ? (
                <Card className="border-[#7C3AED]/30 bg-[#111126]/90 backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle>Join as Spectator</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      This match is already live. You can still join the audience and help unlock voting when enough spectators are present.
                    </p>
                    <Button onClick={handleJoinAsSpectator} className="h-11 w-full">
                      <Users className="mr-2 h-4 w-4" />
                      Join Spectator View
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
              {gameState.status === 'playing' && (
                <RoundStage
                  roundNumber={gameState.currentRound || 1}
                  genre={gameState.roundState?.currentTileGenre}
                  timeRemaining={timeRemaining}
                  timerEndsAt={gameState.roundState?.timerEndsAt}
                  votingOpen={gameState.roundState?.votingOpen}
                  spectatorCount={
                    gameState.spectatorCount ??
                    Object.values(gameState.players).filter(player =>
                      player.isSpectator || player.name?.startsWith('Spectator ')
                    ).length
                  }
                  votesRecorded={gameState.roundState?.votesRecorded}
                />
              )}
              {userSession.isSpectator ? (
                <SpectatorView />
              ) : (
                <div className="flex flex-col">
                  <PlayerView roomId={roomId!} playerName={userSession.playerName} />
                </div>
              )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
      {gameState.status !== 'lobby' && hasCurrentPlayer && (
        <MobileGameDock roomId={roomId!} currentPlayerName={userSession.playerName} />
      )}

      {/* Game Tutorial for first-time players */}
      {gameState.status === 'playing' && hasCurrentPlayer && (
        <GameTutorial
          isSpectator={userSession.isSpectator || false}
          onDismiss={handleTutorialDismiss}
          isActive={showTutorial}
        />
      )}
    </div>
  );
}
