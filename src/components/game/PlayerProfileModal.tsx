import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Wifi, WifiOff, Trophy, TrendingUp, Clock } from 'lucide-react';
import { Player, ScoreInfo } from '@/types/game';
import { cn } from '@/lib/utils';

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
        className="bg-[#0F0F23]/95 backdrop-blur-xl border-[#7C3AED]/30 max-w-md"
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
                  <CardTitle className="text-xl text-white">{player.name}</CardTitle>
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

          {/* Board Preview (for producers) */}
          {!player.isSpectator && player.board && player.board.tiles.length > 0 && (
            <Card className="bg-[#0F0F23]/60 border-[#7C3AED]/20">
              <CardHeader>
                <CardTitle className="text-lg text-white">Board Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {player.board.tiles.slice(0, 9).map((tile, index) => (
                    <div
                      key={tile.id}
                      className={cn(
                        "aspect-square rounded-md border flex items-center justify-center text-xs font-medium",
                        tile.status === 'complete'
                          ? "bg-[#7C3AED]/30 border-[#7C3AED]/50 text-[#7C3AED]"
                          : "bg-gray-800/50 border-gray-700/50 text-gray-500"
                      )}
                    >
                      {tile.status === 'complete' ? '✓' : index + 1}
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-center text-sm text-gray-400">
                  {player.board.tiles.filter(t => t.status === 'complete').length} / {player.board.tiles.length} tiles complete
                </div>
              </CardContent>
            </Card>
          )}

          {/* ELO Rating (placeholder for future backend) */}
          <Card className="bg-[#0F0F23]/60 border-[#7C3AED]/20">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[#7C3AED]" />
                ELO Rating
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-4">
                <div className="text-3xl font-bold text-gray-500">---</div>
                <div className="text-sm text-gray-500 mt-1">Not available yet</div>
              </div>
            </CardContent>
          </Card>

          {/* Match History (placeholder for future backend) */}
          <Card className="bg-[#0F0F23]/60 border-[#7C3AED]/20">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#7C3AED]" />
                Match History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-4">
                <div className="text-sm text-gray-500">No match history available</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
