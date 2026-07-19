import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Clock, Sparkles } from 'lucide-react';
import { roomApi, gameApi } from '@/services/api';
import { getDiscordSession } from '@/services/discordSession';
import { RoomResponse } from '@/types/game';
import { useUser } from '@/context/UserContext';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface RoomBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onRoomJoined: (roomCode: string) => void;
}

export const RoomBrowser: React.FC<RoomBrowserProps> = ({ isOpen, onClose, onRoomJoined }) => {
  const navigate = useNavigate();
  const { userSession, setPlayerCredentials, setActiveRoomSession, storeTokens } = useUser();
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [joiningRoomCode, setJoiningRoomCode] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadRooms();
    }
  }, [isOpen]);

  const loadRooms = async () => {
    setIsLoading(true);
    try {
      const allRooms = await roomApi.getRooms();
      // Filter for rooms in lobby status with available slots
      const availableRooms = allRooms.filter((r) => r.status === 'lobby' && r.players.length < 2);
      setRooms(availableRooms);
    } catch (error) {
      console.error('Failed to load rooms:', error);
      toast.error('Failed to load rooms');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async (room: RoomResponse) => {
    if (!userSession.playerName) {
      toast.error('Please enter your name first');
      return;
    }

    setJoiningRoomCode(room.code);
    try {
      const player = await gameApi.joinRoom(
        room.code,
        userSession.playerName!,
        false,
        getDiscordSession() ?? undefined,
      );
      setPlayerCredentials(player.id, player.playerSecret!);
      if (player.access_token && player.refresh_token) {
        storeTokens(player.access_token, player.refresh_token);
      }
      setActiveRoomSession(room.code, {
        playerName: userSession.playerName!,
        playerId: player.id,
        playerSecret: player.playerSecret!,
        isSpectator: false,
      });
      onRoomJoined(room.code);
      onClose();
      toast.success('Joined room!');
      navigate(`/room/${room.code}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join room';
      toast.error(message);
      console.error('Failed to join room:', error);
    } finally {
      setJoiningRoomCode(null);
    }
  };

  const getRoomStatus = (room: RoomResponse) => {
    if (room.status === 'playing') return 'In Progress';
    if (room.status === 'finished') return 'Finished';
    if (room.players.length >= 2) return 'Full';
    return 'Open';
  };

  const getStatusColor = (room: RoomResponse) => {
    if (room.status === 'playing') return 'text-orange-400';
    if (room.status === 'finished') return 'text-gray-400';
    if (room.players.length >= 2) return 'text-red-400';
    return 'text-green-400';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-background border-border text-white max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold font-['Righteous'] text-foreground">
            Available Rooms
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-t-transparent border-primary" />
            </div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary/50" />
              <p className="text-gray-400">No available rooms found</p>
              <p className="text-sm text-gray-500 mt-2">Create a room to start playing!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rooms.map((room) => (
                <Card
                  key={room.code}
                  className="bg-card border-border hover:border-primary/60 transition-colors"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-white mb-1">Room {room.code}</h4>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>{room.players.length}/2 players</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span className={getStatusColor(room)}>{getRoomStatus(room)}</span>
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleJoinRoom(room)}
                        disabled={
                          joiningRoomCode === room.code ||
                          room.players.length >= 2 ||
                          room.status !== 'lobby'
                        }
                        className="bg-primary hover:opacity-90"
                      >
                        {joiningRoomCode === room.code ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-4 border-t-transparent border-white" />
                        ) : (
                          'Join'
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="pt-4 border-t border-border">
            <Button
              onClick={loadRooms}
              variant="outline"
              className="w-full border-border hover:bg-primary/10"
            >
              Refresh Rooms
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
