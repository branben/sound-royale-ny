import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Music, Sparkles, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { THEMES, ThemeId, GENRES } from '@/types/game';

interface ThemeSelectorProps {
  selectedThemeId: ThemeId;
  onThemeChange: (themeId: ThemeId) => void;
  onCustomGenresChange?: (genres: string[]) => void;
  className?: string;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  selectedThemeId,
  onThemeChange,
  onCustomGenresChange,
  className
}) => {
  const [showCustomGenres, setShowCustomGenres] = useState(false);
  const [selectedCustomGenres, setSelectedCustomGenres] = useState<string[]>([]);

  const selectedTheme = THEMES.find(t => t.id === selectedThemeId);

  const handleGenreToggle = (genre: string) => {
    if (selectedCustomGenres.includes(genre)) {
      setSelectedCustomGenres(prev => prev.filter(g => g !== genre));
    } else if (selectedCustomGenres.length < 9) {
      setSelectedCustomGenres(prev => [...prev, genre]);
    }
  };

  useEffect(() => {
    if (onCustomGenresChange) {
      onCustomGenresChange(selectedCustomGenres);
    }
  }, [selectedCustomGenres, onCustomGenresChange]);

  return (
    <Card
      data-testid="theme-selector"
      className={cn(
        "bg-[#0F0F23]/60 border-[#7C3AED]/20",
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Music className="w-5 h-5 text-[#A78BFA]" />
          <h3 className="text-lg font-semibold text-white">Theme Selection</h3>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {THEMES.filter(t => t.id !== 'custom').map(theme => (
            <button
              key={theme.id}
              onClick={() => onThemeChange(theme.id as ThemeId)}
              className={cn(
                "relative p-3 rounded-lg border-2 transition-all",
                selectedThemeId === theme.id
                  ? "border-[#A78BFA] bg-[#7C3AED]/20"
                  : "border-[#7C3AED]/30 hover:border-[#7C3AED]/50"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">{theme.name}</span>
                {theme.bonusMultiplier > 1 && (
                  <Badge className="bg-[#F43F5E] text-white text-xs">
                    {theme.bonusMultiplier}x
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-400">{theme.description}</p>
            </button>
          ))}
        </div>

        <Button
          onClick={() => setShowCustomGenres(!showCustomGenres)}
          variant="outline"
          className={cn(
            "w-full mb-4",
            selectedThemeId === 'custom' && "bg-[#7C3AED] text-white border-[#7C3AED]"
          )}
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Custom Theme
        </Button>

        {showCustomGenres && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Select Genres ({selectedCustomGenres.length}/9)</span>
              <Zap className="w-4 h-4 text-[#A78BFA]" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {GENRES.map(genre => (
                <button
                  key={genre}
                  onClick={() => handleGenreToggle(genre)}
                  disabled={!selectedCustomGenres.includes(genre) && selectedCustomGenres.length >= 9}
                  className={cn(
                    "p-2 text-xs rounded border transition-all",
                    selectedCustomGenres.includes(genre)
                      ? "bg-[#7C3AED] text-white border-[#7C3AED]"
                      : "bg-[#0F0F23] text-gray-300 border-[#7C3AED]/30 hover:border-[#7C3AED]/50"
                  )}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
