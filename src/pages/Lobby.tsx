import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Gamepad2, Users, Crown, Plus, Loader2, Sparkles, Trophy, HelpCircle } from 'lucide-react';
import { roomApi, gameApi, discordApi } from '@/services/api';
import { useUser } from '@/context/UserContext';
import { RoomResponse, ThemeId } from '@/types/game';
import { ThemeSelector } from '@/components/game/ThemeSelector';
import { OnboardingModal } from '@/components/game/OnboardingModal';
import { RoomBrowser } from '@/components/game/RoomBrowser';
import { GameTutorial } from '@/components/game/GameTutorial';
import { DiscordLinkModal } from '@/components/game/DiscordLinkModal';
import { DiscordProfileCard } from '@/components/game/DiscordProfileCard';
import { getDiscordSession } from '@/services/discordSession';

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isReady?: boolean;
}

export default function Lobby() {
  const navigate = useNavigate();
  const { userSession, setPlayerName, setPlayerCredentials, setActiveRoomSession } = useUser();
  const [roomCode, setRoomCode] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<ThemeId>('classic');
  const [selectedCustomGenres, setSelectedCustomGenres] = useState<string[]>([]);
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [roomNameInput, setRoomNameInput] = useState('');
  const [mode, setMode] = useState<'landing' | 'join' | 'create'>(
    userSession.playerName ? 'join' : 'landing'
  );
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showRoomBrowser, setShowRoomBrowser] = useState(false);
  const [showDiscordModal, setShowDiscordModal] = useState(false);
  const [discordAccountStatus, setDiscordAccountStatus] = useState<{
    is_linked: boolean;
    discord_username?: string;
    discord_avatar_url?: string;
    linked_at?: string;
  } | null>(null);

  // Show onboarding for first-time users
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, []);

  // Check Discord account status on mount when user has credentials
  useEffect(() => {
    const checkDiscordStatus = async () => {
      try {
        const storedDiscordSession = getDiscordSession();
        const status = userSession.playerId && userSession.playerSecret
          ? await discordApi.getAccountStatus(userSession.playerId, userSession.playerSecret)
          : storedDiscordSession
            ? await discordApi.getAccountStatusBySession(
              storedDiscordSession.discordUserId,
              storedDiscordSession.sessionSecret
            )
            : null;
        if (!status) {
          setDiscordAccountStatus(null);
          return;
        }
        setDiscordAccountStatus(status);

        // Prefill player name with Discord username if input is empty
        if (status.is_linked && status.discord_username && !playerNameInput) {
          setPlayerNameInput(status.discord_username);
        }
      } catch (error) {
        console.error('Failed to check Discord account status:', error);
      }
    };

    checkDiscordStatus();
  }, [userSession.playerId, userSession.playerSecret, playerNameInput]);

  const handleOnboardingClose = () => {
    setShowOnboarding(false);
    localStorage.setItem('hasSeenOnboarding', 'true');
  };

  const handleDiscordStatusChange = () => {
    // Re-check Discord status after modal changes
    const checkDiscordStatus = async () => {
      try {
        const storedDiscordSession = getDiscordSession();
        const status = userSession.playerId && userSession.playerSecret
          ? await discordApi.getAccountStatus(userSession.playerId, userSession.playerSecret)
          : storedDiscordSession
            ? await discordApi.getAccountStatusBySession(
              storedDiscordSession.discordUserId,
              storedDiscordSession.sessionSecret
            )
            : null;
        if (!status) {
          setDiscordAccountStatus(null);
          return;
        }
        setDiscordAccountStatus(status);
      } catch (error) {
        console.error('Failed to check Discord account status:', error);
      }
    };

    checkDiscordStatus();
  };

  const handleRoomJoined = (roomCode: string) => {
    setRoomCode(roomCode);
    setIsJoined(true);
  };

  const applyRoomData = useCallback((data: RoomResponse) => {
    const transformedPlayers = data.players.map((player) => ({
      id: player.id,
      name: player.name,
      isHost: player.is_host ?? false,
      isReady: player.is_ready ?? false,
    }));

    setPlayers(transformedPlayers);

    const playerId = userSession.playerId || (data.players.length > 0 ? data.players[0].id : null);
    setCurrentPlayerId(playerId);

    if (playerId) {
      const currentPlayer = transformedPlayers.find(p => p.id === playerId);
      setIsHost(currentPlayer?.isHost ?? false);
      setIsReady(currentPlayer?.isReady ?? false);
    }
  }, [userSession.playerId]);

  // Fetch real room data when joined. The room page owns the shared WebSocket;
  // this lobby polls so it cannot steal the singleton handler during navigation.
  useEffect(() => {
    if (!isJoined || !roomCode) return;

    let isActive = true;

    const fetchRoomData = async (showLoading: boolean) => {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const data = await roomApi.getRoom(roomCode);
        if (isActive) {
          applyRoomData(data);
          if (data.status === 'playing') {
            navigate(`/room/${roomCode}`);
          }
        }
      } catch (err) {
        if (isActive) {
          setError(err instanceof Error ? err.message : 'Failed to join room');
          console.error('Error joining room:', err);
          setIsJoined(false);
        }
      } finally {
        if (isActive && showLoading) {
          setIsLoading(false);
        }
      }
    };

    void fetchRoomData(true);
    const intervalId = setInterval(() => {
      void fetchRoomData(false);
    }, 2000);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [isJoined, roomCode, applyRoomData, navigate]);

  const handleJoin = async () => {
    if (roomCode.length !== 4 || !playerNameInput.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const room = await roomApi.getRoom(roomCode);
      const isSpectatorJoin = room.status === 'playing';
      const player = await gameApi.joinRoom(
        roomCode,
        playerNameInput.trim(),
        isSpectatorJoin,
        getDiscordSession() ?? undefined
      );

      const activePlayerName = isSpectatorJoin ? player.name : playerNameInput.trim();
      setPlayerName(activePlayerName);
      setPlayerCredentials(player.id, player.playerSecret);
      setActiveRoomSession(roomCode, {
        playerName: activePlayerName,
        playerId: player.id,
        playerSecret: player.playerSecret,
        isSpectator: isSpectatorJoin,
      });
      navigate(`/room/${roomCode}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join room';
      setError(message);
      console.error('Error joining room:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!playerNameInput.trim() || !roomNameInput.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await roomApi.createRoom(
        roomNameInput.trim(),
        playerNameInput.trim(),
        undefined,
        selectedThemeId,
        selectedCustomGenres,
        getDiscordSession() ?? undefined
      );
      const { room_code, player_id, player_secret } = response;

      setPlayerName(playerNameInput.trim());
      setPlayerCredentials(player_id, player_secret);
      setActiveRoomSession(room_code, {
        playerName: playerNameInput.trim(),
        playerId: player_id,
        playerSecret: player_secret,
        isSpectator: false,
      });
      setRoomCode(room_code);
      setIsHost(true); // Room creator is always the host
      navigate(`/room/${room_code}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create room';
      setError(message);
      console.error('Error creating room:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartMatch = () => {
    navigate(`/room/${roomCode}`);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setRoomCode(value);
  };

  const handleToggleReady = async () => {
    if (!currentPlayerId || !userSession.playerSecret) return;

    try {
      const result = await gameApi.toggleReady(roomCode, currentPlayerId, userSession.playerSecret);
      setIsReady(result.is_ready);
      setPlayers(prevPlayers => prevPlayers.map(player =>
        player.id === result.player_id
          ? { ...player, isReady: result.is_ready }
          : player
      ));
    } catch (err) {
      console.error('Failed to toggle ready status:', err);
    }
  };

  const handleQuickMatch = async () => {
    if (!playerNameInput.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      // Try to find an available room with slots
      const rooms = await roomApi.getRooms();
      const availableRoom = rooms.find(r => r.players.length < 2 && r.status === 'lobby');

      if (availableRoom) {
        // Join the available room
        const player = await gameApi.joinRoom(
          availableRoom.code,
          playerNameInput.trim(),
          false,
          getDiscordSession() ?? undefined
        );
        setPlayerName(playerNameInput.trim());
        setPlayerCredentials(player.id, player.playerSecret);
        setActiveRoomSession(availableRoom.code, {
          playerName: playerNameInput.trim(),
          playerId: player.id,
          playerSecret: player.playerSecret,
          isSpectator: false,
        });
        setRoomCode(availableRoom.code);
        navigate(`/room/${availableRoom.code}`);
      } else {
        // No available room, create one
        const response = await roomApi.createRoom(
          'Quick Match Room',
          playerNameInput.trim(),
          undefined,
          'classic',
          [],
          getDiscordSession() ?? undefined
        );
        const { room_code, player_id, player_secret } = response;
        setPlayerName(playerNameInput.trim());
        setPlayerCredentials(player_id, player_secret);
        setActiveRoomSession(room_code, {
          playerName: playerNameInput.trim(),
          playerId: player_id,
          playerSecret: player_secret,
          isSpectator: false,
        });
        setRoomCode(room_code);
        setIsHost(true);
        navigate(`/room/${room_code}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start quick match';
      setError(message);
      console.error('Error in quick match:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div data-testid="lobby" className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-50 opacity-20 bg-[linear-gradient(0deg,transparent_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px]" />
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#7C3AED]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#F43F5E]/10 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md border-[#7C3AED]/30 bg-[#0F0F23]/80 backdrop-blur-xl shadow-[0_25px_50px_rgba(0,0,0,0.5),0_0_0_1px_rgba(124,58,237,0.1)] card-enter">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#7C3AED]/20 neon-glow">
            <Gamepad2 className="h-8 w-8 text-[#7C3AED]" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight font-['Righteous'] text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] to-[#F43F5E] drop-shadow-[0_0_10px_rgba(124,58,237,0.5)]">
            Sound Royale
          </CardTitle>
          <CardDescription className="text-[#E2E8F0]/70">
            {isJoined ? 'Waiting for players...' : 'Enter a room code to join the battle'}
          </CardDescription>
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOnboarding(true)}
              className="text-[#7C3AED] hover:text-[#A78BFA] hover:bg-[#7C3AED]/10"
            >
              <HelpCircle className="mr-2 h-4 w-4" />
              How to Play
            </Button>
            <Link to="/leaderboard">
              <Button variant="ghost" size="sm" className="text-[#7C3AED] hover:text-[#A78BFA] hover:bg-[#7C3AED]/10">
                <Trophy className="mr-2 h-4 w-4" />
                View Leaderboard
              </Button>
            </Link>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {!isJoined ? (
            <>
              {/* Player Name — required for both join and create */}
              <div className="space-y-2">
                <Input
                  data-testid="player-name-input"
                  type="text"
                  placeholder="Enter your name"
                  value={playerNameInput}
                  onChange={(e) => setPlayerNameInput(e.target.value.slice(0, 20))}
                  className="text-center text-xl h-12 bg-[#0F0F23]/50 border-[#7C3AED]/50 focus:border-[#A78BFA] focus:shadow-[0_0_30px_rgba(124,58,237,0.5),inset_0_0_20px_rgba(124,58,237,0.1)] transition-all duration-200"
                  maxLength={20}
                />
              </div>

              {mode === 'landing' && (
                <div className="space-y-3">
                  <Button
                    data-testid="quick-match-button"
                    onClick={handleQuickMatch}
                    disabled={!playerNameInput.trim() || isLoading}
                    className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-[#7C3AED] to-[#F43F5E] hover:shadow-[0_6px_20px_rgba(124,58,237,0.5)]"
                    size="lg"
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Gamepad2 className="mr-2 h-5 w-5" />
                    )}
                    {isLoading ? 'Finding Match...' : 'Quick Match'}
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      data-testid="create-room-button"
                      onClick={() => setMode('create')}
                      disabled={!playerNameInput.trim()}
                      variant="outline"
                      className="flex-1 h-10 text-sm font-semibold border-[#7C3AED]/50 hover:bg-[#7C3AED]/10"
                      size="sm"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create
                    </Button>

                    <Button
                      data-testid="join-room-mode-button"
                      onClick={() => setMode('join')}
                      disabled={!playerNameInput.trim()}
                      variant="outline"
                      className="flex-1 h-10 text-sm font-semibold border-[#7C3AED]/50 hover:bg-[#7C3AED]/10"
                      size="sm"
                    >
                      <Users className="mr-2 h-4 w-4" />
                      Join
                    </Button>
                  </div>

                  <Button
                    onClick={() => setShowRoomBrowser(true)}
                    variant="ghost"
                    size="sm"
                    className="w-full text-sm text-[#7C3AED] hover:text-[#A78BFA] hover:bg-[#7C3AED]/10"
                  >
                    Browse Rooms
                  </Button>

                  {discordAccountStatus?.is_linked && discordAccountStatus.discord_username ? (
                    <DiscordProfileCard
                      discordUsername={discordAccountStatus.discord_username}
                      discordAvatarUrl={discordAccountStatus.discord_avatar_url}
                      linkedAt={discordAccountStatus.linked_at}
                      onManage={() => setShowDiscordModal(true)}
                    />
                  ) : (
                    <Button
                      onClick={() => setShowDiscordModal(true)}
                      variant="ghost"
                      size="sm"
                      className="w-full text-sm text-[#5865F2] hover:text-[#7C3AED] hover:bg-[#5865F2]/10 gap-2"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                      </svg>
                      Link Discord
                    </Button>
                  )}
                </div>
              )}

              {mode === 'join' && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                  <div className="space-y-2">
                    <Input
                      data-testid="room-code-input"
                      type="text"
                      inputMode="numeric"
                      placeholder="0000"
                      value={roomCode}
                      onChange={handleCodeChange}
                      className="text-center text-4xl font-mono tracking-[0.5em] h-16 bg-[#0F0F23]/50 border-[#7C3AED]/50 focus:border-[#A78BFA] focus:shadow-[0_0_30px_rgba(124,58,237,0.5),inset_0_0_20px_rgba(124,58,237,0.1)] transition-all duration-200"
                      maxLength={4}
                    />
                    <p className="text-xs text-[#E2E8F0]/50 text-center">
                      Enter 4-digit room code
                    </p>
                  </div>

                  <Button
                    data-testid="join-room-button"
                    onClick={handleJoin}
                    disabled={roomCode.length !== 4 || isLoading}
                    className="w-full h-12 text-lg font-semibold"
                    size="lg"
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Users className="mr-2 h-5 w-5" />
                    )}
                    {isLoading ? 'Joining...' : 'Join Room'}
                  </Button>

                  {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm text-center">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={() => { setMode('landing'); setError(null); }}
                    className="w-full text-sm text-[#E2E8F0]/50 hover:text-[#E2E8F0] transition-colors"
                  >
                    ← Back
                  </button>
                </div>
              )}

              {mode === 'create' && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                  <div className="space-y-2">
                    <Input
                      data-testid="create-room-name-input"
                      type="text"
                      placeholder="Room name"
                      value={roomNameInput}
                      onChange={(e) => setRoomNameInput(e.target.value.slice(0, 30))}
                      className="text-center text-xl h-12 bg-[#0F0F23]/50 border-[#7C3AED]/50 focus:border-[#A78BFA] focus:shadow-[0_0_30px_rgba(124,58,237,0.5),inset_0_0_20px_rgba(124,58,237,0.1)] transition-all duration-200"
                      maxLength={30}
                    />
                  </div>

                  <ThemeSelector
                    selectedThemeId={selectedThemeId}
                    onThemeChange={setSelectedThemeId}
                    onCustomGenresChange={setSelectedCustomGenres}
                  />

                  <Button
                    data-testid="create-room-submit-button"
                    onClick={handleCreateRoom}
                    disabled={!roomNameInput.trim() || isLoading}
                    className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-[#7C3AED] to-[#F43F5E] hover:shadow-[0_6px_20px_rgba(124,58,237,0.5)]"
                    size="lg"
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-5 w-5" />
                    )}
                    {isLoading ? 'Creating...' : 'Create Room'}
                  </Button>

                  {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm text-center">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={() => setMode('landing')}
                    className="w-full text-sm text-[#E2E8F0]/50 hover:text-[#E2E8F0] transition-colors"
                  >
                    ← Back
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Error display */}
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  {error}
                </div>
              )}

              {/* Loading state */}
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}

              {/* Players list */}
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
                      className="flex items-center gap-3 p-3 rounded-lg bg-[#0F0F23]/50 border border-[#7C3AED]/30 hover:border-[#7C3AED]/60 hover:shadow-[0_4px_12px_rgba(124,58,237,0.2)] hover:-translate-y-0.5 transition-all duration-200 stagger-enter"
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <Avatar className="h-10 w-10 border-2 border-[#7C3AED]/30">
                        <AvatarFallback className="bg-[#7C3AED]/20 text-[#7C3AED] font-semibold font-['Poppins']">
                          {player.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium text-[#E2E8F0]">{player.name}</p>
                        <p className="text-xs text-[#E2E8F0]/60">
                          {player.isHost ? 'Host' : player.isReady ? '✓ Ready' : 'Not Ready'}
                        </p>
                      </div>
                      {player.isHost && (
                        <Crown className="h-5 w-5 text-[#EAB308] crown-glow drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]" />
                      )}
                      {player.isReady && !player.isHost && (
                        <div className="h-3 w-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
                      )}
                    </div>
                  ))}
                </div>

                {Array.from({ length: 2 - players.length }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-[#64748B]/40 bg-[#64748B]/10"
                  >
                    <div className="h-10 w-10 rounded-full border-2 border-dashed border-[#64748B]/40 flex items-center justify-center pulse-waiting">
                      <Users className="h-5 w-5 text-[#64748B]/60" />
                    </div>
                    <p className="text-sm text-[#64748B]/70 italic">Waiting for player...</p>
                  </div>
                ))}
              </div>
              )}

              {/* Ready toggle button - show for non-host players */}
              {!isHost && players.length >= 1 && (
                <Button
                  onClick={handleToggleReady}
                  className={`w-full h-12 text-lg font-semibold font-['Righteous'] tracking-wider uppercase transition-all duration-200 border-0 ${
                    isReady
                      ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:shadow-[0_6px_20px_rgba(34,197,94,0.5)]'
                      : 'bg-gradient-to-r from-[#7C3AED] to-[#F43F5E] hover:shadow-[0_6px_20px_rgba(124,58,237,0.5)]'
                  }`}
                  size="lg"
                >
                  {isReady ? '✓ I\'m Ready!' : 'Click When Ready'}
                </Button>
              )}

              {isHost && players.length >= 2 && (
                <Button
                  data-testid="start-game"
                  onClick={handleStartMatch}
                  className="w-full h-12 text-lg font-semibold font-['Righteous'] tracking-wider uppercase bg-gradient-to-r from-[#7C3AED] to-[#F43F5E] hover:shadow-[0_6px_20px_rgba(124,58,237,0.5),0_0_40px_rgba(244,63,94,0.3)] shadow-[0_4px_15px_rgba(124,58,237,0.4),0_0_30px_rgba(244,63,94,0.2)] transition-all duration-200 border-0"
                  size="lg"
                >
                  <Gamepad2 className="mr-2 h-5 w-5" />
                  Start Match
                </Button>
              )}

              <div className="pt-4 border-t border-[#7C3AED]/20">
                <p className="text-xs text-[#E2E8F0]/60 text-center">
                  Room Code: <span className="font-mono text-[#7C3AED] tracking-wider neon-text">{roomCode}</span>
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Onboarding Modal */}
      <OnboardingModal isOpen={showOnboarding} onClose={handleOnboardingClose} />

      {/* Room Browser */}
      <RoomBrowser isOpen={showRoomBrowser} onClose={() => setShowRoomBrowser(false)} onRoomJoined={handleRoomJoined} />

      {/* Discord Link Modal */}
      <DiscordLinkModal
        isOpen={showDiscordModal}
        onClose={() => setShowDiscordModal(false)}
        onStatusChange={handleDiscordStatusChange}
      />
    </div>
  );
}
