import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import { THEMES, ThemeId } from '@/types/game';

interface ThemeSelectorProps {
  selectedThemeId: ThemeId;
  onThemeChange: (themeId: ThemeId) => void;
  onCustomGenresChange?: (genres: string[]) => void;
  className?: string;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  selectedThemeId,
  onThemeChange,
  className
}) => {
  return (
    <Card
      data-testid="theme-selector"
      className={cn(
        "bg-background/60 border-primary/20",
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Music className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-white">Theme Selection</h3>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEMES.map(theme => (
            <button
              key={theme.id}
              onClick={() => onThemeChange(theme.id as ThemeId)}
              className={cn(
                "relative p-3 rounded-lg border-2 transition-all",
                selectedThemeId === theme.id
                  ? "border-primary bg-primary/20"
                  : "border-primary/30 hover:border-primary/50"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">{theme.name}</span>
              </div>
              <p className="text-xs text-gray-400">{theme.description}</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
