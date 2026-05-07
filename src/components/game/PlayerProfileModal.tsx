import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Music2, Trophy, TrendingUp, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Player, ScoreInfo, GenrePerformance } from '@/types/game';
import { gameApi } from '@/services/api';
import { GenreHeatmap } from './GenreHeatmap';
import { TitleBadge } from './TitleBadge';
import { toast } from 'sonner';

interface PlayerProfileModalProps {
  player: Player;
  isOpen: boolean;
  onClose: () => void;
  scoreInfo?: ScoreInfo | null;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  player,
  isOpen,
  onClose,
  scoreInfo
}) => {
  const isConnected = player.isConnected ?? true;
  const [genrePerformance, setGenrePerformance] = useState<GenrePerformance[]>([]);
  const [isLoadingHeatmap, setIsLoadingHeatmap] = useState(false);

  // Fetch genre performance when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isActive = true;
    setIsLoadingHeatmap(true);
    setGenrePerformance([]);

    gameApi.getGenrePerformance(player.id)
      .then(data => {
        if (isActive) {
          setGenrePerformance(data);
        }
      })
      .catch(() => {
        if (isActive) {
          setGenrePerformance([]);
          toast.error('Failed to load genre performance');
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingHeatmap(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [isOpen, player.id]);

  // Generate initials from player name
  const initials = player.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        data-testid="player-profile-modal"
        className="max-h-[90dvh] max-w-[calc(100vw-2rem)] overflow-y-auto border-[#7C3AED]/30 bg-[#0F0F23]/95 backdrop-blur-xl sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Player Profile</DialogTitle>
          <DialogDescription className="text-gray-400">
            View detailed player information and statistics
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Player Header */}
          <Card className="bg-[#0F0F23]/60 border-[#7C3AED]/20">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-[#7C3AED]/50">
                  <AvatarFallback className="bg-[#7C3AED]/20 text-[#7C3AED] font-bold text-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <CardTitle className="truncate text-xl text-white">{player.name}</CardTitle>
                    <TitleBadge title={player.currentTitle} />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {isConnected ? (
                      <div className="flex items-center gap-1 text-green-400 text-sm">
                        <Wifi className="h-3 w-3" />
                        <span>Online</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-red-400 text-sm">
                        <WifiOff className="h-3 w-3" />
                        <span>Offline</span>
                      </div>
                    )}
                    {player.isHost && (
                      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                        Host
                      </Badge>
                    )}
                    {player.isSpectator && (
                      <Badge variant="outline" className="border-gray-500/30 text-gray-400">
                        Spectator
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Current Score */}
          {scoreInfo && (
            <Card className="bg-[#0F0F23]/60 border-[#7C3AED]/20">
              <CardHeader>
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Current Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-4xl font-bold text-white mb-2">{scoreInfo.score}</div>
                  <div className="text-sm text-gray-400">points</div>
                  {scoreInfo.lines.length > 0 && (
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <Badge className="bg-[#7C3AED]/20 text-[#7C3AED] border-[#7C3AED]/30">
                        {scoreInfo.lines.length} Bingo Line{scoreInfo.lines.length > 1 ? 's' : ''}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-[#0F0F23]/60 border-[#7C3AED]/20">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[#7C3AED]" />
                Battle Stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-[#7C3AED]/20 bg-[#111126]/70 p-3">
                  <div className="text-gray-400">ELO</div>
                  <div className="mt-1 text-xl font-bold text-white">{player.eloRating ?? 1200}</div>
                </div>
                <div className="rounded-lg border border-[#7C3AED]/20 bg-[#111126]/70 p-3">
                  <div className="text-gray-400">Record</div>
                  <div className="mt-1 text-xl font-bold text-white">
                    {player.eloWins ?? 0}-{player.eloLosses ?? 0}
                  </div>
                </div>
                <div className="rounded-lg border border-[#7C3AED]/20 bg-[#111126]/70 p-3">
                  <div className="text-gray-400">Matches</div>
                  <div className="mt-1 text-xl font-bold text-white">{player.eloMatches ?? 0}</div>
                </div>
                <div className="rounded-lg border border-[#7C3AED]/20 bg-[#111126]/70 p-3">
                  <div className="text-gray-400">Role</div>
                  <div className="mt-1 text-xl font-bold text-white">
                    {player.isSpectator ? 'Spectator' : 'Producer'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoadingHeatmap ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#7C3AED]" />
            </div>
          ) : (
            <GenreHeatmap genrePerformance={genrePerformance} />
          )}

          {!player.isSpectator && (
            <div className="rounded-lg border border-[#7C3AED]/20 bg-[#111126]/70 p-3 text-sm text-gray-400">
              <div className="mb-1 flex items-center gap-2 text-white">
                <Music2 className="h-4 w-4 text-[#7C3AED]" />
                Current match
              </div>
              Board progress is shown in the arena. This profile keeps permanent stats and role context only.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
