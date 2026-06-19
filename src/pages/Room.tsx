import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
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
import { gsap } from 'gsap';

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
  const producers = players.filter((player) => !isSpectatorPlayer(player));

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
            <h3 className="text-sm font-semibold text-foreground">
              Producers ({producers.length})
            </h3>
            {producers.map((player) => (
              <div key={player.id} className="rounded-lg border border-primary/20 bg-card p-3">
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
            <h3 className="text-sm font-semibold text-foreground">
              Spectators ({spectators.length})
            </h3>
            {spectators.length ? (
              spectators.map((player) => (
                <div key={player.id} className="rounded-lg bg-card p-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{player.name}</span>
                    {player.isDiscordVerified && (
                      <DiscordVerifiedIcon username={player.discordUsername} />
                    )}
                  </div>
                  <TitleBadge title={player.currentTitle} compact />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No spectators yet.</p>
            )}
          </section>
        </div>
      ),
    },
    {
      label: 'Voting',
      icon: Vote,
      content:
        userSession.isSpectator && userSession.playerSecret && gameState.roundState ? (
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
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Drawer key={action.label}>
              <DrawerTrigger asChild>
                <button className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg border border-primary/25 bg-card text-xs font-medium text-foreground transition-colors hover:border-primary/60">
                  <Icon className="h-4 w-4 text-primary" />
                  {action.label}
                </button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[86dvh] border-border bg-background">
                <DrawerHeader>
                  <DrawerTitle>{action.label}</DrawerTitle>
                </DrawerHeader>
                <div className="overflow-y-auto px-4 pb-6">{action.content}</div>
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

  const {
    userSession,
    setPlayerName,
    setPlayerCredentials,
    setSpectatorMode,
    setActiveRoomSession,
    clearSession,
    isHost: isHostFunction,
    setHostStatus,
  } = useUser();
  const { setForceRefresh } = useGameRefresh();
  const { gameState, setGameState, timeRemaining } = useGame();
  const autoSpectatorJoinAttempted = useRef(false);
  const roomCodeRef = useRef(null);
  const joinBattleCardRef = useRef(null);
  const actionButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const roundStageRef = useRef<HTMLDivElement | null>(null);
  const bingoBoardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gameInfoRef = useRef(null);

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

  // Sync host status from server data to persisted session so it survives refresh
  useEffect(() => {
    if (gameState.players && userSession.playerId) {
      const players = Object.values(gameState.players);
      const currentPlayer = players.find((p) => p.id === userSession.playerId);
      if (currentPlayer && currentPlayer.isHost === true) {
        setHostStatus(true);
      }
    }
  }, [gameState.players, userSession.playerId, setHostStatus]);

  const isHost = useMemo(() => {
    // Primary: derive from gameState.players (populated by fetchRoom / GameContext)
    if (gameState.players) {
      const players = Object.values(gameState.players);
      if (players.length > 0 && isHostFunction(players)) {
        return true;
      }
    }
    // Fallback 1: check raw room data from API (handles refresh before GameContext loads)
    if (room?.players && userSession.playerId) {
      const isHostFromRoom = room.players.some(
        (p) => p.id === userSession.playerId && p.is_host === true,
      );
      if (isHostFromRoom) return true;
    }
    // Fallback 2: use persisted session host status (set during room creation or server sync)
    if (userSession.isHost) return true;
    return false;
  }, [gameState.players, isHostFunction, room, userSession.playerId, userSession.isHost]);

  const hasCurrentPlayer = useMemo(() => {
    if (!userSession.playerId) return false;
    // Primary: check gameState.players (populated by fetchRoom / GameContext)
    if (gameState.players) {
      if (Object.values(gameState.players).some((player) => player.id === userSession.playerId)) {
        return true;
      }
    }
    // Fallback: check raw room data from API
    if (room?.players) {
      return room.players.some((p) => p.id === userSession.playerId);
    }
    return false;
  }, [gameState.players, userSession.playerId, room]);

  const activePlayersCount = useMemo(() => {
    if (!gameState.players) return 0;
    return Object.values(gameState.players).filter((p) => !p.name?.startsWith('Spectator ')).length;
  }, [gameState.players]);

  const handleJoinAsPlayer = async () => {
    if (!roomId) return;

    const name = userSession.playerName || window.prompt('Enter your name:');
    if (!name?.trim()) return;

    try {
      const player = await gameApi.joinRoom(
        roomId,
        name.trim(),
        false,
        getDiscordSession() ?? undefined,
      );
      setPlayerName(name.trim());
      setPlayerCredentials(player.id, player.playerSecret!);
      setSpectatorMode(false);
      setActiveRoomSession(roomId, {
        playerName: name.trim(),
        playerId: player.id,
        playerSecret: player.playerSecret!,
        isSpectator: false,
      });
      toast.success('Joined room as player!');
      fetchRoom(true).catch((err) => console.error('Fetch room error:', err));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(error.response?.data?.error || 'Failed to join room');
      console.error('Error joining room:', err);
    }
  };

  const handleJoinAsSpectator = async () => {
    if (!roomId) return;

    try {
      const player = await gameApi.joinRoom(
        roomId,
        'Spectator',
        true,
        getDiscordSession() ?? undefined,
      );
      setPlayerName(player.name);
      setPlayerCredentials(player.id, player.playerSecret!);
      setSpectatorMode(true);
      setActiveRoomSession(roomId, {
        playerName: player.name,
        playerId: player.id,
        playerSecret: player.playerSecret!,
        isSpectator: true,
      });
      toast.success('Joined room as spectator!');
      fetchRoom(true).catch((err) => console.error('Fetch room error:', err));
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
    handleJoinAsSpectator().catch((err) => console.error('Join spectator error:', err));
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
      const playerData = await gameApi.rejoinRoom(roomId, userSession.playerSecret!);
      if (playerData) {
        setPlayerCredentials(playerData.id, playerData.playerSecret!);
        setPlayerName(playerData.name);
        setSpectatorMode(playerData.isSpectator ?? false);
        setActiveRoomSession(roomId, {
          playerName: playerData.name,
          playerId: playerData.id,
          playerSecret: playerData.playerSecret!,
          isSpectator: playerData.isSpectator ?? false,
          isHost: playerData.isHost ?? false,
        });

        localStorage.setItem('lastRoomCode', roomId);

        toast.success(`Rejoined as ${playerData.name}!`);
        setIsReconnecting(false);
        return true;
      }
      setIsReconnecting(false);
      return false;
    } catch (err) {
      console.error('Rejoin failed:', err);
      setIsReconnecting(false);
      return false;
    }
  }, [
    roomId,
    userSession.playerSecret,
    setPlayerCredentials,
    setPlayerName,
    setSpectatorMode,
    setActiveRoomSession,
  ]);

  const fetchRoom = useCallback(
    async (force = false) => {
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

        const players =
          roomData.players?.reduce<Record<string, Player>>((acc, player) => {
            const tiles =
              player.board?.tiles ??
              player.tiles?.map((tile) => ({
                id: tile.id,
                genre: tile.genre,
                status: tile.status,
                audioUrl: tile.audio_url,
              })) ??
              [];

            acc[player.id] = {
              id: player.id,
              name: player.name ?? '',
              avatar: player.avatar,
              isDiscordVerified: player.is_discord_verified,
              discordUsername: player.discord_username,
              discordAvatarUrl: player.discord_avatar_url,
              isConnected: player.is_connected,
              isSpectator: player.is_spectator,
              isHost: player.is_host,
              isReady: player.is_ready,
              eloRating: player.elo_rating,
              eloWins: player.elo_wins,
              eloLosses: player.elo_losses,
              eloMatches: player.elo_matches,
              isCheckedIn: player.is_checked_in,
              currentTitle: player.current_title,
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
          eloDeltas: roomData.elo_deltas?.map((d) => ({
            playerId: d.player_id,
            playerName: d.player_name,
            previousElo: d.previous_elo,
            newElo: d.new_elo,
            delta: d.delta,
            isWinner: d.is_winner,
          })),
        };

        setGameState((prev) => ({ ...prev, ...newGameState }));

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
    },
    [roomId, userSession.playerSecret, attemptRejoin, navigate, setGameState, hasLoaded, error],
  );

  useGameRefreshEffect(fetchRoom);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      // Lobby State
      if (roomCodeRef.current) gsap.set(roomCodeRef.current, { scale: 1, opacity: 1 });
      if (joinBattleCardRef.current) gsap.set(joinBattleCardRef.current, { y: 0, opacity: 1 });
      actionButtonRefs.current.forEach((btn) => btn && gsap.set(btn, { y: 0, opacity: 1 }));

      // Playing State
      if (roundStageRef.current) gsap.set(roundStageRef.current, { y: 0, opacity: 1 });
      bingoBoardRefs.current.forEach((board) => board && gsap.set(board, { x: 0, opacity: 1 }));
      if (gameInfoRef.current) gsap.set(gameInfoRef.current, { x: 0, opacity: 1 });
      return;
    }

    if (gameState.status === 'lobby') {
      // Room code does a dramatic reveal
      if (roomCodeRef.current) {
        gsap.from(roomCodeRef.current, {
          scale: 0.5,
          opacity: 0,
          ease: 'elastic.out(1, 0.5)',
          duration: 0.8,
        });
      }

      // "Join Battle" card fades in and slides up
      if (joinBattleCardRef.current) {
        gsap.from(joinBattleCardRef.current, {
          y: 20,
          opacity: 0,
          duration: 0.5,
          delay: 0.2,
        });
      }

      // Action buttons stagger in
      gsap.from(actionButtonRefs.current, {
        y: 20,
        opacity: 0,
        stagger: 0.1,
        duration: 0.4,
        delay: 0.3,
      });
    } else if (gameState.status === 'playing') {
      // RoundStage slides in from the top
      if (roundStageRef.current) {
        gsap.from(roundStageRef.current, {
          y: -20,
          opacity: 0,
          duration: 0.4,
        });
      }

      // Each BingoBoard staggers in from the left with a slight delay between players
      // Ensure there are actual producers before attempting to animate
      const producers = Object.values(gameState.players).filter((player) => !player.isSpectator);
      if (producers.length > 0) {
        gsap.from(bingoBoardRefs.current, {
          x: -30,
          opacity: 0,
          stagger: 0.15,
          duration: 0.5,
          delay: 0.1,
        });
      }

      // GameInfo sidebar slides in from the right
      if (gameInfoRef.current) {
        gsap.from(gameInfoRef.current, {
          x: 30,
          opacity: 0,
          duration: 0.5,
          delay: 0.2,
        });
      }
    }
  }, [gameState.status, gameState.players]); // Rerun animations when game state changes to 'lobby' or 'playing'

  if (loading || isReconnecting) {
    return (
      <div className="min-h-screen bg-background p-4">
        <header className="border-b border-border bg-background">
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
    <div className="min-h-screen bg-background p-4 relative">
      <header className="border-b border-border bg-background mb-4 relative z-10">
        <div className="container mx-auto flex h-10 items-center justify-between">
          <h1 className="font-['Righteous'] text-2xl md:text-3xl tracking-tight text-primary">
            Sound Royale
          </h1>
          <Button
            onClick={() => navigate('/')}
            variant="outline"
            className="border-border hover:border-primary/60 hover:shadow-md transition-all duration-200"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Lobby
          </Button>
        </div>
      </header>

      <main className="container mx-auto p-2 pb-20 lg:p-3">
        {gameState.status === 'lobby' ? (
          <div
            ref={joinBattleCardRef}
            data-testid="lobby"
            className="border-border bg-card w-full max-w-4xl mx-auto rounded-xl p-5 md:p-6 shadow-xl"
          >
            <h2 className="text-2xl font-bold mb-4">Join Battle</h2>
            {hasCurrentPlayer ? (
              <div className="text-center py-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20 mb-4 ring-4 ring-green-500/50">
                  <Users className="h-8 w-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">You're in battle!</h3>
                {isHost && activePlayersCount >= 2 ? (
                  <div className="space-y-4 mt-4">
                    <p className="text-muted-foreground">Ready to start battle!</p>
                    <Button
                      ref={(el) => (actionButtonRefs.current[0] = el)}
                      data-testid="start-battle"
                      onClick={handleStartGame}
                      className="h-12 text-xl font-bold shadow-lg w-full"
                    >
                      <Play className="mr-2 h-6 w-6" />
                      Start Battle
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground flex items-center justify-center space-x-2">
                    <span>Waiting for contestants</span>
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                    </span>
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button
                  ref={(el) => (actionButtonRefs.current[1] = el)}
                  onClick={handleJoinAsPlayer}
                  className="h-12"
                >
                  <Users className="mr-2 h-5 w-5" />
                  Join as Player
                </Button>
                <Button
                  ref={(el) => (actionButtonRefs.current[2] = el)}
                  onClick={handleJoinAsSpectator}
                  variant="outline"
                  className="h-12"
                >
                  <Settings className="mr-2 h-5 w-5" />
                  Join as Spectator
                </Button>
              </div>
            )}
            <div className="text-center text-sm text-muted-foreground space-y-2">
              <p
                ref={roomCodeRef}
                data-testid="room-id"
                className="font-mono text-3xl md:text-4xl font-bold tracking-[0.3em] text-primary bg-card/50 rounded-lg px-4 py-2 inline-block"
              >
                {room.code}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-3">
            <div ref={gameInfoRef} className="hidden lg:block lg:w-80 lg:order-1">
              <GameInfo roomId={roomId!} currentPlayerName={userSession.playerName ?? undefined} />
            </div>

            <div className="flex-1 space-y-3 lg:order-2">
              {!hasCurrentPlayer ? (
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle>Join as Spectator</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      This match is already live. You can still join the audience and help unlock
                      voting when enough spectators are present.
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
                    <div ref={roundStageRef}>
                      <RoundStage
                        roundNumber={gameState.currentRound || 1}
                        genre={gameState.roundState?.currentTileGenre}
                        timeRemaining={timeRemaining}
                        timerEndsAt={gameState.roundState?.timerEndsAt}
                        votingOpen={gameState.roundState?.votingOpen}
                        spectatorCount={
                          gameState.spectatorCount ??
                          Object.values(gameState.players).filter(
                            (player) => player.isSpectator || player.name?.startsWith('Spectator '),
                          ).length
                        }
                        votesRecorded={gameState.roundState?.votesRecorded}
                      />
                    </div>
                  )}
                  {userSession.isSpectator ? (
                    <SpectatorView bingoBoardRefs={bingoBoardRefs} />
                  ) : (
                    <div className="flex flex-col">
                      <PlayerView
                        bingoBoardRef={(el) => {
                          bingoBoardRefs.current[0] = el;
                        }}
                        roomId={roomId!}
                        playerName={userSession.playerName ?? undefined}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
      {gameState.status !== 'lobby' && hasCurrentPlayer && (
        <MobileGameDock roomId={roomId!} currentPlayerName={userSession.playerName ?? undefined} />
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
