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
          <Music className="h-5 w-5 text-[#7C3AED]" />
          <div>
            <div className="text-sm text-gray-400">Game Theme</div>
            <div className="text-lg font-bold text-white">
              {selectedTheme?.name || 'Select Theme'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => {
                onThemeChange(theme.id as ThemeId);
                setShowCustomGenres(false);
              }}
              className={cn(
                "p-3 rounded-lg border-2 text-left transition-all duration-200",
                selectedThemeId === theme.id
                  ? "border-[#7C3AED] bg-[#7C3AED]/20 shadow-[0_0_15px_rgba(124,58,237,0.3)]"
                  : "border-[#7C3AED]/30 hover:border-[#7C3AED]/60 hover:bg-[#7C3AED]/10"
              )}
            >
              <div className="font-semibold text-white text-sm">{theme.name}</div>
              <div className="text-xs text-gray-400 mt-1">{theme.description}</div>
              {theme.bonusMultiplier > 1.0 && (
                <Badge
                  variant="secondary"
                  className="mt-2 bg-[#F43F5E]/20 text-[#F43F5E] border-[#F43F5E]/30 text-xs"
                >
                  <Zap className="h-3 w-3 mr-1" />
                  {theme.bonusMultiplier}x
                </Badge>
              )}
            </button>
          ))}
        </div>

        {selectedThemeId === 'custom' && (
          <div className="mt-4 pt-4 border-t border-[#7C3AED]/20">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-400">Custom Genres</div>
              <Badge variant="outline" className="text-xs">
                {selectedCustomGenres.length}/9
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {GENRES.map((genre) => (
                <button
                  key={genre}
                  onClick={() => handleGenreToggle(genre)}
                  disabled={!selectedCustomGenres.includes(genre) && selectedCustomGenres.length >= 9}
                  className={cn(
                    "px-3 py-2 rounded-md text-xs font-medium transition-all duration-200 border",
                    selectedCustomGenres.includes(genre)
                      ? "bg-[#7C3AED] text-white border-[#7C3AED]"
                      : "bg-[#0F0F23]/50 text-gray-400 border-[#7C3AED]/30 hover:border-[#7C3AED]/60"
                  )}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedTheme && (
          <div className="mt-4 pt-4 border-t border-[#7C3AED]/20">
            <div className="text-xs text-gray-400 mb-2">Genres in this theme:</div>
            <div className="flex flex-wrap gap-1">
              {selectedTheme.genres.map((genre) => (
                <Badge
                  key={genre}
                  variant="secondary"
                  className="bg-[#7C3AED]/20 text-[#7C3AED] border-[#7C3AED]/30 text-xs"
                >
                  {genre}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
