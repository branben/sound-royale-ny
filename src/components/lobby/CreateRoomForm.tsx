import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Loader2 } from 'lucide-react';
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
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
      <div className="space-y-2">
        <Input
          data-testid="create-room-name-input"
          type="text"
          placeholder="Room name"
          value={roomNameInput}
          onChange={(e) => onRoomNameChange(e.target.value.slice(0, 30))}
          className="text-center text-xl h-12 bg-card/50 border-primary/30 focus:border-primary focus:ring-2 focus:ring-ring transition-all duration-200"
          maxLength={30}
        />
      </div>

      <ThemeSelector
        selectedThemeId={selectedThemeId}
        onThemeChange={onThemeChange}
        onCustomGenresChange={onCustomGenresChange}
      />

      <Button
        data-testid="create-room-submit-button"
        onClick={onCreate}
        disabled={!roomNameInput.trim() || isLoading}
        className="w-full h-12 text-lg font-semibold bg-primary hover:opacity-90"
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
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm text-center">
          {error}
        </div>
      )}

      <button
        onClick={onBack}
        className="w-full text-sm text-foreground/50 hover:text-foreground transition-colors"
      >
        &larr; Back
      </button>
    </div>
  );
}
