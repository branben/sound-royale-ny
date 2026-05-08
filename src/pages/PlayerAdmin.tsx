import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Search, Shield, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Player } from '@/types/game';
import { gameApi } from '@/services/api';
import { TitleBadge } from '@/components/game/TitleBadge';
import { toast } from 'sonner';

const ADMIN_PIN = import.meta.env.VITE_THEME_ADMIN_PIN;

export default function PlayerAdmin() {
  const [pin, setPin] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const filteredPlayers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return players;
    return players.filter(player => player.name.toLowerCase().includes(query));
  }, [players, searchQuery]);

  useEffect(() => {
    if (!isUnlocked) return;

    setIsLoading(true);
    gameApi.getAllPlayers()
      .then(setPlayers)
      .catch(() => toast.error('Failed to load players'))
      .finally(() => setIsLoading(false));
  }, [isUnlocked]);

  const unlock = () => {
    if (!ADMIN_PIN) {
      toast.error('Admin PIN is not configured');
      return;
    }
    if (pin !== ADMIN_PIN) {
      toast.error('Invalid admin PIN');
      return;
    }
    setIsUnlocked(true);
  };

  const updateCheckedIn = async (player: Player, isCheckedIn: boolean) => {
    setSavingId(player.id);
    try {
      const updated = await gameApi.setCheckedIn(player.id, isCheckedIn, pin);
      setPlayers(prev => prev.map(entry => entry.id === updated.id ? updated : entry));
      toast.success(`${updated.name} updated`);
    } catch {
      toast.error('Failed to update player title');
    } finally {
      setSavingId(null);
    }
  };

  const toggleSelected = (playerId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const applyBulkCheckedIn = async (isCheckedIn: boolean) => {
    const selectedPlayers = players.filter(player => selectedIds.has(player.id));
    if (selectedPlayers.length === 0) return;

    setIsLoading(true);
    try {
      const updatedPlayers = await Promise.all(
        selectedPlayers.map(player => gameApi.setCheckedIn(player.id, isCheckedIn, pin))
      );
      const updatedById = new Map(updatedPlayers.map(player => [player.id, player]));
      setPlayers(prev => prev.map(player => updatedById.get(player.id) ?? player));
      setSelectedIds(new Set());
      toast.success(`${updatedPlayers.length} player${updatedPlayers.length === 1 ? '' : 's'} updated`);
    } catch {
      toast.error('Bulk update failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background px-4 py-6 text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold font-['Righteous'] text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] to-[#F43F5E]">
              Player Admin
            </h1>
            <p className="text-sm text-muted-foreground">Manage Checked In status for producers and spectators.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline">
              <Link to="/admin/themes">Theme Admin</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Lobby
              </Link>
            </Button>
          </div>
        </header>

        {!isUnlocked ? (
          <Card className="mx-auto w-full max-w-md border-[#7C3AED]/30 bg-[#0F0F23]/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-[#A78BFA]" />
                Admin Access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="player-admin-pin">Admin PIN</Label>
                <Input
                  id="player-admin-pin"
                  type="password"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') unlock();
                  }}
                  placeholder="Enter admin PIN"
                  className="bg-[#111126]"
                />
              </div>
              <Button onClick={unlock} className="h-11 w-full">
                Unlock Player Admin
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-[#7C3AED]/30 bg-[#0F0F23]/80">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#A78BFA]" />
                  Players
                </CardTitle>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    disabled={selectedIds.size === 0 || isLoading}
                    onClick={() => applyBulkCheckedIn(true)}
                  >
                    Check In Selected
                  </Button>
                  <Button
                    variant="outline"
                    disabled={selectedIds.size === 0 || isLoading}
                    onClick={() => applyBulkCheckedIn(false)}
                  >
                    Clear Selected
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search players..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="bg-[#111126] pl-10"
                />
              </div>

              {isLoading ? (
                <div className="flex min-h-40 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#A78BFA]" />
                </div>
              ) : (
                <div className="divide-y divide-[#7C3AED]/20 rounded-lg border border-[#7C3AED]/20">
                  {filteredPlayers.map(player => (
                    <div key={player.id} className="flex items-center gap-3 p-3">
                      <input
                        aria-label={`Select ${player.name}`}
                        type="checkbox"
                        checked={selectedIds.has(player.id)}
                        onChange={() => toggleSelected(player.id)}
                        className="h-4 w-4 accent-[#7C3AED]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{player.name}</span>
                          <TitleBadge title={player.currentTitle} compact />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {player.isSpectator ? 'Spectator' : 'Producer'} · ELO {player.eloRating ?? 1200}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={player.isCheckedIn ? 'default' : 'outline'}
                        disabled={savingId === player.id}
                        onClick={() => updateCheckedIn(player, !player.isCheckedIn)}
                      >
                        {savingId === player.id && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                        {player.isCheckedIn ? 'Checked In' : 'Check In'}
                      </Button>
                    </div>
                  ))}
                  {filteredPlayers.length === 0 && (
                    <div className="p-6 text-center text-sm text-muted-foreground">No players found</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
