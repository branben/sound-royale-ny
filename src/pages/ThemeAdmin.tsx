import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, Shield, Music, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { roomApi } from '@/services/api';
import { ThemeRotation } from '@/types/game';
import { toast } from 'sonner';

type RotationDraft = Pick<ThemeRotation, 'key' | 'name' | 'description' | 'genres'>;

const ADMIN_PIN = import.meta.env.VITE_THEME_ADMIN_PIN;

export default function ThemeAdmin() {
  const [pin, setPin] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [rotations, setRotations] = useState<RotationDraft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const hasInvalidDraft = useMemo(
    () => rotations.some(rotation =>
      rotation.genres.length !== 9 ||
      rotation.genres.some(genre => !genre.trim()) ||
      new Set(rotation.genres.map(genre => genre.trim().toLowerCase())).size !== 9
    ),
    [rotations]
  );

  useEffect(() => {
    if (!isUnlocked) return;

    let isActive = true;
    setIsLoading(true);
    roomApi.getThemeRotations()
      .then(data => {
        if (isActive) {
          setRotations(data.map(rotation => ({
            key: rotation.key,
            name: rotation.name,
            description: rotation.description,
            genres: rotation.genres.slice(0, 9),
          })));
        }
      })
      .catch(() => toast.error('Failed to load theme rotations'))
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
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

  const updateRotation = (key: ThemeRotation['key'], patch: Partial<RotationDraft>) => {
    setRotations(prev => prev.map(rotation =>
      rotation.key === key ? { ...rotation, ...patch } : rotation
    ));
  };

  const updateGenre = (key: ThemeRotation['key'], index: number, value: string) => {
    setRotations(prev => prev.map(rotation => {
      if (rotation.key !== key) return rotation;
      const genres = [...rotation.genres];
      genres[index] = value;
      return { ...rotation, genres };
    }));
  };

  const saveRotation = async (rotation: RotationDraft) => {
    const genres = rotation.genres.map(genre => genre.trim());
    if (genres.length !== 9 || genres.some(genre => !genre)) {
      toast.error('Each rotation needs exactly 9 genres');
      return;
    }
    if (new Set(genres.map(genre => genre.toLowerCase())).size !== 9) {
      toast.error('Genres must be unique within a rotation');
      return;
    }

    setSavingKey(rotation.key);
    try {
      const saved = await roomApi.updateThemeRotation(
        rotation.key,
        {
          name: rotation.name.trim(),
          description: rotation.description.trim(),
          genres,
        },
        pin
      );
      updateRotation(saved.key, {
        name: saved.name,
        description: saved.description,
        genres: saved.genres,
      });
      toast.success(`${saved.name} saved`);
    } catch {
      toast.error('Failed to save rotation. Check THEME_ADMIN_SECRET on the backend.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="min-h-dvh bg-background px-4 py-6 text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold font-['Righteous'] text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] to-[#F43F5E]">
              Theme Rotations
            </h1>
            <p className="text-sm text-muted-foreground">Edit Classic, Weekly Rotation, and Monthly Rotation for new rooms.</p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/admin/players">Player Admin</Link>
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Lobby
            </Link>
          </Button>
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
                <Label htmlFor="theme-admin-pin">Admin PIN</Label>
                <Input
                  id="theme-admin-pin"
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
                Unlock Editor
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {isLoading ? (
              <div className="flex min-h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#A78BFA]" />
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                {rotations.map(rotation => (
                  <Card key={rotation.key} className="border-[#7C3AED]/30 bg-[#0F0F23]/80">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Music className="h-5 w-5 text-[#A78BFA]" />
                        {rotation.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor={`${rotation.key}-name`}>Name</Label>
                        <Input
                          id={`${rotation.key}-name`}
                          value={rotation.name}
                          onChange={(event) => updateRotation(rotation.key, { name: event.target.value })}
                          className="bg-[#111126]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${rotation.key}-description`}>Description</Label>
                        <Input
                          id={`${rotation.key}-description`}
                          value={rotation.description}
                          onChange={(event) => updateRotation(rotation.key, { description: event.target.value })}
                          className="bg-[#111126]"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                        {rotation.genres.map((genre, index) => (
                          <div key={`${rotation.key}-${index}`} className="space-y-1">
                            <Label htmlFor={`${rotation.key}-genre-${index}`} className="text-xs">
                              Genre {index + 1}
                            </Label>
                            <Input
                              id={`${rotation.key}-genre-${index}`}
                              value={genre}
                              onChange={(event) => updateGenre(rotation.key, index, event.target.value)}
                              className="bg-[#111126]"
                            />
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={() => saveRotation(rotation)}
                        disabled={savingKey === rotation.key || hasInvalidDraft}
                        className="h-11 w-full"
                      >
                        {savingKey === rotation.key ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Save Rotation
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
