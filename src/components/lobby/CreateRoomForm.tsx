import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Loader2, ArrowLeft } from 'lucide-react';
import { ThemeSelector } from '@/components/game/ThemeSelector';
import { ThemeId } from '@/types/game';

interface CreateRoomFormProps {
  roomNameInput: string;
  selectedThemeId: ThemeId;
  selectedCustomGenres: string[];
  isLoading: boolean;
  error: string | null;
  onRoomNameChange: (value: string) => void;
  onThemeChange: (themeId: ThemeId) => void;
  onCustomGenresChange: (genres: string[]) => void;
  onCreate: () => void;
  onBack: () => void;
}

export function CreateRoomForm({
  roomNameInput,
  selectedThemeId,
  selectedCustomGenres,
  isLoading,
  error,
  onRoomNameChange,
  onThemeChange,
  onCustomGenresChange,
  onCreate,
  onBack,
}: CreateRoomFormProps) {
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
      <div className="space-y-3">
        <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground text-center block">
          Room Name
        </label>
        <Input
          data-testid="create-room-name-input"
          type="text"
          placeholder="e.g. Friday Night Beats"
          value={roomNameInput}
          onChange={(e) => onRoomNameChange(e.target.value.slice(0, 30))}
          className="text-center text-xl h-14 bg-background/50 border-2 border-muted-foreground/30 focus:border-primary focus:ring-2 focus:ring-ring transition-all duration-200 font-semibold"
          maxLength={30}
        />
      </div>

      <div className="space-y-3">
        <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground text-center block">
          Theme
        </label>
        <ThemeSelector
          selectedThemeId={selectedThemeId}
          onThemeChange={onThemeChange}
          onCustomGenresChange={onCustomGenresChange}
        />
      </div>

      <Button
        data-testid="create-room-submit-button"
        onClick={onCreate}
        disabled={!roomNameInput.trim() || isLoading}
        className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all duration-200"
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
        <div className="p-3 rounded-lg bg-destructive/10 border-2 border-destructive/30 text-destructive text-sm text-center font-medium">
          {error}
        </div>
      )}

      <Button
        onClick={onBack}
        variant="ghost"
        size="sm"
        className="w-full text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Lobby
      </Button>
    </div>
  );
}
