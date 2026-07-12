import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Users, Play, Trophy } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

import { normalizeRoomWinner, roomApi, gameApi } from '@/services/api';
import { getDiscordSession } from '@/services/discordSession';
import { BingoBoard } from '@/components/game/BingoBoard';
import { PlayerView } from '@/components/game/PlayerView';
import { SpectatorView } from '@/components/game/SpectatorView';
import { GameTutorial } from '@/components/game/GameTutorial';
import { VotingPanel } from '@/components/game/VotingPanel';
import { TitleBadge } from '@/components/game/TitleBadge';
import { GameInfo } from '@/components/game/GameInfo';
import { RoundStage } from '@/components/game/RoundStage';
import { DiscordVerifiedIcon } from '@/components/game/DiscordVerifiedIcon';
import { HostMigrationIndicator } from '@/components/game/HostMigrationIndicator';
import { useGame, useGameRefresh, useGameRefreshEffect } from '@/context/useGame';
import { useUser } from '@/context/UserContext';
import type { GameState, RoomResponse, Player } from '@/types/game';

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
  const [hostMigration, setHostMigration] = useState<{ newHostName: string } | null>(null);
  const [joinName, setJoinName] = useState('');

  const {
    userSession,
    setPlayerName,
    setPlayerCredentials,
    setSpectatorMode,
    setActiveRoomSession,
    clearSession,
    isHost: isHostFunction,
    setHostStatus,
    storeTokens,
  } = useUser();
  const { setForceRefresh } = useGameRefresh();
  const { gameState, setGameState, timeRemaining } = useGame();
  const autoSpectatorJoinAttempted = useRef(false);
  const roomCodeRef = useRef(null);
  const actionButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const roundStageRef = useRef<HTMLDivElement | null>(null);
  const bingoBoardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gameInfoRef = useRef(null);

  // Track host migration: detect when host changes mid-game
  const prevHostIdRef = useRef<string | null>(null);
  useEffect(() => {
    const players = Object.values(gameState.players ?? {});
    const currentHost = players.find((p) => p.isHost && !p.isSpectator);
    const currentHostId = currentHost?.id ?? null;

    if (prevHostIdRef.current && prevHostIdRef.current !== currentHostId && currentHost) {
      setHostMigration({ newHostName: currentHost.name });
      setTimeout(() => setHostMigration(null), 5000);
    }
    prevHostIdRef.current = currentHostId;
  }, [gameState.players]);

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

    const name = (userSession.playerName || joinName).trim();
    if (!name) {
      toast.error('Enter a name to join');
      return;
    }

    try {
      const player = await gameApi.joinRoom(
        roomId,
        name.trim(),
        false,
        getDiscordSession() ?? undefined,
      );
      setPlayerName(name.trim());
      setPlayerCredentials(player.id, player.playerSecret!);
      if (player.access_token && player.refresh_token) {
        storeTokens(player.access_token, player.refresh_token);
      }
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
      if (player.access_token && player.refresh_token) {
        storeTokens(player.access_token, player.refresh_token);
      }
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
          matchType: roomData.match_type ?? 'casual',
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
          const rejoined = await attemptRejoin();
          if (!rejoined) {
            // Rejoin failed — clear stale session so player can re-join fresh
            clearSession();
            setPlayerCredentials('', '');
            setSpectatorMode(false);
          }
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

  // Auto-reset after match ends
  const [resetCountdown, setResetCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (gameState.status !== 'finished' || !userSession.playerSecret) {
      setResetCountdown(null);
      return;
    }

    setResetCountdown(5);
    const interval = setInterval(() => {
      setResetCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState.status, userSession.playerSecret]);

  useEffect(() => {
    if (resetCountdown !== 0 || !roomId || !userSession.playerSecret) return;

    gameApi
      .resetGame(roomId, userSession.playerSecret)
      .then(() => {
        setForceRefresh(Date.now());
        toast.success('New match starting!');
      })
      .catch((err) => {
        console.error('Auto-reset failed:', err);
        toast.error('Failed to start new match');
      })
      .finally(() => {
        setResetCountdown(null);
      });
  }, [resetCountdown, roomId, userSession.playerSecret, setForceRefresh]);

  if (loading || isReconnecting) {
    return (
      <div className="h-dvh flex flex-col bg-background">
        <header className="shrink-0 border-b border-border bg-background px-3 py-1.5">
          <div className="container mx-auto flex h-8 items-center justify-between">
            <h1 className="font-['Righteous'] text-lg tracking-tight text-primary">Sound Royale</h1>
            <Button
              onClick={() => navigate('/')}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Leave
            </Button>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {isReconnecting ? 'Reconnecting…' : 'Loading room…'}
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-3">
          <p className="text-destructive text-sm">{error || 'Room not found'}</p>
          <Button onClick={() => navigate('/')} variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Lobby
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-background relative">
      <header className="shrink-0 border-b border-border bg-background px-3 py-1.5">
        <div className="container mx-auto flex h-8 items-center justify-between">
          <h1 className="font-['Righteous'] text-lg md:text-xl tracking-tight text-primary">
            Sound Royale
          </h1>
          <Button
            onClick={() => navigate('/')}
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Leave
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-8">
        {gameState.status === 'lobby' ? (
          <div className="w-full max-w-xl mx-auto flex flex-col items-center">
            {/* Stage label — small, Poppins, no second Righteous wordmark */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Battle Room
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  gameState.matchType === 'ranked'
                    ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}
              >
                {gameState.matchType === 'ranked' ? 'Ranked' : 'Casual'}
              </span>
            </div>

            {/* Hero room code — the focal element */}
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 mb-3">Room Code</p>
            <p
              ref={roomCodeRef}
              data-testid="room-id"
              className="font-mono text-7xl md:text-8xl font-bold tracking-[0.25em] text-zinc-100 mb-2 leading-none"
            >
              {room.code}
            </p>
            <p className="text-sm text-zinc-500 mb-10">
              {hasCurrentPlayer
                ? "You're in. Share the code to fill the room."
                : 'Share this code to invite players.'}
            </p>

            <div className="w-full max-w-md rounded-xl bg-card border border-border p-6">
              {hasCurrentPlayer ? (
                <div className="text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15 mb-3">
                    <Users className="h-5 w-5 text-green-500" />
                  </div>
                  <h2 className="text-base font-semibold text-zinc-100 mb-1">In the arena</h2>
                  {isHost && activePlayersCount >= 2 ? (
                    <div className="space-y-3 mt-5">
                      <p className="text-xs text-zinc-500">{activePlayersCount} producers ready</p>
                      <Button
                        ref={(el) => (actionButtonRefs.current[0] = el)}
                        data-testid="start-battle"
                        onClick={handleStartGame}
                        className="h-12 w-full text-sm font-semibold uppercase tracking-wider bg-primary hover:bg-primary/90 active:scale-[0.97] text-primary-foreground rounded-lg transition-colors"
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Start Match
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 py-3">
                      <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500" />
                      <span className="text-sm text-zinc-400">Waiting for opponent…</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {!userSession.playerName && (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="join-name"
                        className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-500"
                      >
                        Your name
                      </label>
                      <Input
                        id="join-name"
                        value={joinName}
                        onChange={(e) => setJoinName(e.target.value)}
                        placeholder="Producer name"
                        maxLength={24}
                        className="h-11 bg-secondary border-border text-zinc-100"
                      />
                    </div>
                  )}

                  {/* One primary CTA — Join. Spectate is secondary */}
                  <Button
                    ref={(el) => (actionButtonRefs.current[1] = el)}
                    onClick={handleJoinAsPlayer}
                    className="h-12 w-full bg-primary hover:bg-primary/90 active:scale-[0.97] text-primary-foreground text-sm font-semibold uppercase tracking-wider rounded-lg transition-colors"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Join as Player
                  </Button>
                  <Button
                    ref={(el) => (actionButtonRefs.current[2] = el)}
                    variant="ghost"
                    onClick={handleJoinAsSpectator}
                    className="h-9 w-full text-xs text-zinc-400 hover:text-zinc-100 hover:bg-secondary"
                  >
                    Or watch as spectator
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-2 h-full w-full">
            <div
              ref={gameInfoRef}
              className="hidden lg:block lg:w-64 shrink-0 transition-all duration-200"
            >
              <GameInfo roomId={roomId!} currentPlayerName={userSession.playerName ?? undefined} />
            </div>

            <div className="lg:hidden mb-2">
              <Accordion type="single" collapsible>
                <AccordionItem value="leaderboard" className="border-none">
                  <AccordionTrigger className="rounded-lg bg-zinc-800 px-4 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-700 transition-colors">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-yellow-500" />
                      Leaderboard
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="rounded-b-lg bg-zinc-900 px-4 py-3">
                    <GameInfo
                      roomId={roomId!}
                      currentPlayerName={userSession.playerName ?? undefined}
                    />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="audience" className="border-none">
                  <AccordionTrigger className="rounded-lg bg-zinc-800 px-4 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-700 transition-colors">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-zinc-400" />
                      Audience
                      <span className="text-xs text-zinc-500">
                        ({Object.values(gameState.players).filter((p) => p.isSpectator).length})
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="rounded-b-lg bg-zinc-900 px-4 py-3">
                    {Object.values(gameState.players).filter((p) => p.isSpectator).length === 0 ? (
                      <div className="flex flex-col items-center py-3 text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-zinc-600 mb-2">
                          <Users className="h-5 w-5 text-zinc-600" />
                        </div>
                        <p className="text-xs text-zinc-500">No spectators yet</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {Object.values(gameState.players)
                          .filter((p) => p.isSpectator)
                          .map((player) => (
                            <div key={player.id} className="flex items-center gap-2">
                              <span className="text-xs text-zinc-400 truncate">{player.name}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            {/* Right Panel: Game Area (2/3) */}
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              {!hasCurrentPlayer ? (
                <div className="border border-zinc-700 bg-zinc-900 rounded-xl p-4 text-center">
                  <p className="text-sm text-zinc-400 mb-3">
                    Match is live. Join the audience to unlock voting.
                  </p>
                  <Button
                    onClick={handleJoinAsSpectator}
                    className="h-10 w-full rounded-lg text-sm border-zinc-700 text-zinc-100 hover:bg-zinc-800"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Join as Spectator
                  </Button>
                </div>
              ) : (
                <>
                  {gameState.status === 'playing' && (
                    <div ref={roundStageRef} className="shrink-0">
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
                  <div className="flex-1 min-h-0">
                    {userSession.isSpectator ? (
                      <SpectatorView bingoBoardRefs={bingoBoardRefs} />
                    ) : (
                      <PlayerView
                        bingoBoardRef={(el) => {
                          bingoBoardRefs.current[0] = el;
                        }}
                        roomId={roomId!}
                        playerName={userSession.playerName ?? undefined}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
      {/* Game Tutorial for first-time players */}
      {gameState.status === 'playing' && hasCurrentPlayer && (
        <GameTutorial
          isSpectator={userSession.isSpectator || false}
          onDismiss={handleTutorialDismiss}
          isActive={showTutorial}
        />
      )}

      {/* Host migration banner */}
      <HostMigrationIndicator
        newHostName={hostMigration?.newHostName ?? ''}
        isVisible={hostMigration !== null}
      />

      {/* Match-end overlay */}
      {gameState.status === 'finished' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 animate-in fade-in zoom-in-95 duration-300">
          <div className="text-center space-y-3 p-6 rounded-xl border border-zinc-700 bg-zinc-900 shadow-lg max-w-xs mx-4">
            <h2 className="font-['Righteous'] text-2xl text-zinc-100">
              {gameState.winner ? 'Winner!' : 'Good game'}
            </h2>
            {gameState.winner ? (
              <p className="text-base text-zinc-300">
                <span className="font-bold text-yellow-400">{gameState.winner}</span> takes the
                bingo.
              </p>
            ) : (
              <p className="text-sm text-zinc-400">No bingo this round.</p>
            )}
            {resetCountdown !== null && resetCountdown > 0 && (
              <p className="text-xs text-zinc-500">New match in {resetCountdown}s</p>
            )}
            {userSession.isHost && (
              <Button
                onClick={() => {
                  if (roomId && userSession.playerSecret) {
                    gameApi
                      .resetGame(roomId, userSession.playerSecret)
                      .then(() => {
                        setForceRefresh(Date.now());
                        toast.success('New match starting!');
                      })
                      .catch(() => toast.error('Failed to reset'));
                    setResetCountdown(null);
                  }
                }}
                className="mt-2 bg-red-500 hover:bg-red-600 text-white active:scale-[0.97] rounded-lg h-10 text-sm font-semibold transition-colors"
              >
                Play Again
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
