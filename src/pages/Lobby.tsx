import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Gamepad2, HelpCircle, Trophy } from 'lucide-react';
import { roomApi, gameApi, discordApi } from '@/services/api';
import { useUser } from '@/context/UserContext';
import { ThemeId, DiscordAccountStatus } from '@/types/game';
import { getDiscordSession } from '@/services/discordSession';
import { LobbyModeSwitcher } from '@/components/lobby/LobbyModeSwitcher';
import { LobbyModals } from '@/components/lobby/LobbyModals';
import { gsap } from 'gsap';

export default function Lobby() {
  const navigate = useNavigate();
  const { userSession, setPlayerName, setPlayerCredentials, setActiveRoomSession, ensureAnonymousSession } = useUser();
  const iconRef = useRef(null);
  const titleRef = useRef(null);
  const taglineRef = useRef(null);
  const mainCardRef = useRef(null);
  const buttonRefs = useRef([]); // To hold references for dynamic buttons
  const [roomCode, setRoomCode] = useState('');
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

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      // Skip animations if reduced motion is preferred
      if (iconRef.current) gsap.set(iconRef.current, { scale: 1 });
      if (titleRef.current) gsap.set(titleRef.current, { y: 0, opacity: 1 });
      if (taglineRef.current) gsap.set(taglineRef.current, { y: 0, opacity: 1 });
      if (mainCardRef.current) gsap.set(mainCardRef.current, { y: 0, opacity: 1 });
      buttonRefs.current.forEach(btn => btn && gsap.set(btn, { scale: 1, opacity: 1 }));
      return;
    }

    // Header icon scales up from 0 with a bounce
    if (iconRef.current) {
      gsap.from(iconRef.current, {
        scale: 0,
        ease: "back.out(1.7)",
        duration: 0.6,
      });
    }

    // Title slides down from y: -30 with fade
    if (titleRef.current) {
      gsap.from(titleRef.current, {
        y: -30,
        opacity: 0,
        duration: 0.5,
        delay: 0.2,
      });
    }

    // Tagline slides down from y: -20 with fade
    if (taglineRef.current) {
      gsap.from(taglineRef.current, {
        y: -20,
        opacity: 0,
        duration: 0.5,
        delay: 0.25, // Slightly after title
      });
    }

    // Main content card slides up from y: 40 with fade
    if (mainCardRef.current) {
      gsap.from(mainCardRef.current, {
        y: 40,
        opacity: 0,
        duration: 0.5,
        delay: 0.3,
      });
    }

    // Each button staggers in with a slight scale pop
    gsap.from(buttonRefs.current, {
      scale: 0.8,
      opacity: 0,
      stagger: 0.08,
      duration: 0.4,
      delay: 0.4,
    });
  }, []);

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

       <div className="relative z-10 max-w-2xl mx-auto px-4 py-4 md:py-6">
        {/* Header */}
        <div className="text-center mb-5">
          <div ref={iconRef} className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border-2 border-primary/20 mb-6">
            <Gamepad2 className="h-8 w-8 text-primary" />
          </div>
          <h1 ref={titleRef} className="text-4xl md:text-5xl font-['Righteous'] tracking-tight text-primary mb-2">
            SOUND ROYALE
          </h1>
          <p ref={taglineRef} className="text-sm text-muted-foreground italic">
            The High-Stakes Game Show for Music Producers
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <Button
              ref={(el) => (buttonRefs.current[0] = el)}
              variant="ghost"
              size="sm"
              onClick={() => setShowOnboarding(true)}
              className="text-muted-foreground hover:text-primary"
            >
              <HelpCircle className="mr-1.5 h-4 w-4" />
              How to Play
            </Button>
            <Link to="/leaderboard">
              <Button ref={(el) => (buttonRefs.current[1] = el)} variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                <Trophy className="mr-1.5 h-4 w-4" />
                Leaderboard
              </Button>
            </Link>
          </div>
        </div>

        {/* Main content card */}
        <div ref={mainCardRef} className="bg-card border-2 border-muted-foreground/20 rounded-xl p-5 md:p-6 shadow-xl card-enter">
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