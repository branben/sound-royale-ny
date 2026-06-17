import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gamepad2, Trophy, HelpCircle } from 'lucide-react';
import { roomApi, gameApi, discordApi } from '@/services/api';
import { useUser } from '@/context/UserContext';
import { ThemeId } from '@/types/game';
import { OnboardingModal } from '@/components/game/OnboardingModal';
import { RoomBrowser } from '@/components/game/RoomBrowser';
import { DiscordLinkModal } from '@/components/game/DiscordLinkModal';
import { getDiscordSession } from '@/services/discordSession';
import { PlayerNameInput } from '@/components/lobby/PlayerNameInput';
import { LobbyLanding } from '@/components/lobby/LobbyLanding';
import { JoinRoomForm } from '@/components/lobby/JoinRoomForm';
import { CreateRoomForm } from '@/components/lobby/CreateRoomForm';

interface DiscordAccountStatus {
  is_linked: boolean;
  discord_username?: string;
  discord_avatar_url?: string;
  linked_at?: string;
}

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
    <div data-testid="lobby" className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <Card className="w-full max-w-md border-border bg-card card-enter">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Gamepad2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight font-['Righteous'] text-foreground">
            Sound Royale
          </CardTitle>
          <CardDescription className="text-foreground/70">
            Enter a room code to join the battle
          </CardDescription>
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOnboarding(true)}
              className="text-primary hover:text-primary hover:bg-primary/10"
            >
              <HelpCircle className="mr-2 h-4 w-4" />
              How to Play
            </Button>
            <Link to="/leaderboard">
              <Button variant="ghost" size="sm" className="text-primary hover:text-primary hover:bg-primary/10">
                <Trophy className="mr-2 h-4 w-4" />
                View Leaderboard
              </Button>
            </Link>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <PlayerNameInput
            value={playerNameInput}
            onChange={setPlayerNameInput}
          />

          {mode === 'landing' && (
            <LobbyLanding
              playerNameInput={playerNameInput}
              isLoading={isLoading}
              discordAccountStatus={discordAccountStatus}
              onQuickMatch={handleQuickMatch}
              onCreateMode={() => setMode('create')}
              onJoinMode={() => setMode('join')}
              onBrowseRooms={() => setShowRoomBrowser(true)}
              onLinkDiscord={handleLinkDiscord}
              onManageDiscord={() => setShowDiscordModal(true)}
            />
          )}

          {mode === 'join' && (
            <JoinRoomForm
              roomCode={roomCode}
              isLoading={isLoading}
              error={error}
              onCodeChange={handleCodeChange}
              onJoin={handleJoin}
              onBack={() => { setMode('landing'); setError(null); }}
            />
          )}

          {mode === 'create' && (
            <CreateRoomForm
              roomNameInput={roomNameInput}
              selectedThemeId={selectedThemeId}
              selectedCustomGenres={selectedCustomGenres}
              isLoading={isLoading}
              error={error}
              onRoomNameChange={setRoomNameInput}
              onThemeChange={setSelectedThemeId}
              onCustomGenresChange={setSelectedCustomGenres}
              onCreate={handleCreateRoom}
              onBack={() => setMode('landing')}
            />
          )}
        </CardContent>
      </Card>

      <OnboardingModal isOpen={showOnboarding} onClose={handleOnboardingClose} />

      <RoomBrowser isOpen={showRoomBrowser} onClose={() => setShowRoomBrowser(false)} onRoomJoined={handleRoomJoined} />

      <DiscordLinkModal
        isOpen={showDiscordModal}
        onClose={() => setShowDiscordModal(false)}
        onStatusChange={handleDiscordStatusChange}
      />
    </div>
  );
}
