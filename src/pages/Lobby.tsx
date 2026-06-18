import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Gamepad2, HelpCircle, Trophy } from 'lucide-react';
import { roomApi, gameApi, discordApi } from '@/services/api';
import { useUser } from '@/context/UserContext';
import { ThemeId, DiscordAccountStatus } from '@/types/game';
import { getDiscordSession } from '@/services/discordSession';
import { LobbyModeSwitcher } from '@/components/lobby/LobbyModeSwitcher';
import { LobbyModals } from '@/components/lobby/LobbyModals';

export default function Lobby() {
  const navigate = useNavigate();
  const { userSession, setPlayerName, setPlayerCredentials, setActiveRoomSession, ensureAnonymousSession } = useUser();
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [discordAccountStatus, setDiscordAccountStatus] = useState<DiscordAccountStatus | null>(null);

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
        const status = storedDiscordSession
          ? await discordApi.getAccountStatusBySession(
            storedDiscordSession.discordUserId,
            storedDiscordSession.sessionSecret
          )
          : userSession.playerId && userSession.playerSecret
            ? await discordApi.getAccountStatus(userSession.playerId, userSession.playerSecret)
            : null;
        if (!status) {
          setDiscordAccountStatus(null);
          return;
        }
        setDiscordAccountStatus(status);

        if (status.is_linked && status.discord_username && !playerNameInput) {
          setPlayerNameInput(status.discord_username);
        }
      } catch (err) {
        console.error('Failed to check Discord account status:', err);
      }
    };

    checkDiscordStatus();
  }, [userSession.playerId, userSession.playerSecret, playerNameInput]);

  const handleOnboardingClose = () => {
    setShowOnboarding(false);
    localStorage.setItem('hasSeenOnboarding', 'true');
  };

  const handleDiscordStatusChange = () => {
    const checkDiscordStatus = async () => {
      try {
        const storedDiscordSession = getDiscordSession();
        const status = storedDiscordSession
          ? await discordApi.getAccountStatusBySession(
            storedDiscordSession.discordUserId,
            storedDiscordSession.sessionSecret
          )
          : userSession.playerId && userSession.playerSecret
            ? await discordApi.getAccountStatus(userSession.playerId, userSession.playerSecret)
            : null;
        if (!status) {
          setDiscordAccountStatus(null);
          return;
        }
        setDiscordAccountStatus(status);
      } catch (err) {
        console.error('Failed to check Discord account status:', err);
      }
    };

    checkDiscordStatus();
  };

  const handleRoomJoined = (joinedRoomCode: string) => {
    setRoomCode(joinedRoomCode);
  };

  const handleJoin = async () => {
    const activeName = playerNameInput.trim() || userSession.playerName?.trim() || '';
    if (roomCode.length !== 4 || !activeName) return;

    setIsLoading(true);
    setError(null);

    try {
      const room = await roomApi.getRoom(roomCode);
      const isSpectatorJoin = room.status === 'playing';
      const player = await gameApi.joinRoom(
        roomCode,
        activeName,
        isSpectatorJoin,
        getDiscordSession() ?? undefined
      );

      const activePlayerName = isSpectatorJoin ? player.name : activeName;
      setPlayerName(activePlayerName);
      setPlayerCredentials(player.id, player.playerSecret!);
      setActiveRoomSession(roomCode, {
        playerName: activePlayerName,
        playerId: player.id,
        playerSecret: player.playerSecret!,
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
        isHost: true,
      });
      setRoomCode(room_code);
      navigate(`/room/${room_code}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create room';
      setError(message);
      console.error('Error creating room:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setRoomCode(value);
  };

  const handleQuickMatch = async () => {
    if (!playerNameInput.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const rooms = await roomApi.getRooms();
      const availableRoom = rooms.find(r => r.players.length < 2 && r.status === 'lobby');

      if (availableRoom) {
        const player = await gameApi.joinRoom(
          availableRoom.code,
          playerNameInput.trim(),
          false,
          getDiscordSession() ?? undefined
        );
        setPlayerName(playerNameInput.trim());
        setPlayerCredentials(player.id, player.playerSecret!);
        setActiveRoomSession(availableRoom.code, {
          playerName: playerNameInput.trim(),
          playerId: player.id,
          playerSecret: player.playerSecret!,
          isSpectator: false,
        });
        setRoomCode(availableRoom.code);
        navigate(`/room/${availableRoom.code}`);
      } else {
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
          isHost: true,
        });
        setRoomCode(room_code);
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

  const handleLinkDiscord = () => {
    ensureAnonymousSession?.();
    setShowDiscordModal(true);
  };

  return (
    <div data-testid="lobby" className="min-h-screen bg-background relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8 md:py-16">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 border-2 border-primary/20 mb-6">
            <Gamepad2 className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-5xl md:text-7xl font-['Righteous'] tracking-tight text-primary mb-2">
            SOUND ROYALE
          </h1>
          <p className="text-base md:text-lg text-muted-foreground italic">
            The High-Stakes Game Show for Music Producers
          </p>
          <div className="flex items-center justify-center gap-4 mt-5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOnboarding(true)}
              className="text-muted-foreground hover:text-primary"
            >
              <HelpCircle className="mr-1.5 h-4 w-4" />
              How to Play
            </Button>
            <Link to="/leaderboard">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                <Trophy className="mr-1.5 h-4 w-4" />
                Leaderboard
              </Button>
            </Link>
          </div>
        </div>

        {/* Main content card */}
        <div className="bg-card border-2 border-muted-foreground/20 rounded-xl p-6 md:p-8 shadow-xl card-enter">
          <LobbyModeSwitcher
            mode={mode}
            playerNameInput={playerNameInput}
            roomCode={roomCode}
            roomNameInput={roomNameInput}
            selectedThemeId={selectedThemeId}
            selectedCustomGenres={selectedCustomGenres}
            isLoading={isLoading}
            error={error}
            discordAccountStatus={discordAccountStatus}
            onPlayerNameChange={setPlayerNameInput}
            onRoomNameChange={setRoomNameInput}
            onThemeChange={setSelectedThemeId}
            onCustomGenresChange={setSelectedCustomGenres}
            onCodeChange={handleCodeChange}
            onJoin={handleJoin}
            onCreate={handleCreateRoom}
            onQuickMatch={handleQuickMatch}
            onCreateMode={() => setMode('create')}
            onJoinMode={() => setMode('join')}
            onBack={() => { setMode('landing'); setError(null); }}
            onBrowseRooms={() => setShowRoomBrowser(true)}
            onLinkDiscord={handleLinkDiscord}
            onManageDiscord={() => setShowDiscordModal(true)}
          />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50 mt-8">
          v0.1.0 · Made with ❤️ for music producers
        </p>
      </div>

      <LobbyModals
        showOnboarding={showOnboarding}
        showRoomBrowser={showRoomBrowser}
        showDiscordModal={showDiscordModal}
        onOnboardingClose={handleOnboardingClose}
        onRoomBrowserClose={() => setShowRoomBrowser(false)}
        onRoomJoined={handleRoomJoined}
        onDiscordModalClose={() => setShowDiscordModal(false)}
        onDiscordStatusChange={handleDiscordStatusChange}
      />
    </div>
  );
}
