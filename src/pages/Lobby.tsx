import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, Gamepad2, Crown, Loader2 } from 'lucide-react';
import { roomApi } from '@/services/api';
import { RoomResponse } from '@/types/game';

interface Player {
  id: string;
  name: string;
  isHost: boolean;
}

export default function Lobby() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isHost] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<RoomResponse | null>(null);

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
        const transformedPlayers = data.players.map((player, index) => ({
          id: player.id,
          name: player.name,
          isHost: index === 0, // First player is host
        }));
        
        setPlayers(transformedPlayers);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to join room');
        console.error('Error joining room:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoomData();
  }, [isJoined, roomCode]);

  const handleJoin = () => {
    if (roomCode.length === 4) {
      setIsJoined(true);
    }
  };

  const handleStartMatch = () => {
    navigate(`/room/${roomCode}`);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setRoomCode(value);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md border-border/30 bg-card/60 backdrop-blur-xl shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
            <Gamepad2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">Sound Royale</CardTitle>
          <CardDescription className="text-muted-foreground">
            {isJoined ? 'Waiting for players...' : 'Enter a room code to join the battle'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {!isJoined ? (
            <>
              <div className="space-y-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="0000"
                  value={roomCode}
                  onChange={handleCodeChange}
                  className="text-center text-4xl font-mono tracking-[0.5em] h-16 bg-background/50 border-border/50"
                  maxLength={4}
                />
                <p className="text-xs text-muted-foreground text-center">
                  Enter 4-digit room code
                </p>
              </div>

              <Button
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
                  {players.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/30"
                    >
                      <Avatar className="h-10 w-10 border-2 border-primary/30">
                        <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                          {player.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{player.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {player.isHost ? 'Host' : 'Ready'}
                        </p>
                      </div>
                      {player.isHost && (
                        <Crown className="h-5 w-5 text-yellow-500" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Empty slots */}
                {Array.from({ length: 2 - players.length }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-border/30"
                  >
                    <div className="h-10 w-10 rounded-full bg-muted/20 flex items-center justify-center">
                      <Users className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm text-muted-foreground/50">Waiting for player...</p>
                  </div>
                ))}
              </div>
              )}

              {/* Host controls */}
              {isHost && players.length >= 2 && (
                <Button
                  onClick={handleStartMatch}
                  className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-primary to-accent hover:opacity-90"
                  size="lg"
                >
                  <Gamepad2 className="mr-2 h-5 w-5" />
                  Start Match
                </Button>
              )}

              {/* Room code display */}
              <div className="pt-4 border-t border-border/30">
                <p className="text-xs text-muted-foreground text-center">
                  Room Code: <span className="font-mono text-primary tracking-wider">{roomCode}</span>
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
