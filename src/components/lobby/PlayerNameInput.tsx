import React from 'react';
import { Input } from '@/components/ui/input';

interface PlayerNameInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function PlayerNameInput({ value, onChange, disabled }: PlayerNameInputProps) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground text-center block">
        Your Name
      </label>
      <Input
        data-testid="player-name-input"
        type="text"
        placeholder="Enter your producer name"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 20))}
        className="text-center text-xl h-14 bg-background/50 border-2 border-muted-foreground/30 focus:border-primary focus:ring-2 focus:ring-ring transition-all duration-200 font-semibold"
        maxLength={20}
        disabled={disabled}
      />
    </div>
  );
}
