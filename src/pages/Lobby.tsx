import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Gamepad2, Users, Crown, Plus, Loader2, Sparkles } from 'lucide-react';
import { roomApi, gameApi } from '@/services/api';
import { gameSocket, GameSocketMessage } from '@/services/gameSocket';
import { useUser } from '@/context/UserContext';
import { RoomResponse, ThemeId } from '@/types/game';
import { ThemeSelector } from '@/components/game/ThemeSelector';

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isReady?: boolean;
}

export default function Lobby() {
  const navigate = useNavigate();
  const { userSession, setPlayerName, setPlayerCredentials } = useUser();
  const [roomCode, setRoomCode] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<RoomResponse | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<ThemeId>('classic');
  const [selectedCustomGenres, setSelectedCustomGenres] = useState<string[]>([]);
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [roomNameInput, setRoomNameInput] = useState('');
  const [mode, setMode] = useState<'landing' | 'join' | 'create'>(
    userSession.playerName ? 'join' : 'landing'
  );

  // Fetch real room data when joined
  useEffect(() => {
    if (!isJoined || !roomCode) return;

    const fetchRoomData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const data = await roomApi.getRoom(roomCode);
        setRoomData(data);
        
        // Transform backend players to local format
        const transformedPlayers = data.players.map((player) => ({
          id: player.id,
          name: player.name,
          isHost: player.is_host,
          isReady: player.is_ready ?? false,
        }));
        
        setPlayers(transformedPlayers);
        
        // Set current player ID from user session or first player
        const playerId = userSession.playerId || (data.players.length > 0 ? data.players[0].id : null);
        setCurrentPlayerId(playerId);
        
        // Determine if current player is host
        if (playerId) {
          const currentPlayer = transformedPlayers.find(p => p.id === playerId);
          setIsHost(currentPlayer?.isHost ?? false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to join room');
        console.error('Error joining room:', err);
        setIsJoined(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoomData();
  }, [isJoined, roomCode]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!isJoined || !roomCode || !currentPlayerId || !userSession.playerSecret) return;

    const handleGameUpdate = (message: GameSocketMessage) => {
      if (message.type === 'game_state_update') {
        const gameState = message.payload as any;
        
        // Update players from game state
        const transformedPlayers = (gameState.players || []).map((player: any) => ({
          id: player.id,
          name: player.name,
          isHost: player.is_host,
          isReady: player.is_ready ?? false,
        }));
        
        setPlayers(transformedPlayers);
        
        // Update current player's ready status
        const currentPlayer = transformedPlayers.find(p => p.id === currentPlayerId);
        if (currentPlayer) {
          setIsReady(currentPlayer.isReady ?? false);
        }
      }
    };

    gameSocket.connect({
      gameId: roomCode,
      playerId: currentPlayerId,
      playerSecret: userSession.playerSecret,
      onMessage: handleGameUpdate,
    });

    return () => {
      gameSocket.disconnect();
    };
  }, [isJoined, roomCode, currentPlayerId, userSession.playerSecret]);

  const handleJoin = async () => {
    if (roomCode.length !== 4 || !playerNameInput.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const player = await gameApi.joinRoom(roomCode, playerNameInput.trim());

      setPlayerName(playerNameInput.trim());
      setPlayerCredentials(player.id, player.playerSecret);
      setIsJoined(true);
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
        selectedCustomGenres
      );
      const { room_code, player_id, player_secret } = response;

      setPlayerName(playerNameInput.trim());
      setPlayerCredentials(player_id, player_secret);
      setRoomCode(room_code);
      setIsJoined(true);
      setIsHost(true); // Room creator is always the host
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
      const result = await gameApi.toggleReady(currentPlayerId, userSession.playerSecret);
      setIsReady(result.is_ready);
      // WebSocket will broadcast the update to all players
    } catch (err) {
      console.error('Failed to toggle ready status:', err);
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
                    data-testid="create-room-button"
                    onClick={() => setMode('create')}
                    disabled={!playerNameInput.trim()}
                    className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-[#7C3AED] to-[#F43F5E] hover:shadow-[0_6px_20px_rgba(124,58,237,0.5)]"
                    size="lg"
                  >
                    <Plus className="mr-2 h-5 w-5" />
                    Create Room
                  </Button>

                  <Button
                    data-testid="join-room-mode-button"
                    onClick={() => setMode('join')}
                    disabled={!playerNameInput.trim()}
                    variant="outline"
                    className="w-full h-12 text-lg font-semibold border-[#7C3AED]/50 hover:bg-[#7C3AED]/10"
                    size="lg"
                  >
                    <Users className="mr-2 h-5 w-5" />
                    Join Room
                  </Button>
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
    </div>
  );
}
